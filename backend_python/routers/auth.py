from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from ..services.elevenlabs import get_realtime_token, transcribe_with_speakers, group_by_speaker
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

router = APIRouter()

# --- Pydantic Models ---

class TokenResponse(BaseModel):
    token: str

class SpeakerSegment(BaseModel):
    speaker: str
    start: float
    end: float
    text: str

class TranscriptionResponse(BaseModel):
    success: bool
    fullTranscript: str
    speakers: List[SpeakerSegment]
    words: List[Dict[str, Any]]

# --- Endpoints ---

@router.get("/token", response_model=TokenResponse, summary="실시간 API 토큰 발급")
async def get_token():
    """
    ElevenLabs Realtime API 접속을 위한 일회용 토큰을 발급합니다.
    
    - **Returns**:
        - `token`: WebSocket 연결에 사용할 인증 토큰
    """
    try:
        token_data = await get_realtime_token()
        return token_data
    except ValueError as e:
        # API 키 설정 누락 등 설정 오류
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        # 외부 API 호출 실패 등 기타 오류
        raise HTTPException(status_code=500, detail=str(e))


import logging

# 로거 설정
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

@router.post("/transcribe", response_model=TranscriptionResponse, summary="오디오 화자 분리 및 텍스트 변환")
async def transcribe_with_speaker_diarization(
    audio: UploadFile = File(..., description="분석할 오디오 파일 (WebM, MP3, WAV 등)"),
    language: Optional[str] = Form(None, description="오디오 언어 코드 (예: ko, en). 생략 시 자동 감지.")
) -> TranscriptionResponse:
    """
    업로드된 오디오 파일을 분석하여 화자 분리(Speaker Diarization)된 텍스트를 반환합니다.
    
    - **Parameters**:
        - `audio`: 오디오 파일 바이너리
        - `language`: (Optional) 언어 코드
    
    - **Returns**:
        - `success`: 성공 여부
        - `fullTranscript`: 전체 통합 텍스트
        - `speakers`: 화자별 분리된 텍스트 세그먼트 리스트
        - `words`: 타임스탬프가 포함된 개별 단어 리스트
    """
    logger.info("\n=== 화자 분리 API 호출 시작 ===")
    logger.info(f"파일명: {audio.filename}")
    logger.info(f"Content-Type: {audio.content_type}")
    logger.info(f"언어: {language or '자동 감지'}")

    try:
        # 오디오 파일 읽기
        audio_content = await audio.read()
        logger.info(f"오디오 파일 크기: {len(audio_content)} bytes")

        # ElevenLabs API로 화자 분리 요청
        logger.info("ElevenLabs API 요청 중...")
        transcription_data = await transcribe_with_speakers(
            audio_content,
            audio.filename or 'audio.webm',
            language
        )

        logger.info(f"API 응답 받음:")
        logger.info(f"  - 전체 텍스트 길이: {len(transcription_data.get('text', ''))}")
        logger.info(f"  - 단어 개수: {len(transcription_data.get('words', []))}")

        # words 배열의 첫 몇 개 확인
        words = transcription_data.get('words', [])
        if words:
            logger.info(f"  - 첫 3개 단어 샘플:")
            for i, word in enumerate(words[:3]):
                logger.info(f"    {i+1}. {word}")

        # 화자별로 텍스트 그룹화
        speakers = group_by_speaker(transcription_data)
        logger.info(f"화자 그룹화 완료: {len(speakers)}개 세그먼트")

        for i, speaker in enumerate(speakers[:3]):
            logger.info(f"  세그먼트 {i+1}: 화자={speaker['speaker']}, 텍스트={speaker['text'][:50]}...")

        result = {
            "success": True,
            "fullTranscript": transcription_data.get('text', ''),
            "speakers": speakers,
            "words": transcription_data.get('words', [])
        }

        logger.info("=== 화자 분리 API 완료 ===\n")
        return result

    except ValueError as e:
        error_msg = str(e)
        logger.error(f"❌ ValueError: {error_msg}")
        # 사용자 친화적인 에러 메시지
        if "API" in error_msg or "KEY" in error_msg:
            raise HTTPException(status_code=500, detail="API 인증에 실패했습니다. 서버 설정을 확인해주세요.")
        raise HTTPException(status_code=500, detail="오디오 처리 중 오류가 발생했습니다.")
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ Exception: {error_msg}")
        import traceback
        logger.error(traceback.format_exc())

        # 구체적인 에러 메시지 제공
        if "timeout" in error_msg.lower():
            raise HTTPException(status_code=504, detail="처리 시간이 초과되었습니다. 오디오 파일이 너무 큽니다.")
        elif "connection" in error_msg.lower():
            raise HTTPException(status_code=503, detail="외부 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.")
        else:
            raise HTTPException(status_code=500, detail="화자 분리 처리 중 오류가 발생했습니다.")
