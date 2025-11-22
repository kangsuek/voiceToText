const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// WebSocket URL 생성 (http -> ws, https -> wss)
const getWsUrl = (token) => {
    // ElevenLabs API는 항상 wss 사용
    return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=${token}`;
};

export const config = {
    API_BASE_URL,
    API_ENDPOINTS: {
        GET_TOKEN: `${API_BASE_URL}/token`,
        TRANSCRIBE: `${API_BASE_URL}/transcribe`,
    },
    getWsUrl
};
