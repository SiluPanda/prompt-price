import type {
  CheckBudgetOptions,
  BudgetResult,
  GuardOptions,
  SupportedClient,
  OpenAILikeClient,
  AnthropicLikeClient,
  Message,
} from './types';
import { estimate } from './estimate';
import { BudgetExceededError } from './errors';

export async function checkBudget(options: CheckBudgetOptions): Promise<BudgetResult> {
  const est = await estimate({
    model: options.model,
    provider: options.provider,
    messages: options.messages,
    maxOutputTokens: options.maxOutputTokens,
  });

  const withinBudget = est.totalCost <= options.budget;
  const remaining = Math.max(0, options.budget - est.totalCost);
  const utilizationPct = options.budget > 0 ? (est.totalCost / options.budget) * 100 : 0;

  return {
    withinBudget,
    estimate: est,
    budget: options.budget,
    remaining,
    utilizationPct,
  };
}

function isOpenAIClient(client: SupportedClient): client is OpenAILikeClient {
  return 'chat' in client;
}

function isAnthropicClient(client: SupportedClient): client is AnthropicLikeClient {
  return 'messages' in client;
}

export function guard<T extends SupportedClient>(client: T, options: GuardOptions): T {
  const onExceed = options.onExceed ?? 'throw';

  async function checkAndMaybeThrow(params: Record<string, unknown>): Promise<void> {
    // Extract messages from params for cost estimation
    const messages = (params['messages'] as Message[] | undefined) ?? [];
    const maxOutputTokens =
      options.maxOutputTokens ??
      (typeof params['max_tokens'] === 'number' ? params['max_tokens'] : undefined) ??
      (typeof params['maxTokens'] === 'number' ? params['maxTokens'] : undefined);

    const est = await estimate({
      model: options.model,
      provider: options.provider,
      messages,
      maxOutputTokens,
    });

    if (est.totalCost > options.maxCost) {
      if (onExceed === 'throw') {
        throw new BudgetExceededError(est, options.maxCost);
      } else if (onExceed === 'warn') {
        console.warn(`[prompt-price] Budget warning: estimated cost $${est.totalCost.toFixed(6)} exceeds maxCost $${options.maxCost.toFixed(6)}`);
      } else {
        console.log(`[prompt-price] Budget log: estimated cost $${est.totalCost.toFixed(6)} exceeds maxCost $${options.maxCost.toFixed(6)}`);
      }
    }
  }

  if (isOpenAIClient(client)) {
    const wrapped: OpenAILikeClient = {
      chat: {
        completions: {
          async create(params: Record<string, unknown>): Promise<unknown> {
            await checkAndMaybeThrow(params);
            return client.chat.completions.create(params);
          },
        },
      },
    };
    return wrapped as unknown as T;
  }

  if (isAnthropicClient(client)) {
    const wrapped: AnthropicLikeClient = {
      messages: {
        async create(params: Record<string, unknown>): Promise<unknown> {
          await checkAndMaybeThrow(params);
          return client.messages.create(params);
        },
      },
    };
    return wrapped as unknown as T;
  }

  // Unknown client shape — return as-is
  return client;
}
