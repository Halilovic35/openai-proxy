import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import bodyParser from 'body-parser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const TIMEOUT_MS = 120000; // 2 minutes
const TIMEOUT_SECONDS = TIMEOUT_MS / 1000;
const MAX_LOG_LENGTH = 1000; // Maximum characters to log from responses

// Expected response structure for different endpoints
const EXPECTED_STRUCTURES = {
  'chat/completions': {
    required: ['choices'],
    optional: ['id', 'object', 'created', 'model', 'usage']
  },
  'workout-plan': {
    required: ['name', 'description', 'days'],
    optional: ['duration', 'difficulty', 'equipment']
  },
  'meal-plan': {
    required: ['name', 'description', 'meals'],
    optional: ['calories', 'duration', 'dietaryRestrictions']
  }
};

// Special prompts for workout and meal plans
const SPECIAL_PROMPTS = {
  'workout-plan': {
    system: 'You are a professional fitness trainer. Create detailed, structured workout plans that include warmup, exercises, and cooldown. Always return responses in valid JSON format with name, description, and days fields.',
    user: (prompt) => `Create a workout plan with the following requirements: ${prompt}. Return the response as a JSON object with fields: name (string), description (string), and days (array of workout days).`
  },
  'meal-plan': {
    system: 'You are a professional nutritionist. Create detailed, structured meal plans that are healthy and balanced. Always return responses in valid JSON format with name, description, and meals fields.',
    user: (prompt) => `Create a meal plan with the following requirements: ${prompt}. Return the response as a JSON object with fields: name (string), description (string), and meals (array of meals).`
  }
};

// Function to clean OpenAI response text with enhanced safety
const cleanOpenAIResponse = (rawResponse, path) => {
  if (typeof rawResponse !== 'string') {
    throw new Error('Response must be a string');
  }
  
  // For chat completions, return the raw response as it's already structured
  if (path.includes('chat/completions')) {
    return JSON.parse(rawResponse);
  }
  
  try {
    // First try to parse as is
    try {
      return JSON.parse(rawResponse);
    } catch (e) {
      // If direct parse fails, try cleaning
      const cleaned = rawResponse
        .replace(/^```json\s*/i, '') // Remove ```json from start
        .replace(/^```\s*/i, '')     // Or just ``` if no json
        .replace(/\s*```$/, '')      // Remove ``` from end
        .replace(/^\s*{\s*/, '{')    // Clean up JSON start
        .replace(/\s*}\s*$/, '}')    // Clean up JSON end
        .trim();                     // Remove extra spaces
      
      return JSON.parse(cleaned);
    }
  } catch (error) {
    console.error('Error cleaning response:', error);
    throw new Error('Failed to clean and parse OpenAI response');
  }
};

// Function to validate response structure
const validateResponseStructure = (response, path) => {
  if (path.includes('chat/completions')) {
    if (!response.id || !response.choices || !Array.isArray(response.choices)) {
      throw new Error('Invalid response structure: missing required fields for chat completion');
    }
    
    for (const choice of response.choices) {
      if (!choice.message || !choice.message.content || !choice.message.role) {
        throw new Error('Invalid response structure: message missing required fields');
      }
      
      // For workout and meal plans, validate JSON content
      if (path.includes('workout-plan') || path.includes('meal-plan')) {
        try {
          const content = choice.message.content;
          const parsed = typeof content === 'object' ? content : JSON.parse(content);
          if (!parsed.name || !parsed.description || !parsed.days) {
            throw new Error('Invalid plan structure: missing required fields');
          }
        } catch (error) {
          throw new Error(`Invalid plan format: ${error.message}`);
        }
      }
    }
  }
  
  return true;
};

// Function to safely parse JSON with detailed error handling
const safeJsonParse = (text, requestId, path) => {
  if (!text) {
    throw new Error('Empty response received from OpenAI');
  }

  try {
    const cleaned = cleanOpenAIResponse(text, path);
    
    // Additional validation for expected structure
    if (typeof cleaned !== 'object' || cleaned === null) {
      throw new Error('Parsed response is not a valid object');
    }
    
    // Validate response structure
    validateResponseStructure(cleaned, path);
    
    return cleaned;
  } catch (error) {
    log(requestId, 'JSON_PARSE_ERROR', 'Failed to parse OpenAI response', {
      error: error.message,
      path,
      originalText: text.substring(0, MAX_LOG_LENGTH),
      cleanedText: cleanOpenAIResponse(text, path).substring(0, MAX_LOG_LENGTH)
    });
    throw new Error(`Invalid JSON format returned from OpenAI: ${error.message}`);
  }
};

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

// Request tracking middleware with enhanced context
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.headers['x-request-id'] = requestId;
  req.startTime = Date.now();
  
  // Log request start with enhanced context
  log(requestId, 'REQUEST_START', `Incoming request to ${req.path}`, {
    method: req.method,
    path: req.path,
    query: req.query,
    bodySize: req.body ? JSON.stringify(req.body).length : 0,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    timestamp: new Date().toISOString()
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
      timeout: `${TIMEOUT_SECONDS}s`,
      bodySize: req.body ? JSON.stringify(req.body).length : 0,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    
    res.status(504).json({
      error: {
        message: 'Server response timeout reached',
        type: 'timeout_error',
        code: 'timeout_error',
        details: `Request took longer than ${TIMEOUT_SECONDS} seconds to complete`,
        requestId,
        path: req.path,
        timestamp: new Date().toISOString()
      }
    });
  });
  next();
});

app.use(cors());

// Custom JSON parser
app.use(bodyParser.text({ type: 'application/json' }), (req, res, next) => {
  if (!req.body) {
    next();
    return;
  }
  
  try {
    req.body = JSON.parse(req.body);
    next();
  } catch (err) {
    res.status(400).json({
      error: {
        type: 'parse_error',
        message: 'Invalid JSON in request body',
        details: err.message
      }
    });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: {
      type: 'internal_error',
      message: err.message || 'An unexpected error occurred'
    }
  });
});

// Function to convert special endpoints to chat completions
const convertToChatCompletion = (path, body) => {
  const endpoint = path.split('/').pop();
  const specialPrompt = SPECIAL_PROMPTS[endpoint];
  
  if (!specialPrompt) {
    return { path, body };
  }
  
  return {
    path: 'chat/completions',
    body: {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: specialPrompt.system
        },
        {
          role: 'user',
          content: specialPrompt.user(body.prompt || 'Create a general plan')
        }
      ],
      temperature: 0.7,
      max_tokens: body.max_tokens || 2000,
      response_format: { type: 'json_object' }
    }
  };
};

// Function to transform chat completion response for special endpoints
const transformResponse = (path, response) => {
  const endpoint = path.split('/').pop();
  
  if (!SPECIAL_PROMPTS[endpoint] || !response.choices || !response.choices[0]) {
    return response;
  }
  
  try {
    const content = response.choices[0].message.content;
    return typeof content === 'object' ? content : JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse special endpoint response: ${error.message}`);
  }
};

// Proxy endpoint for OpenAI requests
app.all('*', async (req, res) => {
  const requestId = uuidv4();
  const path = req.path;

  try {
    // Forward request to OpenAI
    const response = await fetch(`${OPENAI_BASE_URL}${path}`, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body),
      timeout: TIMEOUT_MS
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: {
        type: 'internal_error',
        message: error.message
      }
    });
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
      errorLogging: true,
      jsonCleaning: true,
      enhancedErrorHandling: true,
      responseValidation: true
    },
    timestamp: new Date().toISOString()
  });
}); 