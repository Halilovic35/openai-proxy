import fetch from 'node-fetch';

const PROXY_URL = 'http://localhost:3000';
const TEST_REQUESTS = [
  {
    name: 'Workout Plan',
    path: '/openai/v1/chat/completions',
    body: {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a professional fitness trainer. Create detailed, structured workout plans that include warmup, exercises, and cooldown. Always return responses in valid JSON format with name, description, and days fields.'
        },
        {
          role: 'user',
          content: 'Create a 3-day beginner workout plan for weight loss, focusing on bodyweight exercises and light dumbbells. Return the response as a JSON object with fields: name (string), description (string), and days (array of workout days).'
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    },
    expectedFields: ['choices']
  },
  {
    name: 'Meal Plan',
    path: '/openai/v1/chat/completions',
    body: {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a professional nutritionist. Create detailed, structured meal plans that are healthy and balanced. Always return responses in valid JSON format with name, description, and meals fields.'
        },
        {
          role: 'user',
          content: 'Create a 7-day balanced meal plan for weight loss, targeting 1800 calories per day with high protein. Return the response as a JSON object with fields: name (string), description (string), and meals (array of meals).'
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    },
    expectedFields: ['choices']
  },
  {
    name: 'Chat',
    path: '/openai/v1/chat/completions',
    body: {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Give me a beginner fitness tip'
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    },
    expectedFields: ['choices']
  }
];

const validateResponse = (data, expectedFields, testName) => {
  const missingFields = expectedFields.filter(field => !(field in data));
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  // Validate choices array
  if ('choices' in data) {
    if (!Array.isArray(data.choices)) {
      throw new Error('Choices field must be an array');
    }
    if (data.choices.length === 0) {
      throw new Error('Choices array cannot be empty');
    }
    
    // For workout plan and meal plan, validate the content
    const content = data.choices[0]?.message?.content;
    if (content && testName && testName.includes('Plan')) {
      try {
        const parsed = typeof content === 'object' ? content : JSON.parse(content);
        
        if (parsed.days) {
          if (!Array.isArray(parsed.days)) {
            throw new Error('Days field must be an array');
          }
          if (parsed.days.length === 0) {
            throw new Error('Days array cannot be empty');
          }
        }
        
        if (parsed.meals) {
          if (!Array.isArray(parsed.meals)) {
            throw new Error('Meals field must be an array');
          }
          if (parsed.meals.length === 0) {
            throw new Error('Meals array cannot be empty');
          }
        }
      } catch (error) {
        throw new Error(`Invalid content format: ${error.message}`);
      }
    }
  }
  
  return true;
};

const testProxy = async () => {
  console.log('Starting proxy server tests...\n');

  for (const test of TEST_REQUESTS) {
    console.log(`Testing ${test.name}...`);
    
    try {
      const response = await fetch(`${PROXY_URL}${test.path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(test.body)
      });

      const data = await response.json();
      
      // Check for error response
      if (data.error) {
        console.error(`❌ ${test.name} failed:`);
        console.error('Error:', data.error);
        continue;
      }

      // Validate response structure
      try {
        validateResponse(data, test.expectedFields, test.name);
        console.log(`✅ ${test.name} passed:`);
        console.log('Response structure valid');
        
        // For workout and meal plans, show the parsed content
        if (test.name.includes('Plan')) {
          const content = data.choices[0]?.message?.content;
          const parsed = typeof content === 'object' ? content : JSON.parse(content);
          console.log('Plan content:', JSON.stringify(parsed, null, 2).substring(0, 200) + '...\n');
        } else {
          console.log('Response preview:', JSON.stringify(data, null, 2).substring(0, 200) + '...\n');
        }
      } catch (validationError) {
        console.error(`❌ ${test.name} validation failed:`);
        console.error('Error:', validationError.message);
        console.error('Response:', JSON.stringify(data, null, 2).substring(0, 200) + '...\n');
      }
    } catch (error) {
      console.error(`❌ ${test.name} failed:`);
      console.error('Error:', error.message);
    }
  }

  // Test error handling
  console.log('Testing error handling...');
  
  try {
    const response = await fetch(`${PROXY_URL}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{invalid:json}'  // Malformed JSON that's closer to actual JSON
    });

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (data.error && data.error.type === 'parse_error') {
        console.log('✅ Error handling test passed:');
        console.log('Received expected error response:', data.error);
      } else {
        console.error('❌ Error handling test failed:');
        console.error('Did not receive expected parse error');
        console.error('Response:', data);
      }
    } catch (e) {
      console.error('❌ Error handling test failed:');
      console.error('Response was not valid JSON:', text.substring(0, 200));
    }
  } catch (error) {
    console.error('❌ Error handling test failed:');
    console.error('Network error:', error.message);
  }
};

testProxy().catch(console.error); 