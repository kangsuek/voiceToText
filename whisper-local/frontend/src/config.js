/**
 * 프론트엔드 설정 파일
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export const config = {
    API_ENDPOINTS: {
        TRANSCRIBE: `${API_BASE_URL}/api/transcribe`,
        HEALTH: `${API_BASE_URL}/api/health`,
    },
    API_BASE_URL,
};
