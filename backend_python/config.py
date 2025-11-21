import os
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

class Settings:
    """
    환경 변수 관리 클래스
    """
    XI_API_KEY: str = os.getenv("XI_API_KEY")

    # 현재 디렉토리에 .env가 없을 경우, 상위 디렉토리(프로젝트 루트)에서 찾기 시도
    if not XI_API_KEY:
        load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))
        XI_API_KEY = os.getenv("XI_API_KEY")

settings = Settings()
