import React, { useState, useRef } from 'react';
import { Mic, Square, Download, FileText, Loader2, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
    const [segments, setSegments] = useState([]);
    const [hasAudio, setHasAudio] = useState(false);
    const [detectedLanguage, setDetectedLanguage] = useState('');
    const [languageProbability, setLanguageProbability] = useState(0);

    // Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioUrlRef = useRef(null);

    // 녹음 시작
    const startRecording = async () => {
        try {
            setStatus('recording');
            setIsRecording(true);
            setTranscript('');
            setSegments([]);
            setHasAudio(false);
            setDetectedLanguage('');
            audioChunksRef.current = [];

            // 이전 오디오 URL 정리
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
            }

            // 마이크 권한 요청
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // MediaRecorder 설정
            const mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    setHasAudio(true);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log('녹음 중지됨, 음성 인식 시작...');
                await processTranscription();
            };

            mediaRecorder.start();
            mediaRecorderRef.current = mediaRecorder;

            toast.success('녹음이 시작되었습니다');
        } catch (err) {
            console.error('녹음 시작 실패:', err);
            toast.error('마이크 접근이 거부되었습니다');
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
            toast.info('녹음이 중지되었습니다. 처리 중...');
        }
    };

    // 음성 인식 처리
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
                setTranscript(data.text);
                setSegments(data.segments || []);
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
        setSegments([]);

        try {
            const formData = new FormData();
            formData.append('audio', file);

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
                setSegments(data.segments || []);
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

    // 시간 포맷 (초 -> MM:SS)
    const formatTime = (seconds) => {
        if (!seconds && seconds !== 0) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 relative">
            <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 md:p-8">

                <Toaster
                    position="top-center"
                    toastOptions={{
                        duration: 3000,
                        style: {
                            background: '#1e293b',
                            color: '#f8fafc',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '12px 16px',
                        },
                        success: {
                            iconTheme: {
                                primary: '#8b5cf6',
                                secondary: '#f8fafc',
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
                        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-100 mb-2">
                            로컬 음성 인식
                        </h1>
                        <p className="text-slate-500 text-sm font-medium">
                            Faster-Whisper로 완전 로컬 음성 인식
                        </p>
                    </div>

                    {/* 메인 컨텐츠 */}
                    <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6 sm:p-8 shadow-sm backdrop-blur-sm">

                        {/* 언어 정보 */}
                        {detectedLanguage && (
                            <div className="mb-6 p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                                <p className="text-sm text-violet-300">
                                    감지된 언어: <span className="font-semibold">{detectedLanguage}</span>
                                    {' '}({(languageProbability * 100).toFixed(1)}%)
                                </p>
                            </div>
                        )}

                        {/* 텍스트 표시 영역 */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    인식된 텍스트
                                </h3>
                                {status === 'processing' && (
                                    <span className="flex items-center gap-1.5 text-xs text-violet-400 font-medium">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        처리 중...
                                    </span>
                                )}
                            </div>
                            <div className="min-h-48 max-h-96 overflow-y-auto bg-slate-950/30 rounded-xl p-4 border border-slate-800/50 text-sm leading-7 text-slate-300">
                                {transcript ? (
                                    <p>{transcript}</p>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-600">
                                        <p className="text-sm">녹음하거나 파일을 업로드하세요</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 세그먼트 표시 */}
                        {segments.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mb-8"
                            >
                                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                                    타임스탬프 세그먼트 ({segments.length})
                                </h3>
                                <div className="max-h-64 overflow-y-auto space-y-2">
                                    {segments.map((segment, index) => (
                                        <div
                                            key={index}
                                            className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-mono text-slate-500">
                                                    {formatTime(segment.start)} - {formatTime(segment.end)}
                                                </span>
                                            </div>
                                            <p className="text-slate-300 text-sm">{segment.text}</p>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* 컨트롤 버튼 */}
                        <div className="flex flex-col items-center gap-6">

                            {/* 녹음 버튼 */}
                            <div className="relative">
                                <button
                                    onClick={isRecording ? stopRecording : startRecording}
                                    disabled={status === 'processing'}
                                    className={`
                    relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300
                    ${isRecording
                                            ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                                            : 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/20'}
                    ${status === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                                >
                                    {isRecording ? (
                                        <Square className="w-6 h-6 fill-current" />
                                    ) : (
                                        <Mic className="w-6 h-6" />
                                    )}

                                    {isRecording && (
                                        <span className="absolute -inset-1 rounded-full border border-rose-500/30 animate-ping"></span>
                                    )}
                                </button>
                            </div>

                            {/* 상태 텍스트 */}
                            <div className="text-center h-6">
                                <div className="text-sm font-medium">
                                    {status === 'idle' && (
                                        <span className="text-slate-500">녹음 시작 또는 파일 업로드</span>
                                    )}
                                    {status === 'recording' && (
                                        <span className="text-rose-400 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse"></span>
                                            녹음 중...
                                        </span>
                                    )}
                                    {status === 'processing' && (
                                        <span className="text-violet-400 flex items-center gap-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            음성 인식 처리 중...
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* 파일 업로드 버튼 */}
                            <div className="w-full">
                                <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors cursor-pointer">
                                    <Upload className="w-4 h-4" />
                                    <span>오디오 파일 업로드</span>
                                    <input
                                        type="file"
                                        accept="audio/*"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                        disabled={status === 'processing' || isRecording}
                                    />
                                </label>
                            </div>

                            {/* 다운로드 버튼들 */}
                            <div className="flex items-center gap-3 w-full">
                                <button
                                    onClick={downloadAudio}
                                    disabled={!hasAudio}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>오디오</span>
                                </button>

                                <button
                                    onClick={downloadText}
                                    disabled={!transcript}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <FileText className="w-4 h-4" />
                                    <span>텍스트</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default LocalRecorder;
