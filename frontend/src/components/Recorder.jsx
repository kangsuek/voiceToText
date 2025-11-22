import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Download, FileText, Loader2, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { config } from '../config';

// API 엔드포인트 상수: config 파일에서 정의된 엔드포인트를 가져옵니다.
const { API_ENDPOINTS } = config;

// 화자 색상 팔레트 (다크모드 최적화 - Violet Theme)
// 화자 분리 시 각 화자를 구분하기 위한 텍스트 색상 목록입니다.
// 다크 모드 배경(Slate-950)에서 잘 보이도록 밝은 톤의 색상을 사용합니다.
const SPEAKER_COLORS = [
    'text-violet-400',
    'text-indigo-400',
    'text-purple-400',
    'text-fuchsia-400',
    'text-blue-400',
    'text-sky-400',
    'text-teal-400',
    'text-rose-400'
];

/**
 * Recorder 컴포넌트
 * 
 * 실시간 음성 인식 및 화자 분리 기능을 제공하는 메인 컴포넌트입니다.
 * ElevenLabs Realtime API를 사용하여 음성을 텍스트로 변환하고,
 * 녹음된 오디오를 백엔드로 전송하여 화자 분리를 수행합니다.
 */
const Recorder = () => {
    // --- i18n (다국어 지원) ---
    const { t, i18n } = useTranslation();

    // 언어 변경 함수: 한국어('ko')와 영어('en')를 토글합니다.
    const toggleLanguage = () => {
        const newLang = i18n.language === 'en' ? 'ko' : 'en';
        i18n.changeLanguage(newLang);
        localStorage.setItem('language', newLang);
    };

    // --- 상태 관리 (State Management) ---
    // isRecording: 현재 녹음 중인지 여부 (true: 녹음 중, false: 대기 중)
    const [isRecording, setIsRecording] = useState(false);

    // transcript: 확정된(Committed) 텍스트. 문장이 완성되어 더 이상 변하지 않는 텍스트입니다.
    const [transcript, setTranscript] = useState('');

    // partialTranscript: 실시간으로 인식 중인(Partial) 텍스트. 아직 문장이 완성되지 않아 계속 변할 수 있습니다.
    const [partialTranscript, setPartialTranscript] = useState('');

    // status: 현재 컴포넌트의 상태
    // 'idle': 대기 상태
    // 'connecting': WebSocket 연결 또는 마이크 권한 요청 중
    // 'recording': 녹음 및 실시간 인식 중
    // 'processing': 녹음 종료 후 화자 분리 처리 중
    const [status, setStatus] = useState('idle');

    // error: 발생한 에러 메시지 저장
    const [error, setError] = useState(null);

    // hasAudio: 녹음된 오디오 데이터가 있어 다운로드 가능한지 여부
    const [hasAudio, setHasAudio] = useState(false);

    // speakerTranscripts: 화자 분리(Diarization) 결과 데이터 배열
    // [{ speaker: 'Speaker A', text: '...', start: 0.0, end: 1.5 }, ...] 형태
    const [speakerTranscripts, setSpeakerTranscripts] = useState([]);

    // isProcessingSpeakers: 화자 분리 API 호출 중 로딩 상태 표시
    const [isProcessingSpeakers, setIsProcessingSpeakers] = useState(false);

    // audioUrl: 녹음 완료 후 생성된 오디오 Blob URL (재생 및 다운로드용)
    const [audioUrl, setAudioUrl] = useState(null);

    // --- Refs (참조 변수) ---
    // mediaRecorderRef: 브라우저의 MediaRecorder 인스턴스 저장 (오디오 파일 저장용)
    const mediaRecorderRef = useRef(null);

    // socketRef: ElevenLabs API와의 WebSocket 연결 객체 저장
    const socketRef = useRef(null);

    // audioChunksRef: 녹음된 오디오 데이터 조각(Chunk)들을 모아두는 배열
    const audioChunksRef = useRef([]);

    // partialTranscriptRef: 녹음 종료 시점에 남아있는 partial 텍스트를 처리하기 위한 참조
    // state는 비동기 업데이트되므로, 이벤트 핸들러 내에서 즉시 접근하기 위해 ref 사용
    const partialTranscriptRef = useRef('');

    // audioRef: 오디오 재생 엘리먼트 참조 (특정 시점 재생 기능용)
    const audioRef = useRef(null);

    // 컴포넌트 언마운트(종료) 시 리소스 정리
    useEffect(() => {
        return () => {
            stopRecording(); // 녹음 중이라면 중지
            // 생성된 오디오 URL이 있다면 메모리 해제하여 누수 방지
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [audioUrl]);

    // --- 녹음 시작 (Start Recording) ---
    const startRecording = async () => {
        // 이전 녹음 데이터 및 상태 초기화
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
        }

        setError(null);
        setStatus('connecting'); // 연결 시도 상태 표시
        setTranscript('');
        setPartialTranscript('');
        setSpeakerTranscripts([]);
        setHasAudio(false);
        partialTranscriptRef.current = '';
        audioChunksRef.current = [];

        try {
            // 1. 백엔드에서 인증 토큰 받아오기
            // ElevenLabs API를 프론트엔드에서 직접 호출하기 위해 백엔드 프록시를 통해 토큰을 발급받습니다.
            // 이는 API Key를 프론트엔드에 노출시키지 않기 위한 보안 조치입니다.
            const tokenRes = await fetch(API_ENDPOINTS.GET_TOKEN);
            if (!tokenRes.ok) {
                throw new Error('백엔드에서 토큰을 가져오는데 실패했습니다.');
            }
            const { token } = await tokenRes.json();

            // 2. ElevenLabs Realtime API WebSocket 연결
            // model_id: scribe_v2 (한국어 등 다국어 지원 모델)
            const wsUrl = config.getWsUrl(token);
            const socket = new WebSocket(wsUrl);

            // WebSocket 연결 성공 시
            socket.onopen = () => {
                console.log('ElevenLabs WebSocket 연결 성공');
                setStatus('recording');
                setIsRecording(true);
                // WebSocket이 연결되면 마이크 스트림을 캡처하여 전송 시작
                startMediaRecorder(socket);
            };

            // 서버로부터 메시지 수신 시 (실시간 텍스트 변환 결과)
            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);

                // 메시지 타입 확인
                // partial_transcript: 문장이 완성되지 않은 중간 결과
                // committed_transcript: 문장이 완성되어 확정된 결과
                const msgType = data.message_type || data.type;

                if (msgType === 'partial_transcript') {
                    setPartialTranscript(data.text);
                    partialTranscriptRef.current = data.text;
                } else if (msgType === 'committed_transcript') {
                    // 확정된 텍스트는 기존 transcript 뒤에 이어 붙입니다.
                    setTranscript((prev) => prev + ' ' + data.text);
                    setPartialTranscript(''); // partial 초기화
                    partialTranscriptRef.current = '';
                }
            };

            // WebSocket 에러 발생 시
            socket.onerror = (err) => {
                console.error('WebSocket 오류:', err);
                setError('WebSocket 연결 오류가 발생했습니다.');
                stopRecording();
            };

            // WebSocket 연결 종료 시
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
    // 마이크 입력을 캡처하고, 이를 WebSocket 전송용(16kHz PCM)과 파일 저장용(WebM)으로 나누어 처리합니다.
    const startMediaRecorder = async (socket) => {
        try {
            // 마이크 권한 요청 및 스트림 획득
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // 1. 실시간 전송용 AudioContext 설정
            // ElevenLabs Realtime API는 16kHz 샘플링 레이트의 PCM 데이터를 요구합니다.
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            await audioContext.resume();

            const source = audioContext.createMediaStreamSource(stream);
            let processor = null;
            let workletNode = null;

            // AudioWorklet 지원 확인 및 사용 (최신 브라우저 표준)
            // 메인 스레드와 분리된 오디오 처리 스레드에서 작업을 수행하여 성능을 최적화합니다.
            if (audioContext.audioWorklet) {
                try {
                    await audioContext.audioWorklet.addModule('/audio-processor.worklet.js');
                    workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

                    // AudioWorklet에서 처리된 오디오 데이터를 수신
                    workletNode.port.onmessage = (event) => {
                        if (event.data.type === 'audioData') {
                            const pcmData = event.data.data;

                            // PCM 데이터를 Base64 문자열로 인코딩
                            const base64Audio = btoa(
                                String.fromCharCode(...new Uint8Array(pcmData.buffer))
                            );

                            // WebSocket이 열려있을 때만 서버로 오디오 청크 전송
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

            // AudioWorklet을 사용할 수 없는 경우 ScriptProcessorNode 사용 (구형 브라우저 호환성)
            // 메인 스레드에서 오디오 처리를 수행하므로 성능 부하가 있을 수 있습니다.
            if (!workletNode) {
                console.log('📢 ScriptProcessorNode 사용 중 (deprecated)');
                // 버퍼 크기 4096, 입력 채널 1, 출력 채널 1
                processor = audioContext.createScriptProcessor(4096, 1, 1);

                source.connect(processor);
                processor.connect(audioContext.destination);

                processor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);

                    // Float32 데이터를 16-bit PCM 정수로 변환 (ElevenLabs API 요구사항)
                    // -1.0 ~ 1.0 사이의 소수점 값을 -32768 ~ 32767 사이의 정수로 변환합니다.
                    const pcmData = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        const s = Math.max(-1, Math.min(1, inputData[i]));
                        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }

                    // Base64 인코딩
                    const base64Audio = btoa(
                        String.fromCharCode(...new Uint8Array(pcmData.buffer))
                    );

                    // WebSocket 전송
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            message_type: 'input_audio_chunk',
                            audio_base_64: base64Audio,
                            sample_rate: 16000
                        }));
                    }
                };
            }

            // 2. 파일 저장용 MediaRecorder 설정
            // 브라우저가 지원하는 기본 코덱(보통 WebM/Opus)을 사용하여 고품질로 녹음합니다.
            // 이는 나중에 화자 분리(Diarization)를 위해 백엔드로 전송될 원본 오디오입니다.
            const mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    setHasAudio(true); // 데이터가 쌓이면 다운로드 버튼 활성화
                }
            };

            // 녹음 중지 시 이벤트 핸들러
            mediaRecorder.onstop = () => {
                console.log('📼 MediaRecorder 중지됨, 화자 분리 시작...');
                // 녹음이 완전히 중지된 후 화자 분리 처리 로직을 실행합니다.
                // 마지막 데이터 청크가 저장될 시간을 확보하기 위해 약간의 지연(100ms)을 둡니다.
                setTimeout(() => {
                    processSpeakerDiarization();
                }, 100);
            };

            mediaRecorder.start();

            // cleanup 함수에서 사용할 수 있도록 참조 저장
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

                    // 마이크 스트림 트랙 중지 (브라우저 탭의 마이크 사용 표시 끄기)
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

        // 아직 확정되지 않은 부분 텍스트(Partial Transcript)가 있다면 최종 결과에 추가
        // 녹음이 끝나는 순간에 인식 중이던 마지막 문장을 놓치지 않기 위함입니다.
        if (partialTranscriptRef.current) {
            setTranscript((prev) => prev + ' ' + partialTranscriptRef.current);
            setPartialTranscript('');
            partialTranscriptRef.current = '';
        }

        setIsRecording(false);
        setStatus('idle');

        // 화자 분리는 mediaRecorder.onstop 이벤트 핸들러에서 자동으로 호출됩니다.
    };

    // --- 화자 분리 처리 (Speaker Diarization) ---
    // 녹음된 오디오 파일을 백엔드로 전송하여 화자 분리 결과를 받아옵니다.
    const processSpeakerDiarization = async () => {
        if (audioChunksRef.current.length === 0) {
            console.log('⚠️ 오디오 청크가 없습니다. 화자 분리를 건너뜁니다.');
            return;
        }

        console.log('🎤 화자 분리 처리 시작...');
        setIsProcessingSpeakers(true);
        setStatus('processing'); // UI에 로딩 상태 표시

        try {
            // 1. 오디오 데이터(Chunks)를 하나의 Blob으로 병합
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            console.log(`📦 오디오 Blob 크기: ${audioBlob.size} bytes`);

            // 2. 백엔드 전송을 위한 FormData 생성
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');

            console.log('📤 백엔드로 요청 전송 중...');

            // 3. 백엔드 API 호출 (POST /transcribe)
            const response = await fetch(API_ENDPOINTS.TRANSCRIBE, {
                method: 'POST',
                body: formData
            });

            console.log(`📥 응답 상태: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ API 오류 응답:', errorText);

                // 에러 메시지 파싱 및 사용자 알림
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

            // 4. 결과 처리
            if (data.success && data.speakers) {
                console.log(`👥 화자 수: ${data.speakers.length}`);
                data.speakers.forEach((speaker, i) => {
                    console.log(`  화자 ${i + 1}: ${speaker.speaker} - "${speaker.text.substring(0, 50)}..."`);
                });
                setSpeakerTranscripts(data.speakers);

                // 오디오 재생을 위한 URL 생성
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

        // 화자 분리가 완료되었으면 화자별 텍스트를 순서대로 이어붙여 저장
        if (speakerTranscripts.length > 0) {
            textToSave = speakerTranscripts
                .map(item => item.text.trim())
                .join(' ')
                .replace(/\s+/g, ' ');  // 불필요한 공백 제거
        } else {
            // 화자 분리가 없으면 실시간 인식된 텍스트 저장
            textToSave = (transcript + (partialTranscript ? ' ' + partialTranscript : ''))
                .replace(/\s+/g, ' ');
        }

        if (!textToSave.trim()) {
            toast.error(t('errors.noText'));
            return;
        }

        downloadFile(textToSave.trim(), 'transcription.txt');
        toast.success(t('success.textSaved'));
    };

    // --- 파일 다운로드 공통 유틸리티 함수 ---
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

    // --- 오디오 파일(.webm) 다운로드 ---
    const downloadWav = () => {
        if (audioChunksRef.current.length === 0) {
            toast.error(t('errors.noAudio'));
            return;
        }
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        downloadFile(blob, 'recording.webm', 'audio/webm');
        toast.success(t('success.audioSaved'));
    };

    // --- 화자별 텍스트 파일 다운로드 ---
    // "[화자] (시간) 내용" 형식으로 포맷팅하여 저장합니다.
    const downloadSpeakerTranscripts = () => {
        if (speakerTranscripts.length === 0) {
            toast.error(t('errors.noSpeakers'));
            return;
        }

        // 텍스트 포맷팅
        let formattedText = `${t('speakerTranscriptHeader')}\n\n`;

        speakerTranscripts.forEach((item, index) => {
            const speakerLabel = item.speaker || `${t('speaker')} ${index + 1}`;
            const startTime = formatTime(item.start);
            const endTime = formatTime(item.end);

            const cleanedText = item.text.trim().replace(/\s+/g, ' ');

            formattedText += `[${speakerLabel}] (${startTime} - ${endTime})\n`;
            formattedText += `${cleanedText}\n\n`;
        });

        downloadFile(formattedText, 'speaker_transcription.txt');
        toast.success(t('success.speakerSaved'));
    };

    // --- 오디오 재생 제어 ---
    // 특정 화자의 대화 부분을 클릭했을 때 해당 시점부터 오디오를 재생합니다.
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

    // --- 시간 포맷 유틸리티 (초 -> MM:SS) ---
    const formatTime = (seconds) => {
        if (!seconds && seconds !== 0) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 relative selection:bg-violet-500/30">

            <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 md:p-8 relative z-10">

                <Toaster
                    position="top-center"
                    toastOptions={{
                        duration: 3000,
                        style: {
                            background: '#1e293b', // Slate 800
                            color: '#f8fafc',
                            border: '1px solid #334155', // Slate 700
                            borderRadius: '8px',
                            padding: '12px 16px',
                            fontSize: '14px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        },
                        success: {
                            iconTheme: {
                                primary: '#8b5cf6', // Violet 500
                                secondary: '#f8fafc',
                            },
                        },
                        error: {
                            iconTheme: {
                                primary: '#ef4444', // Red 500
                                secondary: '#f8fafc',
                            },
                        },
                    }}
                />

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="w-full max-w-2xl mx-auto"
                >
                    {/* 언어 토글 버튼 */}
                    <div className="flex justify-end mb-6">
                        <button
                            onClick={toggleLanguage}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors rounded-md hover:bg-slate-900/50"
                            title={i18n.language === 'en' ? 'Switch to Korean' : '영어로 변경'}
                        >
                            <Globe className="w-3.5 h-3.5" />
                            <span>{i18n.language === 'en' ? 'EN' : 'KO'}</span>
                        </button>
                    </div>

                    {/* 헤더 */}
                    <div className="text-center mb-10">
                        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-100 mb-2 tracking-tight">
                            {t('title')}
                        </h1>
                        <p className="text-slate-500 text-sm font-medium">
                            {t('subtitle')}
                        </p>
                    </div>

                    {/* 메인 컨텐츠 영역 */}
                    <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6 sm:p-8 shadow-sm backdrop-blur-sm">

                        {/* 실시간 텍스트 표시 영역 */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('realtimeTranscript')}</h3>
                                {isRecording && (
                                    <span className="flex items-center gap-1.5 text-xs text-violet-400 font-medium">
                                        <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse"></span>
                                        {t('recording')}
                                    </span>
                                )}
                            </div>
                            <div
                                className="h-48 overflow-y-auto bg-slate-950/30 rounded-xl p-4 border border-slate-800/50 text-sm leading-7 text-slate-300 scroll-smooth"
                            >
                                {(transcript || partialTranscript) ? (
                                    <div className="space-y-1">
                                        <span className="text-slate-300">{transcript}</span>
                                        <span className="text-violet-400 ml-1 inline-flex items-center">
                                            {partialTranscript}
                                            {partialTranscript && <span className="inline-block w-1.5 h-1.5 bg-violet-500 rounded-full ml-1 animate-pulse"></span>}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-600">
                                        <p className="text-sm">{t('micPlaceholder')}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 화자별 구분된 텍스트 표시 영역 */}
                        {speakerTranscripts.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mb-8"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                        {t('speakerSegments')}
                                        <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px]">
                                            {speakerTranscripts.length}
                                        </span>
                                    </h3>
                                    {isProcessingSpeakers && (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                                    )}
                                </div>
                                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                                    {speakerTranscripts.map((item, index) => {
                                        const speakerColor = SPEAKER_COLORS[index % SPEAKER_COLORS.length];

                                        return (
                                            <div
                                                key={index}
                                                className="group p-3 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer border border-transparent hover:border-slate-800"
                                                onClick={() => playFromTimestamp(item.start)}
                                            >
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className={`text-xs font-medium ${speakerColor}`}>
                                                        {item.speaker || `${t('speaker')} ${index + 1}`}
                                                    </span>
                                                    <span className="text-[10px] text-slate-600 font-mono">
                                                        {formatTime(item.start)}
                                                    </span>
                                                </div>
                                                <p className="text-slate-300 text-sm leading-relaxed pl-1 border-l-2 border-slate-800 group-hover:border-violet-500/30 transition-colors">
                                                    {item.text}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}

                        {/* 오디오 플레이어 */}
                        {audioUrl && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mb-8 bg-slate-950/50 rounded-xl p-3 border border-slate-800/50"
                            >
                                <audio
                                    ref={audioRef}
                                    src={audioUrl}
                                    controls
                                    className="w-full h-8"
                                    style={{
                                        filter: 'invert(0.9) hue-rotate(180deg) saturate(0.5)',
                                        borderRadius: '8px'
                                    }}
                                />
                            </motion.div>
                        )}

                        {/* 컨트롤 버튼 영역 */}
                        <div className="flex flex-col items-center gap-8 mt-4">

                            {/* 녹음 버튼 */}
                            <div className="relative">
                                <button
                                    onClick={isRecording ? stopRecording : startRecording}
                                    disabled={status === 'connecting'}
                                    className={`
                                        relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300
                                        ${isRecording
                                            ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                                            : 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/20'}
                                        ${status === 'connecting' ? 'opacity-80 cursor-not-allowed' : ''}
                                    `}
                                >
                                    {status === 'connecting' ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : isRecording ? (
                                        <Square className="w-6 h-6 fill-current" />
                                    ) : (
                                        <Mic className="w-6 h-6" />
                                    )}

                                    {/* 녹음 중 링 애니메이션 */}
                                    {isRecording && (
                                        <span className="absolute -inset-1 rounded-full border border-rose-500/30 animate-ping"></span>
                                    )}
                                </button>
                            </div>

                            <div className="text-center h-6">
                                <div className="text-sm font-medium">
                                    {status === 'idle' && (
                                        <span className="text-slate-500">{t('startRecording')}</span>
                                    )}
                                    {status === 'connecting' && (
                                        <span className="text-violet-400 flex items-center gap-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            {t('connecting')}
                                        </span>
                                    )}
                                    {status === 'recording' && (
                                        <span className="text-rose-400 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse"></span>
                                            {t('listening')}
                                        </span>
                                    )}
                                    {status === 'processing' && (
                                        <span className="text-violet-400 flex items-center gap-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            {t('processing')}
                                        </span>
                                    )}
                                </div>
                                {error && (
                                    <p className="mt-2 text-xs text-rose-400 bg-rose-500/10 px-2 py-1 rounded">
                                        {error}
                                    </p>
                                )}
                            </div>

                            {/* 다운로드 버튼들 */}
                            <div className="flex items-center gap-3 w-full">
                                <button
                                    onClick={downloadWav}
                                    disabled={!hasAudio}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>{t('downloadAudio')}</span>
                                </button>

                                <button
                                    onClick={downloadTxt}
                                    disabled={!transcript && !partialTranscript && speakerTranscripts.length === 0}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <FileText className="w-4 h-4" />
                                    <span>{t('downloadText')}</span>
                                </button>

                                {speakerTranscripts.length > 0 && (
                                    <button
                                        onClick={downloadSpeakerTranscripts}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600/10 hover:bg-violet-600/20 text-violet-300 border border-violet-500/20 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        <FileText className="w-4 h-4" />
                                        <span>{t('downloadSpeaker')}</span>
                                    </button>
                                )}
                            </div>

                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Recorder;
