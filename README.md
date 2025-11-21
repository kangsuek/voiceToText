# ElevenLabs Realtime Transcription App

이 프로젝트는 ElevenLabs Scribe v2 Realtime API를 사용하여 실시간 받아쓰기 기능을 제공합니다.
PC와 모바일에서 동작하며, 녹음된 내용을 화면에 표시하고 WAV 및 TXT 파일로 저장할 수 있습니다.

## 사전 준비

1.  **ElevenLabs API Key**: [ElevenLabs](https://elevenlabs.io)에서 API 키를 발급받으세요.
2.  **Node.js**: 최신 버전이 설치되어 있어야 합니다.

## 설치 및 실행

### 1. 백엔드 설정 (토큰 발급 서버)

루트 디렉토리에서 다음을 실행합니다.

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 열고 XI_API_KEY에 API 키를 입력하세요.
```

서버 실행:

```bash
./start.sh # 실행 (백엔드, 프론트엔드 실행)
```
브라우저에서 `http://localhost:5173` (또는 터미널에 표시된 주소)를 엽니다.

## 모바일 테스트

모바일에서 테스트하려면 PC와 모바일이 같은 와이파이에 있어야 합니다.
`npm run dev` 실행 시 표시되는 `Network` 주소(예: `http://192.168.x.x:5173`)로 모바일 브라우저에서 접속하세요.
**주의**: 모바일 브라우저에서 마이크 권한을 허용하려면 HTTPS가 필요할 수 있습니다. 로컬 개발 환경에서는 `vite-plugin-mkcert` 등을 사용하거나, Chrome의 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 설정을 통해 HTTP 접속을 허용해야 할 수 있습니다.

## 기능

- **실시간 받아쓰기**: 마이크 버튼을 누르면 ElevenLabs API를 통해 실시간으로 텍스트가 변환됩니다.
- **파일 저장**:
    - **Save Audio**: 녹음된 오디오를 WebM(또는 WAV) 형식으로 저장합니다.
    - **Save Text**: 변환된 텍스트를 TXT 파일로 저장합니다.
