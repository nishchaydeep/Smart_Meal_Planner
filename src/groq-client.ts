import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY environment variable is not set. Please add it to your .env file.');
}

export const groqClient = new Groq({
  apiKey: GROQ_API_KEY,
});

export async function askGroq(prompt: string, systemPrompt?: string): Promise<string> {
  const messages: any[] = [];
  
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt,
    });
  }
  
  messages.push({
    role: 'user',
    content: prompt,
  });

  const completion = await groqClient.chat.completions.create({
    messages,
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 2048,
  });

  return completion.choices[0]?.message?.content || '';
}

