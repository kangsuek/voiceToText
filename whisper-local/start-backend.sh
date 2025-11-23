#!/bin/bash

# Whisper Local 백엔드만 실행하는 스크립트

echo "🚀 백엔드 서버 시작..."

cd "$(dirname "$0")/backend"

# 가상환경 확인
if [ ! -d "venv" ]; then
    echo "❌ 가상환경이 없습니다."
    echo ""
    echo "다음 명령어로 설치하세요:"
    echo "  cd backend"
    echo "  python3.12 -m venv venv"
    echo "  source venv/bin/activate"
    echo "  pip install -r requirements.txt"
    exit 1
fi

# 가상환경 활성화
echo "📦 가상환경 활성화 중..."
source venv/bin/activate

# 서버 실행
echo "🚀 uvicorn 서버 시작 중..."
python -m uvicorn main:app --reload --port 8001
