import type { Message } from './types';

const CHARS_PER_TOKEN: Record<string, number> = {
  openai: 3.9,
  anthropic: 3.5,
  google: 4.0,
  mistral: 3.8,
  meta: 3.7,
  cohere: 4.0,
};

const DEFAULT_CHARS_PER_TOKEN = 4.0;

export function countChars(text: string): number {
  return text.length;
}

export function estimateTokens(text: string, provider: string): number {
  const ratio = CHARS_PER_TOKEN[provider.toLowerCase()] ?? DEFAULT_CHARS_PER_TOKEN;
  return Math.ceil(text.length / ratio);
}

export function countContentTokens(content: Message['content'], provider: string): number {
  if (typeof content === 'string') {
    return estimateTokens(content, provider);
  }

  let total = 0;
  for (const part of content) {
    if (part.type === 'text' && part.text) {
      total += estimateTokens(part.text, provider);
    } else if (part.type === 'image_url') {
      // Image token costs by provider
      if (provider === 'openai') {
        const detail = part.image_url?.detail;
        total += detail === 'low' ? 85 : 512;
      } else {
        total += 512;
      }
    } else if (part.estimatedTokens !== undefined) {
      total += part.estimatedTokens;
    } else {
      // audio, file without estimatedTokens — use a small default
      total += 10;
    }
  }
  return total;
}
