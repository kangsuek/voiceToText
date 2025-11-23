#!/bin/bash

# Whisper Local 실행 스크립트

echo "🚀 Whisper Local 시작..."

# 백엔드 실행
echo "📦 백엔드 서버 시작 중..."
cd backend

# 가상환경 활성화
if [ -d "venv" ]; then
    source venv/bin/activate
    python -m uvicorn main:app --reload --port 8001 &
    BACKEND_PID=$!
else
    echo "❌ 가상환경이 없습니다. backend/venv를 먼저 생성하세요."
    echo "   cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# 잠시 대기
sleep 2

# 프론트엔드 실행
echo "🎨 프론트엔드 서버 시작 중..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ 서버가 시작되었습니다!"
echo "   - 백엔드: http://localhost:8001"
echo "   - 프론트엔드: http://localhost:5174"
echo ""
echo "종료하려면 Ctrl+C를 누르세요."

# Ctrl+C 시 모든 프로세스 종료
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT

# 대기
wait
