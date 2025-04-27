import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const TIMEOUT_MS = 120000; // 2 minutes
const TIMEOUT_SECONDS = TIMEOUT_MS / 1000;

// Enhanced logging function with request tracking
const log = (requestId, type, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    requestId,
    type,
    message,
    ...(data && { data })
  };
  console.log(JSON.stringify(logEntry, null, 2));
};

// Request tracking middleware
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.headers['x-request-id'] = requestId;
  req.startTime = Date.now();
  
  // Log request start
  log(requestId, 'REQUEST_START', `Incoming request to ${req.path}`, {
    method: req.method,
    path: req.path,
    query: req.query
  });
  
  next();
});

// Set server-level timeout with enhanced error handling
app.use((req, res, next) => {
  res.setTimeout(TIMEOUT_MS, () => {
    const requestId = req.headers['x-request-id'];
    const duration = Date.now() - req.startTime;
    
    log(requestId, 'TIMEOUT', 'Server response timeout reached', {
      duration: `${duration}ms`,
      path: req.path,
      timeout: `${TIMEOUT_SECONDS}s`
    });
    
    res.status(504).json({
      error: {
        message: 'Server response timeout reached',
        type: 'timeout_error',
        code: 'timeout_error',
        details: `Request took longer than ${TIMEOUT_SECONDS} seconds to complete`,
        requestId
      }
    });
  });
  next();
});

app.use(cors());
app.use(express.json());

// Proxy endpoint for all OpenAI requests
app.post('/openai/v1/*', async (req, res) => {
  const requestId = req.headers['x-request-id'];
  const targetPath = req.params[0];
  const openaiUrl = `${OPENAI_BASE_URL}/${targetPath}`;

  log(requestId, 'OPENAI_REQUEST', `Forwarding to OpenAI: ${openaiUrl}`, {
    method: 'POST',
    path: targetPath,
    body: req.body
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      log(requestId, 'FETCH_TIMEOUT', 'OpenAI fetch request timeout reached', {
        duration: `${Date.now() - req.startTime}ms`,
        timeout: `${TIMEOUT_SECONDS}s`
      });
    }, TIMEOUT_MS);

    const openaiResponse = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
      timeout: TIMEOUT_MS
    });

    clearTimeout(timeoutId);

    const data = await openaiResponse.json();
    const duration = Date.now() - req.startTime;

    log(requestId, 'OPENAI_RESPONSE', `OpenAI response received`, {
      status: openaiResponse.status,
      duration: `${duration}ms`,
      response: data
    });

    res.status(openaiResponse.status).json(data);
  } catch (error) {
    const duration = Date.now() - req.startTime;
    
    if (error.name === 'AbortError') {
      log(requestId, 'TIMEOUT', 'OpenAI request timeout reached', {
        duration: `${duration}ms`,
        timeout: `${TIMEOUT_SECONDS}s`
      });
      
      res.status(504).json({
        error: {
          message: 'OpenAI request timeout reached',
          type: 'timeout_error',
          code: 'timeout_error',
          details: `Request took longer than ${TIMEOUT_SECONDS} seconds to complete`,
          requestId
        }
      });
    } else {
      log(requestId, 'ERROR', 'Failed to process OpenAI request', {
        error: error.message,
        duration: `${duration}ms`,
        stack: error.stack
      });
      
      res.status(500).json({
        error: {
          message: 'Failed to process OpenAI request',
          type: 'proxy_error',
          code: 'proxy_error',
          details: error.message,
          requestId
        }
      });
    }
  }
});

// Start server with enhanced logging
app.listen(PORT, () => {
  log('SYSTEM', 'STARTUP', 'Proxy server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    baseUrl: OPENAI_BASE_URL,
    timeout: `${TIMEOUT_SECONDS} seconds`,
    features: {
      requestTracking: true,
      timeoutHandling: true,
      errorLogging: true
    }
  });
}); 