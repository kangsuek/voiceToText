# Whisper Local - 빠른 시작 가이드

## 5분 안에 시작하기

### 1단계: 디렉토리 이동
```bash
cd whisper-local
```

### 2단계: 실행
```bash
./start.sh
```

첫 실행 시:
- Python 가상환경 생성
- 의존성 자동 설치 (~2-3분)
- Whisper 모델 다운로드 (~150MB)

### 3단계: 브라우저 열기
```
http://localhost:5173
```

### 4단계: 사용하기
1. "녹음 시작" 클릭
2. 말하기
3. "녹음 중지" 클릭
4. 자동으로 텍스트 변환!

---

## 문제 해결

### "python: command not found"
```bash
# macOS
brew install python3

# Ubuntu/Debian
sudo apt install python3 python3-pip

# Windows
# Python 공식 사이트에서 설치
```

### "Permission denied: ./start.sh"
```bash
chmod +x start.sh
```

### 서버에 연결할 수 없음
백엔드가 실행 중인지 확인:
```bash
curl http://localhost:8000/health
```

### 더 나은 정확도를 원함
더 큰 모델 사용:
```bash
WHISPER_MODEL=medium python backend/main.py
```

---

## 다음 단계

- 자세한 설명: [README.md](README.md)
- API 문서: http://localhost:8000/docs (서버 실행 후)
- 모델 선택 가이드: README.md의 "모델 선택" 섹션

---

## 한 줄 요약

```bash
cd whisper-local && ./start.sh
```

그게 다입니다! 🎉
