import fetch from 'node-fetch';

const test = async () => {
  try {
    const response = await fetch('http://localhost:3000/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant specialized in helping developers write clean, efficient code. You have deep knowledge of software architecture, design patterns, and best practices.'
          },
          {
            role: 'user',
            content: 'I need help designing a robust error handling system for a Node.js REST API that uses Express. The system should handle different types of errors (validation errors, database errors, authentication errors) and provide consistent error responses. Can you help me with the implementation?'
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: false,
        n: 1
      })
    });

    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
};

test(); 