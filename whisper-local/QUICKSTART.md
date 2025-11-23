# 빠른 시작 가이드

## 현재 상황

백엔드 서버가 실행되지 않아 녹음 시 오류가 발생하고 있습니다.

## 해결 방법

### 1단계: 현재 실행 중인 서버 중지

터미널에서 `Ctrl+C`를 눌러 현재 실행 중인 `start.sh`를 중지하세요.

### 2단계: Python 버전 확인 및 가상환경 재생성

```bash
cd whisper-local/backend

# Python 버전 확인
python --version

# Python 3.14인 경우, Python 3.12 설치 필요
brew install python@3.12

# 기존 가상환경 삭제
rm -rf venv

# Python 3.12로 가상환경 생성
python3.12 -m venv venv

# 가상환경 활성화
source venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```

### 3단계: 백엔드 서버 실행

새 터미널을 열고:

```bash
cd whisper-local
./start-backend.sh
```

또는 수동으로:

```bash
cd whisper-local/backend
source venv/bin/activate
python -m uvicorn main:app --reload --port 8001
```

### 4단계: 프론트엔드는 이미 실행 중

프론트엔드는 이미 `http://localhost:5174`에서 실행 중입니다.

### 5단계: 테스트

1. 브라우저에서 `http://localhost:5174` 접속
2. 마이크 버튼 클릭
3. 녹음 후 중지
4. 음성 인식 결과 확인

## 빠른 확인

백엔드가 실행 중인지 확인:

```bash
curl http://localhost:8001/
```

정상 응답:
```json
{"message":"Whisper Local Backend (Faster-Whisper)가 실행 중입니다!","model":"base","device":"cpu"}
```

## 문제가 계속되면

1. 브라우저 개발자 콘솔(F12) 확인
2. 백엔드 터미널 로그 확인
3. Python 버전이 3.11 또는 3.12인지 확인
