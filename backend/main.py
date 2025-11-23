from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth
from config import settings

# --- FastAPI 앱 초기화 ---
# title: API 문서(Swagger UI)에 표시될 제목
# description: API의 목적과 기능에 대한 설명
# version: API 버전 정보
app = FastAPI(
    title="ElevenLabs Realtime Transcription Backend",
    description="ElevenLabs Realtime API를 활용한 실시간 음성 인식 및 화자 분리 백엔드 서버입니다.",
    version="1.0.0"
)

# --- CORS (Cross-Origin Resource Sharing) 설정 ---
# 프론트엔드(React)가 다른 도메인/포트에서 실행되더라도 백엔드 API를 호출할 수 있도록 허용합니다.
# settings.ALLOWED_ORIGINS에 정의된 도메인들만 접근을 허용하여 보안을 강화합니다.
allowed_origins = settings.ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,      # 허용할 출처 목록
    allow_credentials=True,             # 쿠키/인증 헤더 포함 허용 여부
    allow_methods=["GET", "POST", "PUT", "DELETE"], # 허용할 HTTP 메서드
    allow_headers=["*"],                # 허용할 HTTP 헤더 (모든 헤더 허용)
)

# --- 라우터 등록 (API 엔드포인트 연결) ---
# auth 라우터를 '/api' 접두사와 함께 등록합니다.
# 예: /api/token, /api/transcribe
app.include_router(auth.router, prefix="/api")

# --- 루트 엔드포인트 ---
@app.get("/")
async def root():
    """
    서버 상태 확인용 루트 엔드포인트 (Health Check)
    
    서버가 정상적으로 실행 중인지 확인하기 위해 호출합니다.
    """
    return {"message": "ElevenLabs Transcription Backend (Python/FastAPI)가 실행 중입니다!"}

if __name__ == "__main__":
    import uvicorn
    # 서버 실행
    # host="0.0.0.0": 모든 네트워크 인터페이스에서 접근 허용 (외부 접속 가능)
    # port=8000: 8000번 포트 사용
    # reload=True: 코드 변경 시 서버 자동 재시작 (개발 모드용)
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
