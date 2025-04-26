import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log('--- Incoming Request ---');
  console.log('Method:', req.method);
  console.log('Path:', req.originalUrl);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  } else {
    console.log('Body: <empty>');
  }
  next();
});

app.use('/openai/v1', async (req, res) => {
  // Validacija ulaznog requesta
  if (!req.body || !Array.isArray(req.body.messages)) {
    console.error('Invalid request: messages array is required.');
    return res.status(400).json({ error: 'Invalid request: messages array is required.' });
  }

  const openaiPath = req.originalUrl.replace('/openai/v1', '/v1');

  try {
    const openaiResponse = await fetch(`https://api.openai.com${openaiPath}`, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    // Logovanje odgovora od OpenAI
    console.log('--- OpenAI Response ---');
    console.log('Status:', openaiResponse.status);
    console.log('Headers:', JSON.stringify(Object.fromEntries(openaiResponse.headers.entries()), null, 2));
    const dataText = await openaiResponse.text();
    let data;
    try {
      data = JSON.parse(dataText);
      console.log('Body:', JSON.stringify(data, null, 2));
    } catch (e) {
      data = dataText;
      console.log('Body (raw):', dataText);
    }

    // Validacija odgovora
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('Invalid response from OpenAI: choices array is missing or empty.');
      return res.status(500).json({ error: 'Invalid response from OpenAI.' });
    }

    res.status(openaiResponse.status).send(dataText);
  } catch (error) {
    // Detaljno logovanje greške
    console.error('--- Proxy Error ---');
    console.error('Status:', error.status || 500);
    console.error('Message:', error.message);
    if (error.code) console.error('Code:', error.code);
    if (error.type) console.error('Type:', error.type);
    if (error.stack) console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
}); 