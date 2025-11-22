from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from ..services.elevenlabs import get_realtime_token, transcribe_with_speakers, group_by_speaker
from typing import Optional

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


@router.post("/transcribe-with-speakers")
async def transcribe_with_speaker_diarization(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None)
):
    """
    오디오 파일을 받아서 화자 분리(diarization)된 텍스트를 반환합니다.
    """
    print(f"\n=== 화자 분리 API 호출 시작 ===")
    print(f"파일명: {audio.filename}")
    print(f"Content-Type: {audio.content_type}")
    print(f"언어: {language or '자동 감지'}")

    try:
        # 오디오 파일 읽기
        audio_content = await audio.read()
        print(f"오디오 파일 크기: {len(audio_content)} bytes")

        # ElevenLabs API로 화자 분리 요청
        print("ElevenLabs API 요청 중...")
        transcription_data = await transcribe_with_speakers(
            audio_content,
            audio.filename or 'audio.webm',
            language
        )

        print(f"API 응답 받음:")
        print(f"  - 전체 텍스트 길이: {len(transcription_data.get('text', ''))}")
        print(f"  - 단어 개수: {len(transcription_data.get('words', []))}")

        # words 배열의 첫 몇 개 확인
        words = transcription_data.get('words', [])
        if words:
            print(f"  - 첫 3개 단어 샘플:")
            for i, word in enumerate(words[:3]):
                print(f"    {i+1}. {word}")

        # 화자별로 텍스트 그룹화
        speakers = group_by_speaker(transcription_data)
        print(f"화자 그룹화 완료: {len(speakers)}개 세그먼트")

        for i, speaker in enumerate(speakers[:3]):
            print(f"  세그먼트 {i+1}: 화자={speaker['speaker']}, 텍스트={speaker['text'][:50]}...")

        result = {
            "success": True,
            "fullTranscript": transcription_data.get('text', ''),
            "speakers": speakers,
            "words": transcription_data.get('words', [])
        }

        print("=== 화자 분리 API 완료 ===\n")
        return result

    except ValueError as e:
        error_msg = str(e)
        print(f"❌ ValueError: {error_msg}")
        # 사용자 친화적인 에러 메시지
        if "API" in error_msg or "KEY" in error_msg:
            raise HTTPException(status_code=500, detail="API 인증에 실패했습니다. 서버 설정을 확인해주세요.")
        raise HTTPException(status_code=500, detail="오디오 처리 중 오류가 발생했습니다.")
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Exception: {error_msg}")
        import traceback
        traceback.print_exc()

        # 구체적인 에러 메시지 제공
        if "timeout" in error_msg.lower():
            raise HTTPException(status_code=504, detail="처리 시간이 초과되었습니다. 오디오 파일이 너무 큽니다.")
        elif "connection" in error_msg.lower():
            raise HTTPException(status_code=503, detail="외부 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.")
        else:
            raise HTTPException(status_code=500, detail="화자 분리 처리 중 오류가 발생했습니다.")
