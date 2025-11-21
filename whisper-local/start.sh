#!/bin/bash

echo "🎤 Whisper Local - 시작 중..."
echo ""

# 현재 디렉토리 확인
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ 오류: whisper-local 디렉토리에서 실행하세요."
    exit 1
fi

# 가상환경 확인
if [ ! -d "backend/venv" ]; then
    echo "⚠️  가상환경이 없습니다. 생성 중..."
    cd backend
    python3 -m venv venv
    cd ..
fi

# 백엔드 실행
echo "🚀 백엔드 서버 시작 중..."
cd backend
source venv/bin/activate

# 의존성 확인
if ! python -c "import whisper" 2>/dev/null; then
    echo "📦 의존성 설치 중... (첫 실행 시 시간이 걸릴 수 있습니다)"
    pip install -r requirements.txt
fi

# 백엔드를 백그라운드에서 실행
python main.py &
BACKEND_PID=$!
cd ..

# 백엔드가 시작될 때까지 대기
echo "⏳ 백엔드 서버 대기 중..."
sleep 3

# 프론트엔드 실행
echo "🌐 프론트엔드 서버 시작 중..."
cd frontend
python3 -m http.server 5173 &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ 서버가 시작되었습니다!"
echo ""
echo "🔗 브라우저에서 다음 주소로 접속하세요:"
echo "   http://localhost:5173"
echo ""
echo "📡 백엔드 API: http://localhost:8000"
echo ""
echo "⚠️  종료하려면 Ctrl+C를 누르세요"
echo ""

# 종료 시 백그라운드 프로세스 정리
trap "echo ''; echo '🛑 서버 종료 중...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# 대기
wait
