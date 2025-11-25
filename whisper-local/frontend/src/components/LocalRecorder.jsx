import React, { useState, useRef } from 'react';
import { Mic, Square, Download, FileText, Loader2, Globe, MessageCircle, Home, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import { config } from '../config';

const { API_ENDPOINTS } = config;

/**
 * LocalRecorder 컴포넌트
 * 
 * Faster-Whisper를 사용한 로컬 음성 인식 컴포넌트
 * 실시간 스트리밍이 아닌 파일 업로드 후 처리 방식
 */
const LocalRecorder = () => {
    // 상태 관리
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('idle'); // idle, recording, processing
    const [transcript, setTranscript] = useState('');
    const [hasAudio, setHasAudio] = useState(false);
    const [detectedLanguage, setDetectedLanguage] = useState('');
    const [languageProbability, setLanguageProbability] = useState(0);
    const [language, setLanguage] = useState('EN'); // 언어 선택 상태
    const [realtimeTranscript, setRealtimeTranscript] = useState(''); // 실시간 텍스트

    // Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioUrlRef = useRef(null);

    // 녹음 시작
    const startRecording = async () => {
        try {
            // 브라우저 호환성 체크
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                toast.error('이 브라우저는 마이크를 지원하지 않습니다');
                return;
            }

            // HTTPS 체크 (localhost 제외)
            if (window.location.protocol !== 'https:' &&
                !window.location.hostname.includes('localhost') &&
                window.location.hostname !== '127.0.0.1') {
                toast.error('보안상의 이유로 HTTPS 연결이 필요합니다');
                return;
            }

            setStatus('recording');
            setIsRecording(true);
            setTranscript('');
            setRealtimeTranscript(''); // 실시간 텍스트 초기화
            setHasAudio(false);
            setDetectedLanguage('');
            audioChunksRef.current = [];

            // 이전 오디오 URL 정리
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
            }

            // 마이크 권한 요청 (더 나은 오디오 품질 설정)
            console.log('마이크 권한 요청 중...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000
                }
            });

            console.log('오디오 스트림 획득:', stream.getAudioTracks()[0].getSettings());

            // MediaRecorder 설정 (더 나은 호환성을 위해 mimeType 지정)
            let options = { mimeType: 'audio/webm;codecs=opus' };

            // 브라우저가 지원하지 않으면 기본값 사용
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                console.warn('audio/webm;codecs=opus not supported, using default');
                options = {};
            }

            const mediaRecorder = new MediaRecorder(stream, options);
            console.log('MediaRecorder mimeType:', mediaRecorder.mimeType);

            mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    console.log('데이터 수신:', event.data.size, 'bytes');
                    audioChunksRef.current.push(event.data);
                    setHasAudio(true);

                    // 3초마다 (청크 3개가 모이면) 실시간 인식 수행
                    if (audioChunksRef.current.length % 3 === 0) {
                        await processRealtimeTranscription();
                    }
                }
            };

            mediaRecorder.onstop = async () => {
                console.log('녹음 중지됨, 음성 인식 시작...');
                await processTranscription();
            };

            // timeslice를 사용하여 1초마다 데이터 수집
            mediaRecorder.start(1000);
            mediaRecorderRef.current = mediaRecorder;

            toast.success('녹음이 시작되었습니다');
        } catch (err) {
            console.error('녹음 시작 실패:', err);

            // 에러 타입별 메시지
            let errorMessage = '마이크 접근이 거부되었습니다';

            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errorMessage = '마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errorMessage = '마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                errorMessage = '마이크를 사용할 수 없습니다. 다른 프로그램에서 사용 중일 수 있습니다';
            } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
                errorMessage = '마이크 설정을 적용할 수 없습니다';
            } else if (err.name === 'TypeError') {
                errorMessage = '브라우저가 마이크를 지원하지 않습니다';
            } else if (err.name === 'SecurityError') {
                errorMessage = '보안상의 이유로 마이크에 접근할 수 없습니다. HTTPS를 사용해주세요';
            }

            toast.error(errorMessage, { duration: 5000 });
            setStatus('idle');
            setIsRecording(false);
        }
    };

    // 녹음 중지
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();

            // 마이크 스트림 중지
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

            setIsRecording(false);
            toast.loading('녹음이 중지되었습니다. 처리 중...');
        }
    };

    // 실시간 음성 인식 처리
    const processRealtimeTranscription = async () => {
        if (audioChunksRef.current.length === 0) return;

        // 전체 오디오 버퍼 사용
        const currentChunks = [...audioChunksRef.current];

        try {
            const audioBlob = new Blob(currentChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', audioBlob, 'realtime.webm');
            // 언어 자동 감지

            const response = await fetch(API_ENDPOINTS.TRANSCRIBE, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) return;

            const data = await response.json();
            if (data.success && data.text.trim()) {
                console.log('실시간 인식 결과:', data.text);
                // 전체 오디오를 인식했으므로 텍스트를 교체 (누적 아님)
                setRealtimeTranscript(data.text);
            }
        } catch (err) {
            console.error('실시간 인식 오류:', err);
        }
    };

    // 최종 음성 인식 처리
    const processTranscription = async () => {
        if (audioChunksRef.current.length === 0) {
            console.log('오디오 데이터가 없습니다');
            setStatus('idle');
            return;
        }

        setStatus('processing');

        try {
            // 오디오 Blob 생성
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            console.log(`오디오 Blob 크기: ${audioBlob.size} bytes`);

            // FormData 생성
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            // 언어를 자동 감지하도록 설정 (번역하지 않음)
            // formData.append('language', language.toLowerCase());

            // 백엔드로 전송
            console.log('백엔드로 음성 인식 요청 중...');
            const response = await fetch(API_ENDPOINTS.TRANSCRIBE, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API 오류:', errorText);
                throw new Error('음성 인식 처리 중 오류가 발생했습니다');
            }

            const data = await response.json();
            console.log('음성 인식 결과:', data);

            if (data.success) {
                console.log('=== 텍스트 업데이트 ===');
                console.log('받은 텍스트:', data.text);
                console.log('텍스트 길이:', data.text.length);
                setTranscript(data.text);
                setDetectedLanguage(data.language);
                setLanguageProbability(data.language_probability);

                // 오디오 URL 생성 (재생용)
                const url = URL.createObjectURL(audioBlob);
                audioUrlRef.current = url;

                toast.success('음성 인식이 완료되었습니다!');
            } else {
                throw new Error('음성 인식 실패');
            }
        } catch (err) {
            console.error('음성 인식 오류:', err);
            toast.error(err.message || '음성 인식 중 오류가 발생했습니다');
        } finally {
            setStatus('idle');
        }
    };

    // 파일 업로드 처리
    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setStatus('processing');
        setTranscript('');

        try {
            const formData = new FormData();
            formData.append('audio', file);
            // 언어를 자동 감지하도록 설정 (번역하지 않음)
            // formData.append('language', language.toLowerCase());

            console.log('파일 업로드 중:', file.name);
            const response = await fetch(API_ENDPOINTS.TRANSCRIBE, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('음성 인식 처리 중 오류가 발생했습니다');
            }

            const data = await response.json();
            console.log('음성 인식 결과:', data);

            if (data.success) {
                setTranscript(data.text);
                setDetectedLanguage(data.language);
                setLanguageProbability(data.language_probability);
                setHasAudio(true);

                toast.success('음성 인식이 완료되었습니다!');
            }
        } catch (err) {
            console.error('파일 업로드 오류:', err);
            toast.error(err.message || '파일 처리 중 오류가 발생했습니다');
        } finally {
            setStatus('idle');
        }
    };

    // 텍스트 다운로드
    const downloadText = () => {
        if (!transcript) {
            toast.error('저장할 텍스트가 없습니다');
            return;
        }

        const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transcription.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success('텍스트가 저장되었습니다');
    };

    // 오디오 다운로드
    const downloadAudio = () => {
        if (audioChunksRef.current.length === 0) {
            toast.error('저장할 오디오가 없습니다');
            return;
        }

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recording.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success('오디오가 저장되었습니다');
    };

    return (
        <div className="min-h-screen relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, #FFF9E6 0%, #E6F3FF 25%, #F0E6FF 50%, #FFE6F0 75%, #E6F9FF 100%)'
        }}>
            {/* 언어 선택기 - 우측 상단 */}
            <div className="absolute top-6 right-6 z-10">
                <button
                    onClick={() => setLanguage(language === 'EN' ? 'KO' : 'EN')}
                    className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full shadow-lg border-2 border-purple-200 hover:border-purple-300 transition-all"
                >
                    <Globe className="w-5 h-5 text-purple-600" />
                    <span className="font-bold text-purple-600 text-lg">{language}</span>
                </button>
            </div>

            <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 md:p-8 pb-24">

                <Toaster
                    position="top-center"
                    toastOptions={{
                        duration: 3000,
                        style: {
                            background: '#ffffff',
                            color: '#1f2937',
                            border: '2px solid #e9d5ff',
                            borderRadius: '12px',
                            padding: '12px 16px',
                        },
                        success: {
                            iconTheme: {
                                primary: '#8b5cf6',
                                secondary: '#ffffff',
                            },
                        },
                    }}
                />

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="w-full max-w-2xl mx-auto"
                >
                    {/* 헤더 */}
                    <div className="text-center mb-10">
                        <h1 className="text-5xl sm:text-6xl font-black text-gray-900 mb-2 flex items-center justify-center gap-3">
                            Realtime Scribe
                            <MessageCircle className="w-12 h-12 text-purple-600 fill-purple-200" />
                        </h1>
                    </div>

                    {/* 메인 컨텐츠 */}
                    <div className="mb-8">

                        {/* 텍스트 표시 영역 - 대시 보더 스타일 */}
                        <div className="mb-8">
                            <div className="relative bg-blue-50/80 backdrop-blur-sm rounded-3xl p-8 border-4 border-dashed border-blue-300 shadow-xl min-h-80">
                                <div className="mb-4">
                                    <h3 className="text-2xl font-bold text-gray-800 mb-4">
                                        REAL-TIME TRANSCRIPT
                                    </h3>
                                    {status === 'processing' && (
                                        <span className="flex items-center gap-2 text-sm text-purple-600 font-medium">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Processing...
                                        </span>
                                    )}
                                </div>
                                <div className="text-lg leading-relaxed text-gray-700">
                                    {transcript || realtimeTranscript ? (
                                        <p>{status === 'recording' ? realtimeTranscript : transcript}</p>
                                    ) : (
                                        <div>
                                            <p className="mb-4">
                                                {language === 'EN'
                                                    ? "Hey everyone! 😊"
                                                    : "안녕하세요! 😊"
                                                }
                                            </p>
                                            <p>
                                                {language === 'EN'
                                                    ? "Tap the mic button below to start recording your awesome thoughts. It's super easy! 😊"
                                                    : "아래 마이크 버튼을 눌러 녹음을 시작하세요. 정말 쉬워요! 😊"
                                                }
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* 언어 정보 */}
                                {detectedLanguage && (
                                    <div className="mt-4 p-3 bg-purple-100 border-2 border-purple-200 rounded-xl">
                                        <p className="text-sm text-purple-700">
                                            Detected Language: <span className="font-semibold">{detectedLanguage}</span>
                                            {' '}({(languageProbability * 100).toFixed(1)}%)
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 컨트롤 버튼 - 3개 버튼 레이아웃 */}
                        <div className="flex items-end justify-center gap-6 mb-6">

                            {/* Save Audio 버튼 (좌측) */}
                            <motion.div
                                className="flex flex-col items-center"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <button
                                    onClick={downloadAudio}
                                    disabled={!hasAudio}
                                    className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 hover:from-blue-500 hover:to-blue-600 shadow-2xl flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 border-4 border-white/50"
                                    style={{
                                        boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4), inset 0 -8px 16px rgba(0, 0, 0, 0.1)'
                                    }}
                                >
                                    <Download className="w-10 h-10 text-white" strokeWidth={2.5} />
                                </button>
                                <div className="mt-3 px-4 py-2 bg-white rounded-2xl shadow-lg">
                                    <p className="font-black text-gray-900 text-base">
                                        {language === 'EN' ? 'Save' : '저장'}
                                    </p>
                                    <p className="font-black text-gray-900 text-base">
                                        {language === 'EN' ? 'Audio' : '오디오'}
                                    </p>
                                </div>
                            </motion.div>

                            {/* 중앙 마이크 버튼 (크고 입체적) */}
                            <motion.div
                                className="flex flex-col items-center -mb-4"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <button
                                    onClick={isRecording ? stopRecording : startRecording}
                                    disabled={status === 'processing'}
                                    className={`
                                        relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300
                                        ${isRecording
                                            ? 'bg-gradient-to-br from-red-500 to-red-600'
                                            : 'bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700'}
                                        ${status === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}
                                        border-8 border-white/30 shadow-2xl
                                    `}
                                    style={{
                                        boxShadow: isRecording
                                            ? '0 20px 40px rgba(239, 68, 68, 0.5), inset 0 -12px 24px rgba(0, 0, 0, 0.2), 0 0 60px rgba(239, 68, 68, 0.3)'
                                            : '0 20px 40px rgba(139, 92, 246, 0.5), inset 0 -12px 24px rgba(0, 0, 0, 0.2), 0 0 60px rgba(139, 92, 246, 0.3)'
                                    }}
                                >
                                    {isRecording ? (
                                        <Square className="w-16 h-16 fill-white text-white" />
                                    ) : (
                                        <Mic className="w-20 h-20 text-white" strokeWidth={2} />
                                    )}

                                    {isRecording && (
                                        <>
                                            <span className="absolute -inset-2 rounded-full border-4 border-red-400/30 animate-ping"></span>
                                            <span className="absolute -inset-4 rounded-full border-4 border-red-400/20 animate-ping" style={{ animationDelay: '0.5s' }}></span>
                                        </>
                                    )}
                                </button>
                            </motion.div>

                            {/* Save Text 버튼 (우측) */}
                            <motion.div
                                className="flex flex-col items-center"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                <button
                                    onClick={downloadText}
                                    disabled={!transcript}
                                    className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-400 to-pink-500 hover:from-pink-500 hover:to-pink-600 shadow-2xl flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 border-4 border-white/50"
                                    style={{
                                        boxShadow: '0 8px 24px rgba(236, 72, 153, 0.4), inset 0 -8px 16px rgba(0, 0, 0, 0.1)'
                                    }}
                                >
                                    <FileText className="w-10 h-10 text-white" strokeWidth={2.5} />
                                </button>
                                <div className="mt-3 px-4 py-2 bg-white rounded-2xl shadow-lg">
                                    <p className="font-black text-gray-900 text-base">
                                        {language === 'EN' ? 'Save' : '저장'}
                                    </p>
                                    <p className="font-black text-gray-900 text-base">
                                        {language === 'EN' ? 'Text' : '텍스트'}
                                    </p>
                                </div>
                            </motion.div>
                        </div>

                        {/* 파일 업로드 버튼 (숨김 처리, 필요시 사용) */}
                        <input
                            type="file"
                            accept="audio/*"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="audio-upload"
                            disabled={status === 'processing' || isRecording}
                        />
                    </div>
                </motion.div>
            </div>

            {/* 하단 네비게이션 바 */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t-2 border-gray-200 py-4 px-6 shadow-lg">
                <div className="max-w-md mx-auto flex items-center justify-around">
                    <button className="flex flex-col items-center gap-1 text-gray-400 hover:text-purple-600 transition-colors">
                        <Home className="w-7 h-7" strokeWidth={2} />
                    </button>
                    <button className="flex flex-col items-center gap-1 text-purple-600">
                        <Mic className="w-7 h-7" strokeWidth={2} />
                    </button>
                    <button className="flex flex-col items-center gap-1 text-gray-400 hover:text-purple-600 transition-colors">
                        <Settings className="w-7 h-7" strokeWidth={2} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LocalRecorder;
