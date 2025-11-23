# 서버 재시작 필요

## 현재 상황

Import 오류를 수정했습니다. 이제 서버를 재시작해야 합니다.

## 재시작 방법

### 현재 실행 중인 터미널에서:

1. **Ctrl+C**를 눌러 현재 서버 중지
2. 다시 실행:
   ```bash
   ./start-backend.sh
   ```

### 또는 새 터미널에서:

```bash
cd /Users/kangsuek/pythonProject/voiceToText/whisper-local/backend
source venv/bin/activate
python -m uvicorn main:app --reload --port 8001
```

## 확인

서버가 정상 실행되면 다음과 같은 메시지가 표시됩니다:

```
INFO:     Uvicorn running on http://127.0.0.1:8001 (Press CTRL+C to quit)
INFO:     Started reloader process [xxxxx] using WatchFiles
INFO:     Started server process [xxxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

## 테스트

1. 브라우저에서 http://localhost:5174 접속
2. 마이크 버튼 클릭
3. 몇 초간 말하기
4. 중지 버튼 클릭
5. 음성 인식 결과 확인
