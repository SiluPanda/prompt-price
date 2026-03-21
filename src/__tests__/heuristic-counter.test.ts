import { describe, it, expect } from 'vitest';
import { countChars, estimateTokens, countContentTokens } from '../heuristic-counter';
import type { Message } from '../types';

describe('countChars', () => {
  it('returns character count of string', () => {
    expect(countChars('hello')).toBe(5);
    expect(countChars('')).toBe(0);
    expect(countChars('abc def')).toBe(7);
  });
});

describe('estimateTokens', () => {
  it('uses openai ratio 3.9', () => {
    // "hello world" = 11 chars, ceil(11/3.9) = 3
    expect(estimateTokens('hello world', 'openai')).toBe(Math.ceil(11 / 3.9));
  });

  it('uses anthropic ratio 3.5', () => {
    expect(estimateTokens('hello world', 'anthropic')).toBe(Math.ceil(11 / 3.5));
  });

  it('uses google ratio 4.0', () => {
    expect(estimateTokens('hello world', 'google')).toBe(Math.ceil(11 / 4.0));
  });

  it('uses mistral ratio 3.8', () => {
    expect(estimateTokens('hello world', 'mistral')).toBe(Math.ceil(11 / 3.8));
  });

  it('uses meta ratio 3.7', () => {
    expect(estimateTokens('hello world', 'meta')).toBe(Math.ceil(11 / 3.7));
  });

  it('uses cohere ratio 4.0', () => {
    expect(estimateTokens('hello world', 'cohere')).toBe(Math.ceil(11 / 4.0));
  });

  it('uses default ratio 4.0 for unknown provider', () => {
    expect(estimateTokens('hello world', 'unknown-provider')).toBe(Math.ceil(11 / 4.0));
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('', 'openai')).toBe(0);
  });

  it('returns positive integer for non-empty string', () => {
    const tokens = estimateTokens('The quick brown fox jumps over the lazy dog', 'openai');
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });
});

describe('countContentTokens', () => {
  it('handles string content', () => {
    const tokens = countContentTokens('hello world', 'openai');
    expect(tokens).toBe(estimateTokens('hello world', 'openai'));
  });

  it('handles array content with text parts', () => {
    const content: Message['content'] = [
      { type: 'text', text: 'hello' },
      { type: 'text', text: ' world' },
    ];
    const tokens = countContentTokens(content, 'openai');
    expect(tokens).toBe(
      estimateTokens('hello', 'openai') + estimateTokens(' world', 'openai'),
    );
  });

  it('handles image_url with low detail for openai (85 tokens)', () => {
    const content: Message['content'] = [
      { type: 'image_url', image_url: { url: 'https://example.com/img.png', detail: 'low' } },
    ];
    expect(countContentTokens(content, 'openai')).toBe(85);
  });

  it('handles image_url with high detail for openai (512 tokens)', () => {
    const content: Message['content'] = [
      { type: 'image_url', image_url: { url: 'https://example.com/img.png', detail: 'high' } },
    ];
    expect(countContentTokens(content, 'openai')).toBe(512);
  });

  it('handles image_url for anthropic (512 tokens)', () => {
    const content: Message['content'] = [
      { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
    ];
    expect(countContentTokens(content, 'anthropic')).toBe(512);
  });

  it('handles image_url for google (512 tokens)', () => {
    const content: Message['content'] = [
      { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
    ];
    expect(countContentTokens(content, 'google')).toBe(512);
  });

  it('uses estimatedTokens when provided on non-text part', () => {
    const content: Message['content'] = [
      { type: 'audio', estimatedTokens: 200 },
    ];
    expect(countContentTokens(content, 'openai')).toBe(200);
  });

  it('handles empty array', () => {
    expect(countContentTokens([], 'openai')).toBe(0);
  });

  it('mixed text and image content', () => {
    const content: Message['content'] = [
      { type: 'text', text: 'describe this:' },
      { type: 'image_url', image_url: { url: 'https://example.com/img.png', detail: 'low' } },
    ];
    const tokens = countContentTokens(content, 'openai');
    expect(tokens).toBe(estimateTokens('describe this:', 'openai') + 85);
  });
});
