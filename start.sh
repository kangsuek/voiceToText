#!/bin/bash

# Function to kill processes on exit
cleanup() {
  echo "Stopping servers..."
  kill $(jobs -p) 2>/dev/null
  exit
}

# Trap SIGINT (Ctrl+C) and call cleanup
trap cleanup SIGINT

# Kill existing processes on ports 8000 and 5173
echo "🔍 Checking for existing processes..."
EXISTING_BACKEND=$(lsof -ti:8000)
if [ ! -z "$EXISTING_BACKEND" ]; then
    echo "   🛑 Stopping existing backend process (PID: $EXISTING_BACKEND)"
    kill -9 $EXISTING_BACKEND 2>/dev/null
    sleep 1
fi

EXISTING_FRONTEND=$(lsof -ti:5173)
if [ ! -z "$EXISTING_FRONTEND" ]; then
    echo "   🛑 Stopping existing frontend process (PID: $EXISTING_FRONTEND)"
    kill -9 $EXISTING_FRONTEND 2>/dev/null
    sleep 1
fi

echo "Starting Backend Server (Python/FastAPI)..."
# Check if venv exists, if not create it
if [ ! -d "backend/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv backend/venv
fi

# Move to backend directory and run from there
cd backend

# Activate venv and install requirements
source venv/bin/activate
pip install -r requirements.txt

# Run server from backend directory (so imports work correctly)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Return to project root
cd ..

echo "Starting Frontend Server..."
cd frontend
npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
