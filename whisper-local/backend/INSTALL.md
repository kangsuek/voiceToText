# Whisper Local Backend 설치 가이드

## 시스템 요구사항

### macOS
```bash
# pkg-config와 ffmpeg 설치 (PyAV 빌드에 필요)
brew install pkg-config ffmpeg
```

### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install pkg-config ffmpeg libavcodec-dev libavformat-dev libavutil-dev
```

### Windows
1. [FFmpeg 다운로드](https://ffmpeg.org/download.html)
2. PATH 환경 변수에 추가

## 설치

```bash
# 가상환경 생성
python -m venv venv

# 가상환경 활성화
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows

# 의존성 설치
pip install -r requirements.txt
```

## 실행

```bash
# 가상환경 활성화 (아직 안했다면)
source venv/bin/activate

# 서버 실행
python -m uvicorn main:app --reload --port 8001
```

서버가 시작되면 http://localhost:8001 에서 접속 가능합니다.
