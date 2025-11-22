# Voice to Text API 문서

이 문서는 Voice to Text 애플리케이션의 백엔드 API에 대한 상세 설명을 제공합니다.

## 기본 정보

- **Base URL**: `http://localhost:8000/api`
- **Version**: 1.0.0
- **Format**: JSON

## 인증 및 토큰

### 실시간 API 토큰 발급

ElevenLabs Realtime API에 WebSocket으로 연결하기 위한 일회용 인증 토큰을 발급받습니다.

- **Endpoint**: `GET /token`
- **Description**: 프론트엔드 클라이언트가 WebSocket 연결을 시작하기 전에 호출해야 합니다.

#### Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 음성 인식 및 화자 분리

### 오디오 화자 분리 및 텍스트 변환

업로드된 오디오 파일을 분석하여 텍스트로 변환하고, 화자 분리(Speaker Diarization) 결과를 반환합니다.

- **Endpoint**: `POST /transcribe`
- **Content-Type**: `multipart/form-data`

#### Parameters

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `audio` | File | Yes | 분석할 오디오 파일 (WebM, MP3, WAV 등) |
| `language` | String | No | 오디오 언어 코드 (예: `ko`, `en`). 생략 시 자동 감지. |

#### Response

```json
{
  "success": true,
  "fullTranscript": "안녕하세요. 반갑습니다. 오늘 날씨가 참 좋네요.",
  "speakers": [
    {
      "speaker": "A",
      "start": 0.0,
      "end": 1.5,
      "text": "안녕하세요."
    },
    {
      "speaker": "B",
      "start": 1.8,
      "end": 3.2,
      "text": "반갑습니다."
    },
    {
      "speaker": "A",
      "start": 3.5,
      "end": 5.0,
      "text": "오늘 날씨가 참 좋네요."
    }
  ],
  "words": [
    {
      "word": "안녕하세요",
      "start": 0.0,
      "end": 0.8
    },
    ...
  ]
}
```

## 에러 코드

| Status Code | 설명 |
|---|---|
| `200` | 성공 |
| `500` | 서버 내부 오류 (API 키 설정 오류, 외부 API 호출 실패 등) |
| `503` | 서비스 이용 불가 (외부 서비스 연결 실패) |
| `504` | 시간 초과 (오디오 파일이 너무 크거나 처리가 오래 걸림) |

## Swagger UI

서버가 실행 중일 때, 다음 주소에서 대화형 API 문서를 확인할 수 있습니다:
[http://localhost:8000/docs](http://localhost:8000/docs)
