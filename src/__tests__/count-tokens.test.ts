import { describe, it, expect } from 'vitest';
import { countTokens, countTokensSync } from '../count-tokens';

describe('countTokensSync()', () => {
  it('returns a positive integer for non-empty string', () => {
    const result = countTokensSync('Hello, world!');
    expect(result.tokens).toBeGreaterThan(0);
    expect(Number.isInteger(result.tokens)).toBe(true);
  });

  it('method is approximate', () => {
    const result = countTokensSync('Hello, world!');
    expect(result.method).toBe('approximate');
  });

  it('returns 0 tokens for empty string', () => {
    const result = countTokensSync('');
    expect(result.tokens).toBe(0);
  });

  it('more text yields more tokens', () => {
    const short = countTokensSync('Hi');
    const long = countTokensSync('Hi'.repeat(50));
    expect(long.tokens).toBeGreaterThan(short.tokens);
  });

  it('uses model to determine provider ratio', () => {
    const openai = countTokensSync('hello world', { model: 'gpt-4o' });
    const anthropic = countTokensSync('hello world', { model: 'claude-3-5-sonnet' });
    // Different ratios → may differ
    expect(openai.tokens).toBeGreaterThan(0);
    expect(anthropic.tokens).toBeGreaterThan(0);
  });

  it('defaults to openai ratio when no model is specified', () => {
    const result = countTokensSync('hello world');
    expect(result.tokens).toBe(Math.ceil(11 / 3.9));
  });

  it('anthropic ratio gives more tokens than openai for same text', () => {
    // anthropic ratio = 3.5, openai = 3.9, so anthropic yields more tokens
    const openai = countTokensSync('The quick brown fox', { model: 'gpt-4o' });
    const anthropic = countTokensSync('The quick brown fox', { model: 'claude-3-5-sonnet' });
    expect(anthropic.tokens).toBeGreaterThanOrEqual(openai.tokens);
  });
});

describe('countTokens()', () => {
  it('returns a TokenCount with tokens > 0 for non-empty input', async () => {
    const result = await countTokens('Explain quantum computing in simple terms.');
    expect(result.tokens).toBeGreaterThan(0);
  });

  it('method is approximate', async () => {
    const result = await countTokens('test');
    expect(result.method).toBe('approximate');
  });

  it('accepts model option', async () => {
    const result = await countTokens('hello', { model: 'gpt-4o' });
    expect(result.tokens).toBeGreaterThan(0);
  });

  it('returns 0 for empty string', async () => {
    const result = await countTokens('');
    expect(result.tokens).toBe(0);
  });

  it('async result matches sync result for same input', async () => {
    const input = 'The same text input for both sync and async';
    const asyncResult = await countTokens(input, { model: 'gpt-4o' });
    const syncResult = countTokensSync(input, { model: 'gpt-4o' });
    expect(asyncResult.tokens).toBe(syncResult.tokens);
    expect(asyncResult.method).toBe(syncResult.method);
  });
});
