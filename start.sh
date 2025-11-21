#!/bin/bash

# Function to kill processes on exit
cleanup() {
  echo "Stopping servers..."
  kill $(jobs -p) 2>/dev/null
  exit
}

# Trap SIGINT (Ctrl+C) and call cleanup
trap cleanup SIGINT

echo "Starting Backend Server (Python/FastAPI)..."
# Check if venv exists, if not create it
if [ ! -d "backend_python/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv backend_python/venv
fi

# Activate venv and install requirements
source backend_python/venv/bin/activate
pip install -r backend_python/requirements.txt

# Run server
# Note: Running from root, so module path is backend_python.main
uvicorn backend_python.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "Starting Frontend Server..."
cd frontend
npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
