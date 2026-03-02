import { env } from '../config.js';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function veniceChat(messages: ChatMessage[]) {
  if (!env.VENICE_API_KEY) {
    throw new Error('VENICE_API_KEY is missing. Add it to backend/.env to enable RPG generation.');
  }

  const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.VENICE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.VENICE_MODEL,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Venice API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content as string;
}