import os
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

class Settings:
    """
    환경 변수 관리 클래스
    """
    XI_API_KEY: str = os.getenv("XI_API_KEY")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")  # development, production
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    ALLOWED_ORIGINS: list = ["*"]

    def __init__(self):
        # 현재 디렉토리에 .env가 없을 경우, 상위 디렉토리(프로젝트 루트)에서 찾기 시도
        if not self.XI_API_KEY:
            load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))
            self.XI_API_KEY = os.getenv("XI_API_KEY")
            self.ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
            self.FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
        
        # ALLOWED_ORIGINS 설정
        origins_str = os.getenv("ALLOWED_ORIGINS")
        if origins_str:
            self.ALLOWED_ORIGINS = [origin.strip() for origin in origins_str.split(",")]
        else:
            # 기본값 (개발 환경)
            self.ALLOWED_ORIGINS = [
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:3000",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5174",
                "http://127.0.0.1:3000",
            ]
            # 프로덕션 환경이고 FRONTEND_URL이 설정되어 있으면 추가
            if self.ENVIRONMENT == "production" and self.FRONTEND_URL:
                if self.FRONTEND_URL not in self.ALLOWED_ORIGINS:
                    self.ALLOWED_ORIGINS.append(self.FRONTEND_URL)

settings = Settings()
