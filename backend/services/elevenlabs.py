import httpx
from ..config import settings
from typing import List, Dict, Any

async def get_realtime_token():
    """
    ElevenLabs API에 요청하여 Realtime Scribe용 일회용 토큰을 받아옵니다.
    """
    if not settings.XI_API_KEY:
        raise ValueError("XI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.")

    url = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe"
    headers = {
        "xi-api-key": settings.XI_API_KEY,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers)

        if response.status_code != 200:
            raise Exception(f"토큰 생성 실패: {response.text}")

        return response.json()


async def transcribe_with_speakers(audio_file: bytes, filename: str, language: str = None) -> Dict[str, Any]:
    """
    오디오 파일을 화자 분리(diarization)하여 텍스트로 변환합니다.
    """
    if not settings.XI_API_KEY:
        raise ValueError("XI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.")

    url = "https://api.elevenlabs.io/v1/speech-to-text"

    # Multipart form data 구성
    files = {
        'file': (filename, audio_file, 'audio/webm')
    }

    data = {
        'model_id': 'scribe_v2',  # ElevenLabs STT 모델 지정
        'diarize': 'true',
        # num_speakers를 지정하지 않으면 자동으로 감지 (최대 32명)
        # 'num_speakers': None  # 명시적으로 None 설정하면 자동 감지
    }

    if language:
        data['language'] = language

    print(f"📤 ElevenLabs API 요청 파라미터: {data}")

    headers = {
        "xi-api-key": settings.XI_API_KEY
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, files=files, data=data)

        if response.status_code != 200:
            raise Exception(f"화자 분리 실패: {response.text}")

        return response.json()


def group_by_speaker(transcription_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    화자별로 텍스트를 그룹화하는 함수
    """
    if not transcription_data.get('words') or len(transcription_data['words']) == 0:
        return []

    # 고유한 화자 ID 확인
    unique_speakers = set()
    for word in transcription_data['words']:
        if 'speaker_id' in word:
            unique_speakers.add(word['speaker_id'])

    print(f"👥 감지된 고유 화자 수: {len(unique_speakers)}")
    print(f"👥 화자 ID 목록: {sorted(unique_speakers)}")

    speakers = []
    current_speaker = None
    current_text = ''
    current_start = None

    for word in transcription_data['words']:
        speaker_id = word.get('speaker_id', 'Unknown')

        if current_speaker is None:
            # 첫 번째 단어
            current_speaker = speaker_id
            current_text = word['text']
            current_start = word['start']
        elif current_speaker == speaker_id:
            # 같은 화자가 계속 말하는 중
            current_text += ' ' + word['text']
        else:
            # 화자가 바뀜
            speakers.append({
                'speaker': current_speaker,
                'text': current_text.strip(),
                'start': current_start,
                'end': word['start']
            })

            current_speaker = speaker_id
            current_text = word['text']
            current_start = word['start']

    # 마지막 화자 추가
    if current_text:
        last_word = transcription_data['words'][-1]
        speakers.append({
            'speaker': current_speaker,
            'text': current_text.strip(),
            'start': current_start,
            'end': last_word.get('end', current_start)
        })

    return speakers
