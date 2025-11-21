import httpx
from ..config import settings

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
