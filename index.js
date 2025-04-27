import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Simple logging function
const log = (requestId, type, message, data = null) => {
  console.log(`[${new Date().toISOString()}] [${requestId}] [${type}] ${message}`, data || '');
};

app.use(cors());
app.use(express.json());

// Proxy endpoint for all OpenAI requests
app.post('/openai/v1/*', async (req, res) => {
  const requestId = uuidv4();
  const targetPath = req.params[0];
  const openaiUrl = `${OPENAI_BASE_URL}/${targetPath}`;

  log(requestId, 'REQUEST', `Forwarding to OpenAI: ${openaiUrl}`, {
    method: 'POST',
    path: targetPath,
    body: req.body
  });

  try {
    const openaiResponse = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await openaiResponse.json();

    log(requestId, 'RESPONSE', `OpenAI response status: ${openaiResponse.status}`, {
      status: openaiResponse.status,
      response: data
    });

    // Forward the exact response from OpenAI to the client
    res.status(openaiResponse.status).json(data);
  } catch (error) {
    log(requestId, 'ERROR', 'Failed to process OpenAI request', {
      error: error.message,
      stack: error.stack
    });
    
    // Return a proper error response
    res.status(500).json({
      error: {
        message: 'Failed to process OpenAI request',
        type: 'proxy_error',
        code: 'proxy_error',
        details: error.message
      }
    });
  }
});

// Start server
app.listen(PORT, () => {
  log('SYSTEM', 'INFO', `Proxy server running on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    baseUrl: OPENAI_BASE_URL
  });
}); 