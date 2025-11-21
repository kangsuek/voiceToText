from fastapi import APIRouter, HTTPException
from ..services.elevenlabs import get_realtime_token

router = APIRouter()

@router.get("/get-token")
async def get_token():
    """
    ElevenLabs Realtime API 접속을 위한 일회용 토큰을 발급합니다.
    프론트엔드는 이 토큰을 사용하여 WebSocket을 연결합니다.
    """
    try:
        token_data = await get_realtime_token()
        return token_data
    except ValueError as e:
        # API 키 설정 누락 등 설정 오류
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        # 외부 API 호출 실패 등 기타 오류
        raise HTTPException(status_code=500, detail=str(e))
