import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import multer from 'multer';
import FormData from 'form-data';

dotenv.config();

const app = express();
const PORT = 3000;

// 메모리에 파일 업로드 (Multer 설정)
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('ElevenLabs Transcription Backend is running! Access the frontend at http://localhost:5173');
});

app.get('/api/get-token', async (req, res) => {
  console.log('Received request for token...'); // Debug log
  const apiKey = process.env.XI_API_KEY;

  if (!apiKey) {
    console.error('XI_API_KEY is missing');
    return res.status(500).json({ error: 'XI_API_KEY is not set in server environment' });
  }

  try {
    // Request a single-use token for Scribe Realtime
    // Endpoint: POST https://api.elevenlabs.io/v1/single-use-token/realtime_scribe
    const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API Error:', errorText);
      return res.status(response.status).json({ error: 'Failed to generate token', details: errorText });
    }

    const data = await response.json();
    console.log('Token generated successfully'); // Debug log
    // The response should contain the token. Structure might be { token: "..." }
    res.json(data);
  } catch (error) {
    console.error('Error fetching token:', error);
    res.status(500).json({ error: 'Failed to fetch token' });
  }
});

// 화자 분리 API 엔드포인트
app.post('/api/transcribe-with-speakers', upload.single('audio'), async (req, res) => {
  console.log('Received audio file for speaker diarization');

  const apiKey = process.env.XI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'XI_API_KEY is not set' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  try {
    // FormData로 오디오 파일 준비
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: 'audio.webm',
      contentType: req.file.mimetype
    });

    // 화자 분리 활성화
    formData.append('diarize', 'true');

    // 언어 설정 (선택사항)
    if (req.body.language) {
      formData.append('language', req.body.language);
    }

    // ElevenLabs Scribe v1 API로 전송
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API Error:', errorText);
      return res.status(response.status).json({
        error: 'Failed to transcribe with speaker diarization',
        details: errorText
      });
    }

    const data = await response.json();
    console.log('Speaker diarization completed');

    // 화자별로 텍스트 그룹화
    const speakerTranscripts = groupBySpeaker(data);

    res.json({
      success: true,
      fullTranscript: data.text,
      speakers: speakerTranscripts,
      words: data.words || []
    });

  } catch (error) {
    console.error('Error processing speaker diarization:', error);
    res.status(500).json({ error: 'Failed to process audio file' });
  }
});

// 화자별로 텍스트 그룹화하는 함수
function groupBySpeaker(transcriptionData) {
  if (!transcriptionData.words || transcriptionData.words.length === 0) {
    return [];
  }

  const speakers = [];
  let currentSpeaker = null;
  let currentText = '';
  let currentStart = null;

  for (const word of transcriptionData.words) {
    const speakerId = word.speaker_id || 'Unknown';

    if (currentSpeaker === null) {
      // 첫 번째 단어
      currentSpeaker = speakerId;
      currentText = word.text;
      currentStart = word.start;
    } else if (currentSpeaker === speakerId) {
      // 같은 화자가 계속 말하는 중
      currentText += ' ' + word.text;
    } else {
      // 화자가 바뀜
      speakers.push({
        speaker: currentSpeaker,
        text: currentText.trim(),
        start: currentStart,
        end: word.start
      });

      currentSpeaker = speakerId;
      currentText = word.text;
      currentStart = word.start;
    }
  }

  // 마지막 화자 추가
  if (currentText) {
    const lastWord = transcriptionData.words[transcriptionData.words.length - 1];
    speakers.push({
      speaker: currentSpeaker,
      text: currentText.trim(),
      start: currentStart,
      end: lastWord.end
    });
  }

  return speakers;
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
