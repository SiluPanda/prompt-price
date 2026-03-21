import { describe, it, expect } from 'vitest';
import { resolveModel } from '../model-resolver';
import { ModelNotFoundError } from '../errors';

describe('resolveModel', () => {
  describe('exact known models', () => {
    it('resolves gpt-4o', () => {
      const r = resolveModel('gpt-4o');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(2.50);
      expect(r.outputPricePerMillion).toBe(10.00);
    });

    it('resolves gpt-4o-mini', () => {
      const r = resolveModel('gpt-4o-mini');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(0.15);
      expect(r.outputPricePerMillion).toBe(0.60);
    });

    it('resolves gpt-4.1', () => {
      const r = resolveModel('gpt-4.1');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(2.00);
    });

    it('resolves gpt-4.1-mini', () => {
      const r = resolveModel('gpt-4.1-mini');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(0.40);
    });

    it('resolves gpt-4-turbo', () => {
      const r = resolveModel('gpt-4-turbo');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(10.00);
      expect(r.outputPricePerMillion).toBe(30.00);
    });

    it('resolves gpt-3.5-turbo', () => {
      const r = resolveModel('gpt-3.5-turbo');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(0.50);
    });

    it('resolves o1', () => {
      const r = resolveModel('o1');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(15.00);
      expect(r.outputPricePerMillion).toBe(60.00);
    });

    it('resolves o1-mini', () => {
      const r = resolveModel('o1-mini');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(3.00);
    });

    it('resolves o3-mini', () => {
      const r = resolveModel('o3-mini');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(1.10);
    });

    it('resolves claude-opus-4', () => {
      const r = resolveModel('claude-opus-4');
      expect(r.provider).toBe('anthropic');
      expect(r.inputPricePerMillion).toBe(15.00);
      expect(r.outputPricePerMillion).toBe(75.00);
    });

    it('resolves claude-3-5-sonnet', () => {
      const r = resolveModel('claude-3-5-sonnet');
      expect(r.provider).toBe('anthropic');
      expect(r.inputPricePerMillion).toBe(3.00);
    });

    it('resolves claude-3-haiku', () => {
      const r = resolveModel('claude-3-haiku');
      expect(r.provider).toBe('anthropic');
      expect(r.inputPricePerMillion).toBe(0.25);
    });

    it('resolves gemini-2.0-flash', () => {
      const r = resolveModel('gemini-2.0-flash');
      expect(r.provider).toBe('google');
      expect(r.inputPricePerMillion).toBe(0.10);
    });

    it('resolves gemini-1.5-pro', () => {
      const r = resolveModel('gemini-1.5-pro');
      expect(r.provider).toBe('google');
      expect(r.inputPricePerMillion).toBe(1.25);
    });

    it('resolves mistral-large', () => {
      const r = resolveModel('mistral-large');
      expect(r.provider).toBe('mistral');
      expect(r.inputPricePerMillion).toBe(2.00);
    });

    it('resolves command-r-plus', () => {
      const r = resolveModel('command-r-plus');
      expect(r.provider).toBe('cohere');
      expect(r.inputPricePerMillion).toBe(2.50);
    });

    it('resolves command-r', () => {
      const r = resolveModel('command-r');
      expect(r.provider).toBe('cohere');
      expect(r.inputPricePerMillion).toBe(0.15);
    });

    it('resolves llama-3.1-70b', () => {
      const r = resolveModel('llama-3.1-70b');
      expect(r.provider).toBe('meta');
      expect(r.inputPricePerMillion).toBe(0.88);
    });
  });

  describe('provider/model format', () => {
    it('resolves openai/gpt-4o', () => {
      const r = resolveModel('openai/gpt-4o');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(2.50);
    });

    it('resolves anthropic/claude-3-5-sonnet', () => {
      const r = resolveModel('anthropic/claude-3-5-sonnet');
      expect(r.provider).toBe('anthropic');
    });
  });

  describe('prefix / partial matching', () => {
    it('resolves gpt-4o-2024-08-06 via prefix match to gpt-4o', () => {
      const r = resolveModel('gpt-4o-2024-08-06');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(2.50);
    });

    it('resolves gpt-4o-mini-2024-07-18 via prefix match to gpt-4o-mini', () => {
      const r = resolveModel('gpt-4o-mini-2024-07-18');
      expect(r.provider).toBe('openai');
      expect(r.inputPricePerMillion).toBe(0.15);
    });

    it('resolves claude-3-5-sonnet-20241022 via prefix match', () => {
      const r = resolveModel('claude-3-5-sonnet-20241022');
      expect(r.provider).toBe('anthropic');
    });
  });

  describe('provider hint', () => {
    it('uses explicit provider hint', () => {
      const r = resolveModel('gpt-4o', 'openai');
      expect(r.provider).toBe('openai');
    });
  });

  describe('unknown model', () => {
    it('throws ModelNotFoundError for unknown model', () => {
      expect(() => resolveModel('unknown-model-xyz')).toThrow(ModelNotFoundError);
    });

    it('error message contains the model string', () => {
      try {
        resolveModel('some-completely-unknown-model');
      } catch (err) {
        expect(err).toBeInstanceOf(ModelNotFoundError);
        expect((err as ModelNotFoundError).model).toBe('some-completely-unknown-model');
      }
    });
  });
});
