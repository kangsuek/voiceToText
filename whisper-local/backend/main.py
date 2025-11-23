"""
Whisper Local Backend - FastAPI 서버
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import transcribe
from config import settings

# FastAPI 앱 초기화
app = FastAPI(
    title="Whisper Local Backend",
    description="Faster-Whisper를 사용한 로컬 음성 인식 백엔드 서버",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(transcribe.router, prefix="/api")

# 루트 엔드포인트
@app.get("/")
async def root():
    """
    서버 상태 확인용 루트 엔드포인트
    """
    return {
        "message": "Whisper Local Backend (Faster-Whisper)가 실행 중입니다!",
        "model": settings.MODEL_SIZE,
        "device": settings.DEVICE
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=settings.BACKEND_PORT,
        reload=True
    )
