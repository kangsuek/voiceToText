from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from services.elevenlabs import get_realtime_token, transcribe_with_speakers, group_by_speaker
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

router = APIRouter()

# --- Pydantic Models (데이터 모델 정의) ---
# API 요청 및 응답 데이터의 구조와 타입을 정의하여 유효성 검사를 수행합니다.

class TokenResponse(BaseModel):
    """토큰 발급 응답 모델"""
    token: str  # WebSocket 연결용 인증 토큰

class SpeakerSegment(BaseModel):
    """화자별 텍스트 세그먼트 모델"""
    speaker: str  # 화자 식별자 (예: Speaker A)
    start: float  # 시작 시간 (초)
    end: float    # 종료 시간 (초)
    text: str     # 해당 구간의 텍스트

class TranscriptionResponse(BaseModel):
    """화자 분리 결과 응답 모델"""
    success: bool                   # 처리 성공 여부
    fullTranscript: str             # 전체 통합 텍스트
    speakers: List[SpeakerSegment]  # 화자별 분리된 텍스트 리스트
    words: List[Dict[str, Any]]     # 개별 단어 및 타임스탬프 정보

# --- Endpoints (API 엔드포인트) ---

@router.get("/token", response_model=TokenResponse, summary="실시간 API 토큰 발급")
async def get_token():
    """
    **ElevenLabs Realtime API 접속을 위한 일회용 토큰을 발급합니다.**
    
    프론트엔드에서 API Key를 직접 노출하지 않고, 백엔드를 통해 안전하게 토큰을 발급받아
    WebSocket 연결에 사용합니다.
    
    - **Returns**:
        - `token`: WebSocket 연결 URL 생성에 사용할 인증 토큰
    """
    try:
        # ElevenLabs API를 호출하여 토큰 생성
        token_data = await get_realtime_token()
        return token_data
    except ValueError as e:
        # API 키 설정 누락 등 설정 오류 처리
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        # 외부 API 호출 실패 등 기타 오류 처리
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
    **업로드된 오디오 파일을 분석하여 화자 분리(Speaker Diarization)된 텍스트를 반환합니다.**
    
    1. 프론트엔드에서 녹음된 오디오 파일(Blob)을 수신합니다.
    2. ElevenLabs Speech-to-Text API를 호출하여 텍스트 변환 및 화자 분리를 수행합니다.
    3. 결과를 파싱하여 화자별 세그먼트와 전체 텍스트를 반환합니다.
    
    - **Parameters**:
        - `audio`: 오디오 파일 바이너리 (Multipart/form-data)
        - `language`: (Optional) 언어 코드. 지정하지 않으면 AI가 자동으로 감지합니다.
    
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
        # 1. 오디오 파일 읽기
        # UploadFile 객체에서 바이너리 데이터를 비동기로 읽어옵니다.
        audio_content = await audio.read()
        logger.info(f"오디오 파일 크기: {len(audio_content)} bytes")

        # 2. ElevenLabs API로 화자 분리 요청
        # services/elevenlabs.py에 정의된 함수를 호출합니다.
        logger.info("ElevenLabs API 요청 중...")
        transcription_data = await transcribe_with_speakers(
            audio_content,
            audio.filename or 'audio.webm',
            language
        )

        logger.info(f"API 응답 받음:")
        logger.info(f"  - 전체 텍스트 길이: {len(transcription_data.get('text', ''))}")
        logger.info(f"  - 단어 개수: {len(transcription_data.get('words', []))}")

        # 디버깅용: words 배열의 첫 몇 개 확인
        words = transcription_data.get('words', [])
        if words:
            logger.info(f"  - 첫 3개 단어 샘플:")
            for i, word in enumerate(words[:3]):
                logger.info(f"    {i+1}. {word}")

        # 3. 화자별로 텍스트 그룹화
        # API 응답의 단어 단위 데이터를 화자별 문장/세그먼트로 재구성합니다.
        speakers = group_by_speaker(transcription_data)
        logger.info(f"화자 그룹화 완료: {len(speakers)}개 세그먼트")

        for i, speaker in enumerate(speakers[:3]):
            logger.info(f"  세그먼트 {i+1}: 화자={speaker['speaker']}, 텍스트={speaker['text'][:50]}...")

        # 4. 결과 반환
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
        # API 키 오류 등 인증 관련 문제 처리
        if "API" in error_msg or "KEY" in error_msg:
            raise HTTPException(status_code=500, detail="API 인증에 실패했습니다. 서버 설정을 확인해주세요.")
        raise HTTPException(status_code=500, detail="오디오 처리 중 오류가 발생했습니다.")
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ Exception: {error_msg}")
        import traceback
        logger.error(traceback.format_exc())

        # 구체적인 에러 메시지 제공 및 상태 코드 매핑
        if "timeout" in error_msg.lower():
            raise HTTPException(status_code=504, detail="처리 시간이 초과되었습니다. 오디오 파일이 너무 큽니다.")
        elif "connection" in error_msg.lower():
            raise HTTPException(status_code=503, detail="외부 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.")
        else:
            raise HTTPException(status_code=500, detail="화자 분리 처리 중 오류가 발생했습니다.")
