/**
 * AudioWorklet 프로세서
 * 오디오 데이터를 처리하여 메인 스레드로 전송
 */
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];

        if (input.length > 0) {
            const inputChannel = input[0]; // 모노 채널만 사용

            for (let i = 0; i < inputChannel.length; i++) {
                this.buffer[this.bufferIndex++] = inputChannel[i];

                // 버퍼가 가득 차면 메인 스레드로 전송
                if (this.bufferIndex >= this.bufferSize) {
                    // Float32를 Int16로 변환
                    const pcmData = new Int16Array(this.bufferSize);
                    for (let j = 0; j < this.bufferSize; j++) {
                        const s = Math.max(-1, Math.min(1, this.buffer[j]));
                        pcmData[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }

                    // 메인 스레드로 PCM 데이터 전송
                    this.port.postMessage({
                        type: 'audioData',
                        data: pcmData
                    });

                    this.bufferIndex = 0;
                }
            }
        }

        return true; // 프로세서 계속 실행
    }
}

registerProcessor('audio-processor', AudioProcessor);
