#!/bin/bash

# Whisper Local 실행 스크립트

echo "🚀 Whisper Local 시작..."

# 현재 스크립트의 디렉토리로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 기존 프로세스 종료
echo "🔍 기존 실행 중인 프로세스 확인 중..."

# 백엔드 프로세스 종료 (포트 8001 사용 중인 프로세스)
BACKEND_PID=$(lsof -ti:8001)
if [ ! -z "$BACKEND_PID" ]; then
    echo "   🛑 기존 백엔드 프로세스 종료 중... (PID: $BACKEND_PID)"
    kill -9 $BACKEND_PID 2>/dev/null
    sleep 1
fi

# 프론트엔드 프로세스 종료 (포트 5174 사용 중인 프로세스)
FRONTEND_PID=$(lsof -ti:5174)
if [ ! -z "$FRONTEND_PID" ]; then
    echo "   🛑 기존 프론트엔드 프로세스 종료 중... (PID: $FRONTEND_PID)"
    kill -9 $FRONTEND_PID 2>/dev/null
    sleep 1
fi

# 추가로 Vite 관련 프로세스 정리
VITE_PIDS=$(ps aux | grep "[n]ode.*vite" | awk '{print $2}')
if [ ! -z "$VITE_PIDS" ]; then
    echo "   🛑 Vite 프로세스 종료 중..."
    echo $VITE_PIDS | xargs kill -9 2>/dev/null
    sleep 1
fi

# 추가로 uvicorn 관련 프로세스 정리
UVICORN_PIDS=$(ps aux | grep "[u]vicorn.*8001" | awk '{print $2}')
if [ ! -z "$UVICORN_PIDS" ]; then
    echo "   🛑 Uvicorn 프로세스 종료 중..."
    echo $UVICORN_PIDS | xargs kill -9 2>/dev/null
    sleep 1
fi

echo "✅ 기존 프로세스 정리 완료"
echo ""

# 백엔드 실행
echo "📦 백엔드 서버 시작 중..."
cd backend

# 가상환경 활성화
if [ -d "venv" ]; then
    source venv/bin/activate
    # PYTHONPATH 설정으로 모듈 임포트 문제 해결
    export PYTHONPATH="${SCRIPT_DIR}/backend:$PYTHONPATH"
    python -m uvicorn main:app --reload --port 8001 &
    NEW_BACKEND_PID=$!
    echo "   ✅ 백엔드 서버 시작됨 (PID: $NEW_BACKEND_PID)"
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
NEW_FRONTEND_PID=$!
echo "   ✅ 프론트엔드 서버 시작됨 (PID: $NEW_FRONTEND_PID)"

echo ""
echo "✅ 서버가 시작되었습니다!"
echo "   - 백엔드: http://localhost:8001"
echo "   - 프론트엔드: http://localhost:5174"
echo ""
echo "종료하려면 Ctrl+C를 누르세요."

# Ctrl+C 시 모든 프로세스 종료
trap "echo ''; echo '🛑 서버 종료 중...'; kill $NEW_BACKEND_PID $NEW_FRONTEND_PID 2>/dev/null; exit" INT

# 대기
wait
