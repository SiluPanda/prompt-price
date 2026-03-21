import type { Estimate } from './types';

export class BudgetExceededError extends Error {
  readonly name = 'BudgetExceededError';
  constructor(
    readonly estimate: Estimate,
    readonly maxCost: number,
  ) {
    super(
      `Cost estimate $${estimate.totalCost.toFixed(6)} exceeds budget $${maxCost.toFixed(6)} ` +
      `for model ${estimate.model} ` +
      `(${estimate.inputTokens} input + ${estimate.outputTokens} output tokens)`
    );
    Object.setPrototypeOf(this, BudgetExceededError.prototype);
  }
}

export class ModelNotFoundError extends Error {
  readonly name = 'ModelNotFoundError';
  constructor(readonly model: string) {
    super(`Model not found in price registry: "${model}"`);
    Object.setPrototypeOf(this, ModelNotFoundError.prototype);
  }
}
