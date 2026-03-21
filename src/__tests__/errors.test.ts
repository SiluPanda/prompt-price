import { describe, it, expect } from 'vitest';
import { BudgetExceededError, ModelNotFoundError } from '../errors';
import type { Estimate } from '../types';

function makeEstimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    model: 'openai/gpt-4o',
    provider: 'openai',
    inputTokens: 100,
    outputTokens: 50,
    inputCost: 0.000250,
    outputCost: 0.001000,
    totalCost: 0.001250,
    currency: 'USD',
    method: 'approximate',
    ...overrides,
  };
}

describe('BudgetExceededError', () => {
  it('has name BudgetExceededError', () => {
    const err = new BudgetExceededError(makeEstimate(), 0.001000);
    expect(err.name).toBe('BudgetExceededError');
  });

  it('instanceof Error', () => {
    const err = new BudgetExceededError(makeEstimate(), 0.001000);
    expect(err).toBeInstanceOf(Error);
  });

  it('instanceof BudgetExceededError', () => {
    const err = new BudgetExceededError(makeEstimate(), 0.001000);
    expect(err).toBeInstanceOf(BudgetExceededError);
  });

  it('message contains cost with 6 decimal places', () => {
    const est = makeEstimate({ totalCost: 0.001234 });
    const err = new BudgetExceededError(est, 0.001000);
    expect(err.message).toContain('0.001234');
  });

  it('message contains budget with 6 decimal places', () => {
    const est = makeEstimate({ totalCost: 0.001234 });
    const err = new BudgetExceededError(est, 0.001000);
    expect(err.message).toContain('0.001000');
  });

  it('message contains model name', () => {
    const est = makeEstimate({ model: 'openai/gpt-4o' });
    const err = new BudgetExceededError(est, 0.001000);
    expect(err.message).toContain('openai/gpt-4o');
  });

  it('message contains input token count', () => {
    const est = makeEstimate({ inputTokens: 100 });
    const err = new BudgetExceededError(est, 0.001000);
    expect(err.message).toContain('100');
  });

  it('message contains output token count', () => {
    const est = makeEstimate({ outputTokens: 50 });
    const err = new BudgetExceededError(est, 0.001000);
    expect(err.message).toContain('50');
  });

  it('estimate property is accessible', () => {
    const est = makeEstimate({ totalCost: 0.001234 });
    const err = new BudgetExceededError(est, 0.001000);
    expect(err.estimate).toBe(est);
    expect(err.estimate.totalCost).toBe(0.001234);
  });

  it('maxCost property is accessible', () => {
    const err = new BudgetExceededError(makeEstimate(), 0.001000);
    expect(err.maxCost).toBe(0.001000);
  });

  it('with cost=0.001234 and budget=0.001000, message has 6 decimal places', () => {
    const est = makeEstimate({ totalCost: 0.001234 });
    const err = new BudgetExceededError(est, 0.001000);
    // Both values must appear with 6 decimal places in the message
    expect(err.message).toMatch(/\$0\.001234/);
    expect(err.message).toMatch(/\$0\.001000/);
  });

  it('prototype chain is correct', () => {
    const err = new BudgetExceededError(makeEstimate(), 0.001000);
    expect(Object.getPrototypeOf(err)).toBe(BudgetExceededError.prototype);
  });
});

describe('ModelNotFoundError', () => {
  it('has name ModelNotFoundError', () => {
    const err = new ModelNotFoundError('fake-model');
    expect(err.name).toBe('ModelNotFoundError');
  });

  it('instanceof Error', () => {
    const err = new ModelNotFoundError('fake-model');
    expect(err).toBeInstanceOf(Error);
  });

  it('message contains the model string', () => {
    const err = new ModelNotFoundError('my-custom-model');
    expect(err.message).toContain('my-custom-model');
  });

  it('model property is accessible', () => {
    const err = new ModelNotFoundError('openai/unknown-model');
    expect(err.model).toBe('openai/unknown-model');
  });

  it('prototype chain is correct', () => {
    const err = new ModelNotFoundError('some-model');
    expect(Object.getPrototypeOf(err)).toBe(ModelNotFoundError.prototype);
  });
});
