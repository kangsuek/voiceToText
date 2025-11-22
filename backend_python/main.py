from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth
from .config import settings

# FastAPI 앱 초기화
app = FastAPI(title="ElevenLabs Realtime Transcription Backend")

# CORS (Cross-Origin Resource Sharing) 설정
# 환경에 따라 허용할 오리진 설정
if settings.ENVIRONMENT == "production":
    # 프로덕션: 특정 도메인만 허용
    allowed_origins = [settings.FRONTEND_URL]
else:
    # 개발: 로컬 개발 환경 허용
    allowed_origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# 라우터 등록 (API 엔드포인트 연결)
app.include_router(auth.router, prefix="/api")

@app.get("/")
async def root():
    """
    서버 상태 확인용 루트 엔드포인트
    """
    return {"message": "ElevenLabs Transcription Backend (Python/FastAPI)가 실행 중입니다!"}

if __name__ == "__main__":
    import uvicorn
    # 서버 실행 (호스트: 0.0.0.0, 포트: 8000)
    uvicorn.run("backend_python.main:app", host="0.0.0.0", port=8000, reload=True)
