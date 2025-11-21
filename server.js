import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = 3000;

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
