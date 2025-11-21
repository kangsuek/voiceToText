const API_URL = 'http://localhost:8000';

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let currentTranscription = '';
let currentAudioBlob = null;

const recordBtn = document.getElementById('recordBtn');
const uploadBtn = document.getElementById('uploadBtn');
const clearBtn = document.getElementById('clearBtn');
const fileInput = document.getElementById('fileInput');
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result');
const languageSelect = document.getElementById('languageSelect');
const downloadTextBtn = document.getElementById('downloadTextBtn');
const downloadAudioBtn = document.getElementById('downloadAudioBtn');

// 상태 메시지 업데이트
function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}

// 결과 업데이트
function updateResult(text) {
    if (text) {
        resultDiv.textContent = text;
        resultDiv.classList.remove('empty');
        currentTranscription = text;
        downloadTextBtn.disabled = false;
    } else {
        resultDiv.textContent = '여기에 변환된 텍스트가 표시됩니다';
        resultDiv.classList.add('empty');
        currentTranscription = '';
        downloadTextBtn.disabled = true;
    }
}

// 서버 상태 확인
async function checkServerHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
            const data = await response.json();
            updateStatus(`서버 연결됨 (모델: ${data.model})`, 'success');
            return true;
        }
    } catch (error) {
        updateStatus('백엔드 서버에 연결할 수 없습니다. python main.py를 실행하세요.', 'error');
        return false;
    }
}

// 녹음 버튼 클릭
recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                currentAudioBlob = audioBlob;
                downloadAudioBtn.disabled = false;
                await transcribeAudio(audioBlob);
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.classList.add('recording');
            recordBtn.querySelector('.btn-text').textContent = '녹음 중지';
            recordBtn.querySelector('.btn-icon').textContent = '⏹️';
            updateStatus('녹음 중... 중지 버튼을 눌러 변환을 시작하세요', 'recording');
        } catch (error) {
            updateStatus('마이크 접근 권한이 필요합니다', 'error');
            console.error('Microphone error:', error);
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('.btn-text').textContent = '녹음 시작';
        recordBtn.querySelector('.btn-icon').textContent = '🎙️';
        updateStatus('녹음 완료. 변환 중...', 'info');
    }
});

// 파일 업로드 버튼
uploadBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
        currentAudioBlob = file;
        downloadAudioBtn.disabled = false;
        updateStatus(`파일 업로드: ${file.name} - 변환 중...`, 'info');
        await transcribeAudio(file);
        fileInput.value = '';
    }
});

// 초기화 버튼
clearBtn.addEventListener('click', () => {
    updateResult('');
    updateStatus('초기화됨', 'info');
    currentAudioBlob = null;
    downloadAudioBtn.disabled = true;
    checkServerHealth();
});

// 음성 변환 함수
async function transcribeAudio(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');

    const language = languageSelect.value;
    if (language) {
        // 언어 파라미터는 URL 쿼리로 전달
        const url = `${API_URL}/transcribe?language=${language}`;
        await sendTranscriptionRequest(url, formData);
    } else {
        await sendTranscriptionRequest(`${API_URL}/transcribe`, formData);
    }
}

async function sendTranscriptionRequest(url, formData) {
    try {
        updateStatus('서버에서 변환 중... (모델 크기에 따라 시간이 걸릴 수 있습니다)', 'info');

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || '변환 실패');
        }

        const data = await response.json();

        if (data.success) {
            updateResult(data.text);
            updateStatus(`변환 완료 (언어: ${data.language})`, 'success');

            // 세그먼트 정보가 있으면 콘솔에 출력
            if (data.segments && data.segments.length > 0) {
                console.log('Transcription segments:', data.segments);
            }
        } else {
            throw new Error('변환 결과가 없습니다');
        }
    } catch (error) {
        updateStatus(`오류: ${error.message}`, 'error');
        console.error('Transcription error:', error);
    }
}

// 텍스트 다운로드
downloadTextBtn.addEventListener('click', () => {
    if (!currentTranscription) return;

    const blob = new Blob([currentTranscription], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateStatus('텍스트 파일이 저장되었습니다', 'success');
});

// 오디오 다운로드
downloadAudioBtn.addEventListener('click', () => {
    if (!currentAudioBlob) return;

    const url = URL.createObjectURL(currentAudioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateStatus('오디오 파일이 저장되었습니다', 'success');
});

// 페이지 로드 시 서버 상태 확인
window.addEventListener('load', () => {
    checkServerHealth();
});
