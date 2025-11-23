"""
Faster-Whisper 음성 인식 서비스
"""
from faster_whisper import WhisperModel
from typing import List, Dict, Any, Optional
import logging
import tempfile
import os

logger = logging.getLogger(__name__)


class WhisperService:
    """
    Faster-Whisper 모델을 관리하고 음성 인식을 수행하는 서비스 클래스
    """
    
    def __init__(self, model_size: str = "base", device: str = "cpu", compute_type: str = "int8"):
        """
        WhisperService 초기화
        
        Args:
            model_size: 모델 크기 (tiny, base, small, medium, large-v3)
            device: 실행 디바이스 (cpu, cuda)
            compute_type: 연산 타입 (int8, int8_float16, float16, float32)
        """
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model: Optional[WhisperModel] = None
        
        logger.info(f"WhisperService 초기화: model={model_size}, device={device}, compute_type={compute_type}")
    
    @property
    def model(self) -> WhisperModel:
        """
        모델 인스턴스를 반환 (Lazy Loading)
        처음 호출 시에만 모델을 로드하고, 이후에는 캐시된 인스턴스를 재사용합니다.
        """
        if self._model is None:
            logger.info(f"Whisper 모델 로딩 중... (최초 실행 시 모델 다운로드로 시간이 걸릴 수 있습니다)")
            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type
            )
            logger.info("✅ Whisper 모델 로딩 완료")
        return self._model
    
    async def transcribe_audio(
        self,
        audio_content: bytes,
        filename: str,
        language: Optional[str] = None,
        beam_size: int = 5,
        word_timestamps: bool = True
    ) -> Dict[str, Any]:
        """
        오디오 파일을 텍스트로 변환
        
        Args:
            audio_content: 오디오 파일의 바이너리 데이터
            filename: 파일명 (확장자 포함)
            language: 언어 코드 (예: 'ko', 'en'). None이면 자동 감지
            beam_size: 빔 서치 크기 (높을수록 정확하지만 느림)
            word_timestamps: 단어별 타임스탬프 포함 여부
        
        Returns:
            Dict containing:
                - text: 전체 텍스트
                - language: 감지된 언어
                - language_probability: 언어 감지 확률
                - segments: 세그먼트 리스트 (타임스탬프 포함)
                - words: 단어 리스트 (word_timestamps=True인 경우)
        """
        logger.info(f"음성 인식 시작: {filename}, language={language or 'auto'}")
        
        # 임시 파일로 저장 (faster-whisper는 파일 경로를 요구함)
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as temp_file:
            temp_file.write(audio_content)
            temp_path = temp_file.name
        
        try:
            # Whisper 모델로 음성 인식 수행
            segments_generator, info = self.model.transcribe(
                temp_path,
                language=language,
                beam_size=beam_size,
                word_timestamps=word_timestamps,
                vad_filter=False,  # VAD 필터 비활성화 (조용한 음성도 처리)
            )
            
            logger.info(f"감지된 언어: {info.language} (확률: {info.language_probability:.2f})")
            
            # Generator를 리스트로 변환하여 실제 처리 수행
            segments_list = list(segments_generator)
            logger.info(f"세그먼트 수: {len(segments_list)}")
            
            # 전체 텍스트 생성
            full_text = " ".join([segment.text.strip() for segment in segments_list])
            logger.info(f"전체 텍스트 길이: {len(full_text)}, 내용: '{full_text[:100]}'...")
            
            # 세그먼트 데이터 포맷팅
            formatted_segments = []
            all_words = []
            
            for segment in segments_list:
                segment_data = {
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip()
                }
                formatted_segments.append(segment_data)
                
                # 단어별 타임스탬프가 있는 경우
                if word_timestamps and segment.words:
                    for word in segment.words:
                        word_data = {
                            "word": word.word,
                            "start": word.start,
                            "end": word.end,
                            "probability": word.probability
                        }
                        all_words.append(word_data)
            
            logger.info(f"✅ 음성 인식 완료: {len(formatted_segments)}개 세그먼트, {len(all_words)}개 단어")
            
            result = {
                "text": full_text,
                "language": info.language,
                "language_probability": float(info.language_probability),
                "segments": formatted_segments,
                "words": all_words if word_timestamps else []
            }
            
            return result
            
        finally:
            # 디버깅을 위해 임시 파일 유지 (나중에 삭제 가능)
            logger.info(f"임시 오디오 파일 저장됨: {temp_path}")
            # if os.path.exists(temp_path):
            #     os.unlink(temp_path)
            #     logger.debug(f"임시 파일 삭제: {temp_path}")


# 싱글톤 인스턴스 (앱 시작 시 한 번만 생성)
_whisper_service_instance: Optional[WhisperService] = None


def get_whisper_service(model_size: str = "base", device: str = "cpu", compute_type: str = "int8") -> WhisperService:
    """
    WhisperService 싱글톤 인스턴스를 반환
    """
    global _whisper_service_instance
    
    if _whisper_service_instance is None:
        _whisper_service_instance = WhisperService(model_size, device, compute_type)
    
    return _whisper_service_instance
