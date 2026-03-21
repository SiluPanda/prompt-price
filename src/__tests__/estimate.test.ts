import { describe, it, expect } from 'vitest';
import { estimate, estimateSync, estimatePrompt, compareModels } from '../estimate';
import type { Message } from '../types';

describe('estimate()', () => {
  it('returns inputTokens > 0 for a user message', async () => {
    const result = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Explain quantum computing' }],
    });
    expect(result.inputTokens).toBeGreaterThan(0);
  });

  it('returns positive costs', async () => {
    const result = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Explain quantum computing' }],
    });
    expect(result.inputCost).toBeGreaterThan(0);
    expect(result.outputCost).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  it('totalCost equals inputCost + outputCost', async () => {
    const result = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result.totalCost).toBeCloseTo(result.inputCost + result.outputCost, 6);
  });

  it('currency is USD', async () => {
    const result = await estimate({ model: 'gpt-4o', messages: [] });
    expect(result.currency).toBe('USD');
  });

  it('method is approximate', async () => {
    const result = await estimate({ model: 'gpt-4o', messages: [] });
    expect(result.method).toBe('approximate');
  });

  it('provider is set correctly for openai model', async () => {
    const result = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.provider).toBe('openai');
  });

  it('provider is set correctly for anthropic model', async () => {
    const result = await estimate({
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.provider).toBe('anthropic');
  });

  it('respects maxOutputTokens when provided', async () => {
    const result = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
      maxOutputTokens: 500,
    });
    expect(result.outputTokens).toBe(500);
  });

  it('estimates output tokens as 30% of input (capped at 1000) by default', async () => {
    const result = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
    });
    const expected = Math.min(Math.ceil(result.inputTokens * 0.3), 1000);
    expect(result.outputTokens).toBe(expected);
  });

  it('includes systemPrompt tokens in input count', async () => {
    const withSystem = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: 'You are a helpful assistant.',
    });
    const withoutSystem = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(withSystem.inputTokens).toBeGreaterThan(withoutSystem.inputTokens);
  });

  it('includes breakdown.systemTokens when systemPrompt is set', async () => {
    const result = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: 'You are a helpful assistant.',
    });
    expect(result.breakdown?.systemTokens).toBeDefined();
    expect(result.breakdown!.systemTokens).toBeGreaterThan(0);
  });

  it('includes tool tokens when tools are provided', async () => {
    const withTools = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get current weather for a location',
          parameters: { type: 'object', properties: { location: { type: 'string' } } },
        },
      }],
    });
    const withoutTools = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(withTools.inputTokens).toBeGreaterThan(withoutTools.inputTokens);
  });

  it('works with provider/model format', async () => {
    const result = await estimate({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.provider).toBe('openai');
    expect(result.inputTokens).toBeGreaterThan(0);
  });

  it('more text = higher inputTokens', async () => {
    const short = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    const long = await estimate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi'.repeat(100) }],
    });
    expect(long.inputTokens).toBeGreaterThan(short.inputTokens);
  });
});

describe('estimateSync()', () => {
  it('returns same result as estimate() for same input', async () => {
    const options = {
      model: 'gpt-4o',
      messages: [{ role: 'user' as const, content: 'Hello, world!' }],
    };
    const async_result = await estimate(options);
    const sync_result = estimateSync(options);
    expect(sync_result.inputTokens).toBe(async_result.inputTokens);
    expect(sync_result.outputTokens).toBe(async_result.outputTokens);
    expect(sync_result.totalCost).toBe(async_result.totalCost);
  });

  it('is synchronous (returns Estimate, not Promise)', () => {
    const result = estimateSync({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.inputTokens).toBeGreaterThan(0);
  });
});

describe('estimatePrompt()', () => {
  it('treats prompt string as a single user message', async () => {
    const result = await estimatePrompt('Hello, world!');
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.provider).toBe('openai');
  });

  it('uses the provided model option', async () => {
    const result = await estimatePrompt('Hello', { model: 'claude-3-5-sonnet' });
    expect(result.provider).toBe('anthropic');
  });

  it('returns positive costs', async () => {
    const result = await estimatePrompt('Explain the theory of relativity in detail.');
    expect(result.totalCost).toBeGreaterThan(0);
  });
});

describe('compareModels()', () => {
  const messages: Message[] = [{ role: 'user', content: 'Write a haiku about the sea.' }];

  it('returns one estimate per model', async () => {
    const results = await compareModels(messages, ['gpt-4o', 'gpt-4o-mini']);
    expect(results).toHaveLength(2);
  });

  it('returns results sorted by totalCost ascending', async () => {
    const results = await compareModels(messages, ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].totalCost).toBeGreaterThanOrEqual(results[i - 1].totalCost);
    }
  });

  it('cheaper model comes first (gpt-4o-mini cheaper than gpt-4o)', async () => {
    const results = await compareModels(messages, ['gpt-4o', 'gpt-4o-mini']);
    expect(results[0].model).toBe('gpt-4o-mini');
  });

  it('each result has correct provider', async () => {
    const results = await compareModels(messages, ['gpt-4o', 'claude-3-5-sonnet']);
    const openaiResult = results.find((r) => r.model === 'gpt-4o');
    const anthropicResult = results.find((r) => r.model === 'claude-3-5-sonnet');
    expect(openaiResult?.provider).toBe('openai');
    expect(anthropicResult?.provider).toBe('anthropic');
  });
});
