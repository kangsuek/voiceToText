"""
음성 인식 API 라우터
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import logging

from services.whisper_service import get_whisper_service
from config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

# Pydantic Models
class SegmentData(BaseModel):
    """세그먼트 데이터 모델"""
    start: float
    end: float
    text: str

class WordData(BaseModel):
    """단어 데이터 모델"""
    word: str
    start: float
    end: float
    probability: float

class TranscriptionResponse(BaseModel):
    """음성 인식 결과 응답 모델"""
    success: bool
    text: str
    language: str
    language_probability: float
    segments: List[SegmentData]
    words: List[WordData]

@router.post("/transcribe", response_model=TranscriptionResponse, summary="오디오 파일 음성 인식")
async def transcribe_audio(
    audio: UploadFile = File(..., description="음성 인식할 오디오 파일"),
    language: Optional[str] = Form(None, description="언어 코드 (예: ko, en). 생략 시 자동 감지")
) -> TranscriptionResponse:
    """
    **업로드된 오디오 파일을 텍스트로 변환합니다.**
    
    Faster-Whisper를 사용하여 로컬에서 음성 인식을 수행합니다.
    
    - **Parameters**:
        - `audio`: 오디오 파일 (WebM, MP3, WAV 등)
        - `language`: (Optional) 언어 코드. 지정하지 않으면 자동 감지
    
    - **Returns**:
        - `success`: 성공 여부
        - `text`: 전체 텍스트
        - `language`: 감지된 언어
        - `language_probability`: 언어 감지 확률
        - `segments`: 타임스탬프가 포함된 세그먼트 리스트
        - `words`: 단어별 타임스탬프 리스트
    """
    logger.info("\n=== 음성 인식 API 호출 시작 ===")
    logger.info(f"파일명: {audio.filename}")
    logger.info(f"Content-Type: {audio.content_type}")
    logger.info(f"언어: {language or '자동 감지'}")
    
    try:
        # 오디오 파일 읽기
        audio_content = await audio.read()
        logger.info(f"오디오 파일 크기: {len(audio_content)} bytes")
        
        # Whisper 서비스 가져오기
        whisper_service = get_whisper_service(
            model_size=settings.MODEL_SIZE,
            device=settings.DEVICE,
            compute_type=settings.COMPUTE_TYPE
        )
        
        # 음성 인식 수행
        logger.info("Whisper 모델로 음성 인식 중...")
        result = await whisper_service.transcribe_audio(
            audio_content=audio_content,
            filename=audio.filename or "audio.webm",
            language=language,
            beam_size=5,
            word_timestamps=True
        )
        
        logger.info(f"✅ 음성 인식 완료")
        logger.info(f"  - 텍스트 길이: {len(result['text'])}")
        logger.info(f"  - 세그먼트 수: {len(result['segments'])}")
        logger.info(f"  - 단어 수: {len(result['words'])}")
        logger.info("=== 음성 인식 API 완료 ===\n")
        
        return {
            "success": True,
            **result
        }
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ 음성 인식 오류: {error_msg}")
        import traceback
        logger.error(traceback.format_exc())
        
        if "timeout" in error_msg.lower():
            raise HTTPException(status_code=504, detail="처리 시간이 초과되었습니다.")
        elif "memory" in error_msg.lower():
            raise HTTPException(status_code=507, detail="메모리가 부족합니다. 더 작은 모델을 사용해보세요.")
        else:
            raise HTTPException(status_code=500, detail=f"음성 인식 중 오류가 발생했습니다: {error_msg}")

@router.get("/health", summary="서버 상태 확인")
async def health_check():
    """
    서버 및 모델 상태 확인
    """
    return {
        "status": "healthy",
        "model_size": settings.MODEL_SIZE,
        "device": settings.DEVICE,
        "compute_type": settings.COMPUTE_TYPE
    }
