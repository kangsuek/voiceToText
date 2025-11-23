# Whisper Local - 로컬 음성 인식 솔루션

Faster-Whisper를 사용한 완전 로컬 음성 인식 애플리케이션입니다.
* API 기술문서는 https://github.com/SYSTRAN/faster-whisper 참고

## 특징

- ✅ **완전 로컬**: API 키 불필요, 인터넷 연결 없이 동작
- ✅ **무료**: 사용량 제한 없음
- ✅ **프라이빗**: 모든 데이터가 로컬에서 처리
- ✅ **빠름**: OpenAI Whisper보다 최대 4배 빠른 처리 속도
- ✅ **정확함**: OpenAI Whisper와 동일한 정확도
- ✅ **다국어 지원**: 한국어, 영어 등 99개 언어 자동 감지

## 프로젝트 구조

```
whisper-local/
├── backend/          # FastAPI 백엔드
│   ├── main.py
│   ├── config.py
│   ├── routers/
│   │   └── transcribe.py
│   └── services/
│       └── whisper_service.py
└── frontend/         # React 프론트엔드
    ├── src/
    │   ├── App.jsx
    │   ├── config.js
    │   └── components/
    │       └── LocalRecorder.jsx
    └── package.json
```

## 설치 및 실행

### 1. 환경 변수 설정

```bash
cd backend
cp .env.example .env
```

`.env` 파일을 열고 필요에 따라 설정을 변경하세요:

```env
MODEL_SIZE=base      # tiny, base, small, medium, large-v3
DEVICE=cpu           # cpu 또는 cuda (GPU 사용 시)
COMPUTE_TYPE=int8    # int8, int8_float16, float16, float32
```

### 2. 백엔드 실행

```bash
cd backend

# 가상환경 생성 (선택사항)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 서버 실행
python -m uvicorn main:app --reload --port 8001
```

**첫 실행 시**: Whisper 모델이 자동으로 다운로드됩니다 (~140MB for base model). 시간이 걸릴 수 있습니다.

### 3. 프론트엔드 실행

새 터미널에서:

```bash
cd frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:5174`를 엽니다.

## 사용 방법

1. **녹음하기**: 마이크 버튼을 클릭하여 녹음 시작/중지
2. **파일 업로드**: "오디오 파일 업로드" 버튼으로 기존 파일 업로드
3. **결과 확인**: 음성 인식 결과와 타임스탬프 세그먼트 확인
4. **다운로드**: 오디오 파일 또는 텍스트 파일로 저장

## 모델 선택 가이드

| 모델 | 크기 | 메모리 | 속도 | 정확도 | 추천 용도 |
|------|------|--------|------|--------|----------|
| tiny | ~75MB | ~1GB | 매우 빠름 | 낮음 | 빠른 테스트 |
| base | ~140MB | ~1GB | 빠름 | 보통 | 일반 사용 (기본값) |
| small | ~460MB | ~2GB | 보통 | 좋음 | 균형잡힌 선택 |
| medium | ~1.5GB | ~5GB | 느림 | 매우 좋음 | 고품질 필요 시 |
| large-v3 | ~3GB | ~10GB | 매우 느림 | 최고 | 최고 품질 필요 시 |

## GPU 사용 (선택사항)

NVIDIA GPU가 있다면 처리 속도를 크게 향상시킬 수 있습니다:

1. CUDA 설치 확인
2. `.env` 파일 수정:
   ```env
   DEVICE=cuda
   COMPUTE_TYPE=float16
   ```

## API 문서

백엔드 서버 실행 후 다음 주소에서 API 문서 확인:
- Swagger UI: `http://localhost:8001/docs`
- ReDoc: `http://localhost:8001/redoc`

## 문제 해결

### 모델 다운로드 실패
- 인터넷 연결 확인
- 디스크 공간 확인 (모델 크기만큼 필요)

### 메모리 부족
- 더 작은 모델 사용 (tiny 또는 base)
- `COMPUTE_TYPE=int8` 설정

### 처리 속도가 느림
- GPU 사용 고려
- 더 작은 모델 사용
- 오디오 파일 길이 단축

## 기술 스택

- **Backend**: Python, FastAPI, Faster-Whisper, CTranslate2
- **Frontend**: React, Vite, Framer Motion, Lucide Icons
- **AI Model**: OpenAI Whisper (via Faster-Whisper)

## 라이선스

MIT License
