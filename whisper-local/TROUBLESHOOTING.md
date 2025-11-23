# Whisper Local - 문제 해결 가이드

## Python 버전 문제

**문제**: Python 3.14는 너무 최신 버전이라 `onnxruntime`이 아직 지원하지 않습니다.

**해결책**: Python 3.11 또는 3.12를 사용하세요.

### 방법 1: pyenv 사용 (권장)

```bash
# pyenv 설치 (없다면)
brew install pyenv

# Python 3.12 설치
pyenv install 3.12.0

# 프로젝트 디렉토리에서 Python 버전 설정
cd whisper-local/backend
pyenv local 3.12.0

# 가상환경 재생성
rm -rf venv
python -m venv venv
source venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```

### 방법 2: 시스템 Python 사용

시스템에 Python 3.11 또는 3.12가 설치되어 있다면:

```bash
cd whisper-local/backend

# 기존 가상환경 삭제
rm -rf venv

# Python 3.12로 가상환경 생성
python3.12 -m venv venv

# 활성화
source venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```

## 기타 문제

### pkg-config 또는 ffmpeg 없음

```bash
brew install pkg-config ffmpeg
```

### 메모리 부족

더 작은 모델 사용:
```env
MODEL_SIZE=tiny  # 또는 base
```

### GPU 사용 시 CUDA 오류

CPU 모드로 전환:
```env
DEVICE=cpu
COMPUTE_TYPE=int8
```
