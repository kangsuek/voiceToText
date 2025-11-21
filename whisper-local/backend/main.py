from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import whisper
import os
import tempfile
import torch

app = FastAPI(title="Whisper Local Transcription API")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Whisper 모델 로드 (첫 실행 시 다운로드됨)
# 모델 크기: tiny, base, small, medium, large
# tiny: 가장 빠르고 가벼움 (39M)
# base: 빠르고 적당한 정확도 (74M)
# small: 균형잡힌 선택 (244M)
# medium: 높은 정확도 (769M)
# large: 최고 정확도이지만 느림 (1550M)
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")

print(f"Loading Whisper model: {MODEL_SIZE}")
print(f"Using device: {'cuda' if torch.cuda.is_available() else 'cpu'}")

model = whisper.load_model(MODEL_SIZE)


@app.get("/")
async def root():
    return {
        "message": "Whisper Local Transcription API",
        "model": MODEL_SIZE,
        "device": "cuda" if torch.cuda.is_available() else "cpu"
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "model": MODEL_SIZE}


@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = None
):
    """
    오디오 파일을 받아서 텍스트로 변환합니다.

    Parameters:
    - file: 오디오 파일 (mp3, wav, m4a, webm 등)
    - language: 언어 코드 (선택사항, 예: 'ko', 'en')
    """

    if not file:
        raise HTTPException(status_code=400, detail="No file provided")

    # 임시 파일로 저장
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name

        # Whisper로 변환
        print(f"Transcribing file: {file.filename}")

        options = {}
        if language:
            options['language'] = language

        result = model.transcribe(temp_file_path, **options)

        # 임시 파일 삭제
        os.unlink(temp_file_path)

        return JSONResponse(content={
            "success": True,
            "text": result["text"],
            "language": result.get("language", "unknown"),
            "segments": [
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"]
                }
                for seg in result["segments"]
            ]
        })

    except Exception as e:
        # 에러 발생 시 임시 파일 정리
        if 'temp_file_path' in locals():
            try:
                os.unlink(temp_file_path)
            except:
                pass

        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
