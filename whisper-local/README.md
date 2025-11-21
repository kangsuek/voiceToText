# Whisper Local - 완전 로컬 음성 인식

OpenAI Whisper를 사용한 **100% 로컬** 음성 인식 솔루션입니다.
API 키 불필요, 크레딧 소비 없음, 완전 무료입니다.

## 주요 특징

- ✅ **완전 로컬 실행**: 모든 처리가 로컬에서 이루어집니다
- ✅ **무료**: API 키나 크레딧이 필요 없습니다
- ✅ **다국어 지원**: 자동 언어 감지 또는 수동 선택
- ✅ **녹음 & 업로드**: 실시간 녹음 또는 파일 업로드 모두 지원
- ✅ **높은 정확도**: OpenAI의 Whisper 모델 사용
- ✅ **타임스탬프**: 세그먼트별 타임스탬프 제공

## 시스템 요구사항

- Python 3.8 이상
- 4GB 이상의 RAM (모델 크기에 따라 다름)
- 선택사항: NVIDIA GPU (CUDA 지원 시 훨씬 빠름)

## 설치 방법

### 1. Python 가상환경 생성 및 활성화

```bash
cd whisper-local/backend
python -m venv venv

# macOS/Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 2. 의존성 설치

```bash
pip install -r requirements.txt
```

**참고**: 첫 실행 시 Whisper 모델이 자동으로 다운로드됩니다 (~150MB for base model).

### 3. GPU 지원 (선택사항)

NVIDIA GPU가 있다면 더 빠른 처리를 위해 CUDA 버전의 PyTorch를 설치하세요:

```bash
# CUDA 11.8
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118

# CUDA 12.1
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
```

## 실행 방법

### 방법 1: 간단한 실행 (추천)

```bash
# whisper-local 디렉토리에서
./start.sh
```

### 방법 2: 수동 실행

**백엔드 서버 시작:**
```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
python main.py
```

서버는 `http://localhost:8000`에서 실행됩니다.

**프론트엔드 열기:**
```bash
# 다른 터미널에서
cd frontend
python -m http.server 5173
```

브라우저에서 `http://localhost:5173` 접속

## 모델 선택

Whisper는 여러 크기의 모델을 제공합니다. 환경 변수로 설정 가능:

| 모델 | 크기 | 속도 | 정확도 | 권장 용도 |
|------|------|------|--------|-----------|
| tiny | 39M | 매우 빠름 | 낮음 | 빠른 테스트 |
| base | 74M | 빠름 | 보통 | **기본값 (권장)** |
| small | 244M | 보통 | 좋음 | 균형잡힌 선택 |
| medium | 769M | 느림 | 매우 좋음 | 높은 정확도 필요 |
| large | 1550M | 매우 느림 | 최고 | 최고 품질 |

### 모델 변경 방법:

```bash
# 환경 변수로 설정
export WHISPER_MODEL=small

# 또는 실행 시 지정
WHISPER_MODEL=small python main.py
```

## 사용 방법

1. 브라우저에서 `http://localhost:5173` 접속
2. 백엔드 서버가 실행 중인지 확인 (녹색 상태 메시지)
3. 두 가지 방법 중 선택:
   - **녹음**: "녹음 시작" 버튼을 클릭하고, 말한 후 "녹음 중지"
   - **파일 업로드**: "파일 업로드" 버튼으로 오디오 파일 선택
4. 변환이 완료되면 텍스트가 화면에 표시됩니다
5. 필요시 텍스트/오디오 파일을 저장할 수 있습니다

## 지원 오디오 형식

- WAV
- MP3
- M4A
- WebM
- OGG
- FLAC

## API 엔드포인트

### GET /
서버 정보 및 사용 중인 모델 확인

### GET /health
서버 상태 확인

### POST /transcribe
오디오 파일을 텍스트로 변환

**Parameters:**
- `file` (required): 오디오 파일
- `language` (optional): 언어 코드 (예: 'ko', 'en', 'ja')

**Response:**
```json
{
  "success": true,
  "text": "변환된 전체 텍스트",
  "language": "ko",
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "첫 번째 세그먼트"
    }
  ]
}
```

## 성능 최적화 팁

1. **GPU 사용**: CUDA를 지원하는 GPU가 있다면 10배 이상 빠릅니다
2. **모델 선택**: 용도에 맞는 모델 크기 선택 (base 또는 small 권장)
3. **오디오 품질**: 깨끗한 오디오일수록 정확도가 높습니다
4. **RAM**: 더 큰 모델은 더 많은 메모리가 필요합니다

## 문제 해결

### "No module named 'whisper'" 오류
```bash
pip install openai-whisper
```

### "torch not found" 오류
```bash
pip install torch torchaudio
```

### "Out of memory" 오류
더 작은 모델을 사용하거나 RAM을 늘리세요.

### 마이크 권한 오류 (브라우저)
HTTPS가 필요할 수 있습니다. 로컬 개발에서는:
- Chrome: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`에서 `http://localhost:5173` 추가

## ElevenLabs 버전과의 비교

| 특징 | ElevenLabs | Whisper Local |
|------|-----------|---------------|
| 비용 | 크레딧 소비 | 무료 |
| API 키 | 필요 | 불필요 |
| 처리 위치 | 클라우드 | 로컬 |
| 속도 | 매우 빠름 | 보통~빠름 (GPU 의존) |
| 정확도 | 매우 높음 | 높음 |
| 인터넷 | 필요 | 불필요 (초기 설치 제외) |
| 실시간 | 가능 | 파일 업로드 후 처리 |

## 참고 자료

- [OpenAI Whisper GitHub](https://github.com/openai/whisper)
- [Whisper 논문](https://arxiv.org/abs/2212.04356)
- [FastAPI 문서](https://fastapi.tiangolo.com/)

## 라이선스

이 프로젝트는 MIT 라이선스입니다.
OpenAI Whisper는 MIT 라이선스를 따릅니다.
