import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Download, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Recorder = () => {
    // --- 상태 관리 (State Management) ---
    const [isRecording, setIsRecording] = useState(false);          // 녹음 중 여부
    const [transcript, setTranscript] = useState('');               // 확정된 텍스트 (Committed)
    const [partialTranscript, setPartialTranscript] = useState(''); // 실시간 인식 중인 텍스트 (Partial)
    const [status, setStatus] = useState('idle');                   // 상태: idle(대기), connecting(연결중), recording(녹음중), error(오류)
    const [error, setError] = useState(null);                       // 에러 메시지
    const [hasAudio, setHasAudio] = useState(false);                // 오디오 파일 저장 가능 여부

    // --- Refs (참조 변수) ---
    const mediaRecorderRef = useRef(null);       // 파일 저장을 위한 MediaRecorder
    const socketRef = useRef(null);              // ElevenLabs API와의 WebSocket 연결
    const audioChunksRef = useRef([]);           // 저장할 오디오 데이터 청크 모음
    const partialTranscriptRef = useRef('');     // 녹음 종료 시 마지막 부분 텍스트 처리를 위한 참조

    // 컴포넌트 언마운트 시 리소스 정리
    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, []);

    // --- 녹음 시작 (Start Recording) ---
    const startRecording = async () => {
        setError(null);
        setStatus('connecting');
        setTranscript('');
        setPartialTranscript('');
        setHasAudio(false);
        partialTranscriptRef.current = '';
        audioChunksRef.current = [];

        try {
            // 1. 백엔드에서 인증 토큰 받아오기 (Python FastAPI 서버: 8000번 포트)
            const tokenRes = await fetch('http://localhost:8000/api/get-token');
            if (!tokenRes.ok) {
                throw new Error('백엔드에서 토큰을 가져오는데 실패했습니다.');
            }
            const { token } = await tokenRes.json();

            // 2. ElevenLabs Realtime API WebSocket 연결
            // model_id: scribe_v2 (기본값 사용)
            const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=${token}`;
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('ElevenLabs WebSocket 연결 성공');
                setStatus('recording');
                setIsRecording(true);
                // WebSocket이 연결되면 마이크 스트림 처리 시작
                startMediaRecorder(socket);
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);

                // 메시지 타입 확인 (partial_transcript: 진행 중, committed_transcript: 확정됨)
                const msgType = data.message_type || data.type;

                if (msgType === 'partial_transcript') {
                    setPartialTranscript(data.text);
                    partialTranscriptRef.current = data.text;
                } else if (msgType === 'committed_transcript') {
                    // 확정된 텍스트는 기존 텍스트 뒤에 이어 붙임
                    setTranscript((prev) => prev + ' ' + data.text);
                    setPartialTranscript('');
                    partialTranscriptRef.current = '';
                }
            };

            socket.onerror = (err) => {
                console.error('WebSocket 오류:', err);
                setError('WebSocket 연결 오류가 발생했습니다.');
                stopRecording();
            };

            socket.onclose = (event) => {
                console.log(`WebSocket 연결 종료. 코드: ${event.code}`);
                setIsRecording(false);
                setStatus('idle');
            };

            socketRef.current = socket;

        } catch (err) {
            console.error('녹음 시작 실패:', err);
            setError(err.message);
            setStatus('idle');
        }
    };

    // --- 오디오 스트림 처리 (Audio Processing) ---
    const startMediaRecorder = async (socket) => {
        try {
            // 마이크 권한 요청
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // 1. 실시간 전송용 AudioContext 설정 (16kHz 샘플링 레이트 필수)
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            await audioContext.resume();

            const source = audioContext.createMediaStreamSource(stream);
            // ScriptProcessorNode: 오디오 데이터를 직접 가공하기 위해 사용 (버퍼 크기 4096)
            const processor = audioContext.createScriptProcessor(4096, 1, 1);

            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);

                // Float32 데이터를 16-bit PCM 정수로 변환 (ElevenLabs API 요구사항)
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Base64 인코딩
                const base64Audio = btoa(
                    String.fromCharCode(...new Uint8Array(pcmData.buffer))
                );

                // WebSocket이 열려있을 때만 데이터 전송
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        message_type: 'input_audio_chunk',
                        audio_base_64: base64Audio,
                        sample_rate: 16000
                    }));
                }
            };

            // 2. 파일 저장용 MediaRecorder 설정 (브라우저 기본 포맷, 보통 WebM)
            const mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    setHasAudio(true); // 데이터가 쌓이면 다운로드 버튼 활성화
                }
            };

            mediaRecorder.start();

            // 나중에 정리를 위해 참조 저장
            mediaRecorderRef.current = {
                stop: () => {
                    // AudioContext 리소스 정리
                    processor.disconnect();
                    source.disconnect();
                    audioContext.close();

                    // MediaRecorder 중지
                    if (mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                    }

                    // 마이크 스트림 트랙 중지 (마이크 아이콘 꺼짐)
                    stream.getTracks().forEach(track => track.stop());
                }
            };

        } catch (err) {
            console.error('마이크 접근 실패:', err);
            setError('마이크 접근이 거부되었습니다.');
            stopRecording();
        }
    };

    // --- 녹음 중지 (Stop Recording) ---
    const stopRecording = () => {
        // 미디어 레코더 및 오디오 컨텍스트 정리
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
        }
        // WebSocket 연결 종료
        if (socketRef.current) {
            socketRef.current.close();
        }

        // 아직 확정되지 않은 부분 텍스트가 있다면 결과에 추가
        if (partialTranscriptRef.current) {
            setTranscript((prev) => prev + ' ' + partialTranscriptRef.current);
            setPartialTranscript('');
            partialTranscriptRef.current = '';
        }

        setIsRecording(false);
        setStatus('idle');
    };

    // --- 텍스트 파일 다운로드 ---
    const downloadTxt = () => {
        const textToSave = transcript + (partialTranscript ? ' ' + partialTranscript : '');

        if (!textToSave.trim()) {
            alert("저장할 텍스트가 없습니다.");
            return;
        }

        const element = document.createElement("a");
        const file = new Blob([textToSave], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = "transcription.txt";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    // --- 오디오 파일 다운로드 ---
    const downloadWav = () => {
        if (audioChunksRef.current.length === 0) {
            alert("저장할 오디오가 없습니다.");
            return;
        }
        // 브라우저에서 녹음된 청크를 합쳐서 WebM 파일 생성
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'recording.webm';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 text-white p-4">
            <div className="w-full max-w-2xl bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20">

                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400 mb-2">
                        Realtime Scribe
                    </h1>
                    <p className="text-gray-400">ElevenLabs Transcription API Demo</p>
                </div>

                {/* 텍스트 표시 영역 */}
                <div className="h-64 overflow-y-auto bg-black/30 rounded-xl p-4 mb-8 border border-white/10 font-mono text-sm leading-relaxed scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                    {(transcript || partialTranscript) ? (
                        <>
                            <span className="text-gray-300">{transcript}</span>
                            <span className="text-blue-400 animate-pulse ml-1">{partialTranscript}</span>
                        </>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-600 italic">
                            마이크 버튼을 눌러 녹음을 시작하세요...
                        </div>
                    )}
                </div>

                {/* 컨트롤 버튼 영역 */}
                <div className="flex flex-col items-center gap-6">

                    {/* 녹음 버튼 */}
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={status === 'connecting'}
                        className={`
              relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300
              ${isRecording
                                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/50'
                                : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/50'}
              ${status === 'connecting' ? 'opacity-70 cursor-not-allowed' : ''}
            `}
                    >
                        {status === 'connecting' ? (
                            <Loader2 className="w-8 h-8 animate-spin text-white" />
                        ) : isRecording ? (
                            <Square className="w-8 h-8 text-white fill-current" />
                        ) : (
                            <Mic className="w-8 h-8 text-white" />
                        )}

                        {/* 녹음 중일 때 퍼지는 애니메이션 효과 */}
                        {isRecording && (
                            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                        )}
                    </motion.button>

                    <div className="text-sm font-medium text-gray-300">
                        {status === 'idle' && 'Click to Record'}
                        {status === 'connecting' && '연결 중...'}
                        {status === 'recording' && '듣고 있습니다...'}
                        {error && <span className="text-red-400">{error}</span>}
                    </div>

                    {/* 다운로드 버튼들 */}
                    <div className="flex gap-4 mt-4">
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={downloadWav}
                            disabled={!hasAudio}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            <span>Save Audio</span>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={downloadTxt}
                            disabled={!transcript && !partialTranscript}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <FileText className="w-4 h-4" />
                            <span>Save Text</span>
                        </motion.button>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Recorder;
