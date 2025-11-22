import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Download, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';

// API 엔드포인트 상수
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const API_ENDPOINTS = {
    GET_TOKEN: `${API_BASE_URL}/get-token`,
    TRANSCRIBE: `${API_BASE_URL}/transcribe-with-speakers`,
};

// 화자 색상 팔레트
const SPEAKER_COLORS = [
    'text-blue-400',
    'text-green-400',
    'text-yellow-400',
    'text-pink-400',
    'text-purple-400'
];

const Recorder = () => {
    // --- 상태 관리 (State Management) ---
    const [isRecording, setIsRecording] = useState(false);          // 녹음 중 여부
    const [transcript, setTranscript] = useState('');               // 확정된 텍스트 (Committed)
    const [partialTranscript, setPartialTranscript] = useState(''); // 실시간 인식 중인 텍스트 (Partial)
    const [status, setStatus] = useState('idle');                   // 상태: idle(대기), connecting(연결중), recording(녹음중), error(오류)
    const [error, setError] = useState(null);                       // 에러 메시지
    const [hasAudio, setHasAudio] = useState(false);                // 오디오 파일 저장 가능 여부
    const [speakerTranscripts, setSpeakerTranscripts] = useState([]); // 화자별 구분된 텍스트
    const [isProcessingSpeakers, setIsProcessingSpeakers] = useState(false); // 화자 분리 처리 중
    const [audioUrl, setAudioUrl] = useState(null); // 녹음된 오디오 URL

    // --- Refs (참조 변수) ---
    const mediaRecorderRef = useRef(null);       // 파일 저장을 위한 MediaRecorder
    const socketRef = useRef(null);              // ElevenLabs API와의 WebSocket 연결
    const audioChunksRef = useRef([]);           // 저장할 오디오 데이터 청크 모음
    const partialTranscriptRef = useRef('');     // 녹음 종료 시 마지막 부분 텍스트 처리를 위한 참조
    const audioRef = useRef(null);               // 오디오 재생을 위한 참조

    // 컴포넌트 언마운트 시 리소스 정리
    useEffect(() => {
        return () => {
            stopRecording();
            // 오디오 URL 메모리 해제
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [audioUrl]);

    // --- 녹음 시작 (Start Recording) ---
    const startRecording = async () => {
        // 이전 오디오 URL 정리
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
        }

        setError(null);
        setStatus('connecting');
        setTranscript('');
        setPartialTranscript('');
        setSpeakerTranscripts([]);
        setHasAudio(false);
        partialTranscriptRef.current = '';
        audioChunksRef.current = [];

        try {
            // 1. 백엔드에서 인증 토큰 받아오기 (Python FastAPI 서버: 8000번 포트)
            const tokenRes = await fetch(API_ENDPOINTS.GET_TOKEN);
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
            let processor = null;
            let workletNode = null;

            // AudioWorklet 지원 확인 및 사용
            if (audioContext.audioWorklet) {
                try {
                    await audioContext.audioWorklet.addModule('/audio-processor.worklet.js');
                    workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

                    // AudioWorklet에서 오는 메시지 처리
                    workletNode.port.onmessage = (event) => {
                        if (event.data.type === 'audioData') {
                            const pcmData = event.data.data;

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
                        }
                    };

                    source.connect(workletNode);
                    workletNode.connect(audioContext.destination);
                    console.log('✅ AudioWorklet 사용 중');

                } catch (workletError) {
                    console.warn('⚠️ AudioWorklet 로드 실패, ScriptProcessorNode로 fallback:', workletError);
                    workletNode = null;
                }
            }

            // AudioWorklet을 사용할 수 없으면 ScriptProcessorNode 사용 (fallback)
            if (!workletNode) {
                console.log('📢 ScriptProcessorNode 사용 중 (deprecated)');
                processor = audioContext.createScriptProcessor(4096, 1, 1);

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
            }

            // 2. 파일 저장용 MediaRecorder 설정 (브라우저 기본 포맷, 보통 WebM)
            const mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    setHasAudio(true); // 데이터가 쌓이면 다운로드 버튼 활성화
                }
            };

            // 녹음 중지 시 화자 분리 처리
            mediaRecorder.onstop = () => {
                console.log('📼 MediaRecorder 중지됨, 화자 분리 시작...');
                // 녹음이 완전히 중지된 후 화자 분리 처리
                setTimeout(() => {
                    processSpeakerDiarization();
                }, 100);
            };

            mediaRecorder.start();

            // 나중에 정리를 위해 참조 저장
            mediaRecorderRef.current = {
                stop: () => {
                    // AudioContext 리소스 정리
                    if (workletNode) {
                        workletNode.disconnect();
                        workletNode.port.close();
                    }
                    if (processor) {
                        processor.disconnect();
                    }
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

        // 화자 분리는 mediaRecorder.onstop 이벤트에서 처리됨
    };

    // --- 화자 분리 처리 ---
    const processSpeakerDiarization = async () => {
        if (audioChunksRef.current.length === 0) {
            console.log('⚠️ 오디오 청크가 없습니다. 화자 분리를 건너뜁니다.');
            return;
        }

        console.log('🎤 화자 분리 처리 시작...');
        setIsProcessingSpeakers(true);
        setStatus('processing');

        try {
            // 오디오 Blob 생성
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            console.log(`📦 오디오 Blob 크기: ${audioBlob.size} bytes`);

            // FormData 생성
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');

            console.log('📤 백엔드로 요청 전송 중...');
            // 백엔드로 전송
            const response = await fetch(API_ENDPOINTS.TRANSCRIBE, {
                method: 'POST',
                body: formData
            });

            console.log(`📥 응답 상태: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ API 오류 응답:', errorText);

                // 상태 코드에 따른 사용자 친화적인 에러 메시지
                let userMessage = '화자 분리 처리 중 오류가 발생했습니다.';
                try {
                    const errorData = JSON.parse(errorText);
                    userMessage = errorData.detail || userMessage;
                } catch (e) {
                    // JSON 파싱 실패 시 기본 메시지 사용
                }

                throw new Error(userMessage);
            }

            const data = await response.json();
            console.log('✅ API 응답 데이터:', data);

            if (data.success && data.speakers) {
                console.log(`👥 화자 수: ${data.speakers.length}`);
                data.speakers.forEach((speaker, i) => {
                    console.log(`  화자 ${i+1}: ${speaker.speaker} - "${speaker.text.substring(0, 50)}..."`);
                });
                setSpeakerTranscripts(data.speakers);

                // 오디오 URL 생성 및 저장
                const url = URL.createObjectURL(audioBlob);
                setAudioUrl(url);
                console.log('🎵 오디오 URL 생성 완료');
            } else {
                console.warn('⚠️ 화자 데이터가 비어있습니다:', data);
                setError('화자 분리 데이터를 받지 못했습니다.');
            }

        } catch (err) {
            console.error('❌ 화자 분리 오류:', err);
            setError(err.message);
        } finally {
            setIsProcessingSpeakers(false);
            setStatus('idle');
            console.log('🏁 화자 분리 처리 종료');
        }
    };

    // --- 텍스트 파일 다운로드 ---
    const downloadTxt = () => {
        let textToSave = '';

        // 화자 분리가 완료되었으면 화자별 텍스트를 화자 구분 없이 순서대로 저장
        if (speakerTranscripts.length > 0) {
            textToSave = speakerTranscripts
                .map(item => item.text.trim())  // 각 텍스트의 앞뒤 공백 제거
                .join(' ')  // 공백으로 이어붙임
                .replace(/\s+/g, ' ');  // 연속된 공백을 하나로 치환
        } else {
            // 화자 분리가 없으면 실시간 텍스트 저장
            textToSave = (transcript + (partialTranscript ? ' ' + partialTranscript : ''))
                .replace(/\s+/g, ' ');  // 연속된 공백을 하나로 치환
        }

        if (!textToSave.trim()) {
            toast.error("저장할 텍스트가 없습니다.");
            return;
        }

        downloadFile(textToSave.trim(), 'transcription.txt');
        toast.success("텍스트 파일이 저장되었습니다.");
    };

    // --- 파일 다운로드 공통 함수 ---
    const downloadFile = (content, filename, mimeType = 'text/plain;charset=utf-8') => {
        const element = document.createElement("a");
        const file = new Blob([content], { type: mimeType });
        element.href = URL.createObjectURL(file);
        element.download = filename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        URL.revokeObjectURL(element.href);
    };

    // --- 오디오 파일 다운로드 ---
    const downloadWav = () => {
        if (audioChunksRef.current.length === 0) {
            toast.error("저장할 오디오가 없습니다.");
            return;
        }
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        downloadFile(blob, 'recording.webm', 'audio/webm');
        toast.success("오디오 파일이 저장되었습니다.");
    };

    // --- 화자별 텍스트 다운로드 ---
    const downloadSpeakerTranscripts = () => {
        if (speakerTranscripts.length === 0) {
            toast.error("화자별 텍스트가 없습니다.");
            return;
        }

        // 화자별로 포맷팅
        let formattedText = "=== 화자별 구분된 대화록 ===\n\n";

        speakerTranscripts.forEach((item, index) => {
            const speakerLabel = item.speaker || `화자 ${index + 1}`;
            const startTime = formatTime(item.start);
            const endTime = formatTime(item.end);

            // 텍스트 공백 정리
            const cleanedText = item.text.trim().replace(/\s+/g, ' ');

            formattedText += `[${speakerLabel}] (${startTime} - ${endTime})\n`;
            formattedText += `${cleanedText}\n\n`;
        });

        downloadFile(formattedText, 'speaker_transcription.txt');
        toast.success("화자별 텍스트가 저장되었습니다.");
    };

    // --- 화자 클릭 시 오디오 재생 ---
    const playFromTimestamp = (startTime) => {
        if (!audioRef.current || !audioUrl) {
            console.warn('⚠️ 오디오가 준비되지 않았습니다.');
            return;
        }

        console.log(`▶️ ${startTime}초부터 재생 시작`);
        audioRef.current.currentTime = startTime;
        audioRef.current.play().catch(err => {
            console.error('재생 오류:', err);
            setError('오디오 재생 중 오류가 발생했습니다.');
        });
    };

    // --- 시간 포맷 함수 ---
    const formatTime = (seconds) => {
        if (!seconds && seconds !== 0) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 text-white p-4 relative overflow-hidden">
            {/* 배경 장식 요소 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl"></div>
            </div>

            <Toaster
                position="top-center"
                toastOptions={{
                    duration: 3000,
                    style: {
                        background: 'rgba(30, 41, 59, 0.95)',
                        color: '#fff',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        borderRadius: '12px',
                        padding: '16px',
                    },
                    success: {
                        iconTheme: {
                            primary: '#10b981',
                            secondary: '#fff',
                        },
                    },
                    error: {
                        iconTheme: {
                            primary: '#ef4444',
                            secondary: '#fff',
                        },
                    },
                }}
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-3xl relative z-10"
            >
                <div className="bg-gradient-to-br from-white/5 to-white/10 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl border border-white/10 hover:border-white/20 transition-all duration-300">

                    {/* 헤더 */}
                    <div className="text-center mb-10">
                        <motion.h1
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-5xl font-bold mb-3 relative inline-block"
                        >
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 animate-gradient">
                                Realtime Scribe
                            </span>
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="text-slate-400 text-sm font-medium flex items-center justify-center gap-2"
                        >
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                            Powered by ElevenLabs AI
                        </motion.p>
                    </div>

                {/* 실시간 텍스트 표시 영역 */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mb-6"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 bg-gradient-to-b from-blue-400 to-purple-400 rounded-full"></div>
                        <h3 className="text-sm font-semibold text-slate-300">실시간 변환</h3>
                        {isRecording && (
                            <span className="ml-auto flex items-center gap-1.5 text-xs text-red-400">
                                <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>
                                Recording
                            </span>
                        )}
                    </div>
                    <div className="h-48 overflow-y-auto bg-gradient-to-br from-slate-900/50 to-slate-800/30 rounded-2xl p-5 border border-slate-700/50 font-mono text-sm leading-relaxed backdrop-blur-sm hover:border-slate-600/50 transition-colors">
                        {(transcript || partialTranscript) ? (
                            <div className="space-y-1">
                                <span className="text-slate-200">{transcript}</span>
                                <span className="text-blue-400 animate-pulse ml-1 inline-flex items-center gap-1">
                                    {partialTranscript}
                                    {partialTranscript && <span className="inline-block w-0.5 h-4 bg-blue-400 animate-blink"></span>}
                                </span>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                <Mic className="w-8 h-8 mb-2 opacity-50" />
                                <p className="text-sm">마이크 버튼을 눌러 녹음을 시작하세요</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* 화자별 구분된 텍스트 표시 영역 */}
                {speakerTranscripts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="mb-8"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-5 bg-gradient-to-b from-green-400 to-emerald-400 rounded-full"></div>
                            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                <span>화자별 구분</span>
                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                                    {speakerTranscripts.length}개 세그먼트
                                </span>
                            </h3>
                            {isProcessingSpeakers && (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-400 ml-auto" />
                            )}
                        </div>
                        <div className="h-64 overflow-y-auto bg-gradient-to-br from-slate-900/50 to-slate-800/30 rounded-2xl p-4 border border-slate-700/50 font-mono text-sm leading-relaxed backdrop-blur-sm space-y-3">
                            {speakerTranscripts.map((item, index) => {
                                const speakerColor = SPEAKER_COLORS[index % SPEAKER_COLORS.length];

                                return (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className="group cursor-pointer hover:bg-white/5 p-3 rounded-xl transition-all duration-200 border border-transparent hover:border-white/10 hover:shadow-lg hover:shadow-blue-500/5"
                                        onClick={() => playFromTimestamp(item.start)}
                                        title="클릭하여 이 부분부터 재생"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`font-bold ${speakerColor} px-2 py-1 bg-white/5 rounded-lg text-xs`}>
                                                {item.speaker || `화자 ${index + 1}`}
                                            </span>
                                            <span className="text-xs text-slate-500 font-mono">
                                                {formatTime(item.start)} - {formatTime(item.end)}
                                            </span>
                                            <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                                ▶
                                            </span>
                                        </div>
                                        <div className="text-slate-300 pl-2 leading-relaxed">
                                            {item.text}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}

                {/* 오디오 플레이어 */}
                {audioUrl && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.6 }}
                        className="mb-6"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-5 bg-gradient-to-b from-pink-400 to-rose-400 rounded-full"></div>
                            <h3 className="text-sm font-semibold text-slate-300">오디오 플레이어</h3>
                        </div>
                        <div className="bg-gradient-to-br from-slate-900/50 to-slate-800/30 rounded-2xl p-4 border border-slate-700/50 backdrop-blur-sm">
                            <audio
                                ref={audioRef}
                                src={audioUrl}
                                controls
                                className="w-full"
                                style={{
                                    filter: 'invert(0.85) hue-rotate(180deg) saturate(1.2)',
                                    height: '48px',
                                    borderRadius: '12px'
                                }}
                            />
                        </div>
                    </motion.div>
                )}

                {/* 컨트롤 버튼 영역 */}
                <div className="flex flex-col items-center gap-6 mt-8">

                    {/* 녹음 버튼 */}
                    <motion.button
                        whileHover={{ scale: status === 'connecting' ? 1 : 1.05 }}
                        whileTap={{ scale: status === 'connecting' ? 1 : 0.95 }}
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={status === 'connecting'}
                        className={`
              relative w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 group
              ${isRecording
                                ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-red-500/50'
                                : 'bg-gradient-to-br from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 shadow-blue-500/50'}
              ${status === 'connecting' ? 'opacity-70 cursor-not-allowed' : ''}
              border-4 border-white/10
            `}
                    >
                        {status === 'connecting' ? (
                            <Loader2 className="w-10 h-10 animate-spin text-white" />
                        ) : isRecording ? (
                            <Square className="w-10 h-10 text-white fill-current group-hover:scale-110 transition-transform" />
                        ) : (
                            <Mic className="w-10 h-10 text-white group-hover:scale-110 transition-transform" />
                        )}

                        {/* 녹음 중일 때 퍼지는 애니메이션 효과 */}
                        {isRecording && (
                            <>
                                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                                <span className="absolute inline-flex h-[110%] w-[110%] rounded-full bg-red-400 opacity-50 animate-pulse"></span>
                            </>
                        )}
                    </motion.button>

                    <div className="text-center">
                        <div className="text-sm font-semibold">
                            {status === 'idle' && (
                                <span className="text-slate-300 flex items-center gap-2">
                                    <span>녹음 시작하기</span>
                                </span>
                            )}
                            {status === 'connecting' && (
                                <span className="text-blue-400 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    연결 중...
                                </span>
                            )}
                            {status === 'recording' && (
                                <span className="text-red-400 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>
                                    듣고 있습니다
                                </span>
                            )}
                            {status === 'processing' && (
                                <span className="text-purple-400 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    화자 분리 중...
                                </span>
                            )}
                        </div>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-2 text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20"
                            >
                                {error}
                            </motion.div>
                        )}
                    </div>

                    {/* 다운로드 버튼들 */}
                    <div className="flex flex-wrap gap-3 mt-4 justify-center w-full max-w-md">
                        <motion.button
                            whileHover={{ scale: !hasAudio ? 1 : 1.02 }}
                            whileTap={{ scale: !hasAudio ? 1 : 0.98 }}
                            onClick={downloadWav}
                            disabled={!hasAudio}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-br from-slate-800/50 to-slate-700/50 hover:from-slate-700/50 hover:to-slate-600/50 rounded-xl border border-slate-600/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg backdrop-blur-sm group"
                        >
                            <Download className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            <span className="text-sm font-medium">오디오</span>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: (!transcript && !partialTranscript && speakerTranscripts.length === 0) ? 1 : 1.02 }}
                            whileTap={{ scale: (!transcript && !partialTranscript && speakerTranscripts.length === 0) ? 1 : 0.98 }}
                            onClick={downloadTxt}
                            disabled={!transcript && !partialTranscript && speakerTranscripts.length === 0}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-br from-slate-800/50 to-slate-700/50 hover:from-slate-700/50 hover:to-slate-600/50 rounded-xl border border-slate-600/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg backdrop-blur-sm group"
                        >
                            <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            <span className="text-sm font-medium">텍스트</span>
                        </motion.button>

                        {speakerTranscripts.length > 0 && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={downloadSpeakerTranscripts}
                                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-br from-emerald-500/90 to-green-600/90 hover:from-emerald-600 hover:to-green-700 rounded-xl border border-emerald-400/30 transition-all duration-200 shadow-lg shadow-emerald-500/25 group"
                            >
                                <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                <span className="text-sm font-medium">화자별</span>
                            </motion.button>
                        )}
                    </div>

                </div>
            </div>
            </motion.div>

            {/* Footer */}
            <motion.footer
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-8 text-center text-slate-500 text-xs relative z-10"
            >
                <p>Built with ❤️ using ElevenLabs Speech-to-Text API</p>
            </motion.footer>
        </div>
    );
};

export default Recorder;
