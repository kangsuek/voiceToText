"""
Configuration settings for Whisper Local backend
"""
from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """
    애플리케이션 설정 클래스
    환경 변수 또는 .env 파일에서 값을 읽어옵니다.
    """
    
    # Whisper Model Settings
    MODEL_SIZE: str = "base"  # tiny, base, small, medium, large-v3
    DEVICE: str = "cpu"  # cpu or cuda
    COMPUTE_TYPE: str = "int8"  # int8, int8_float16, float16, float32
    
    # Server Settings
    BACKEND_PORT: int = 8001
    FRONTEND_URL: str = "http://localhost:5174"
    
    # CORS Settings
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 싱글톤 인스턴스 생성
settings = Settings()
