import type { CountTokensOptions, TokenCount } from './types';
import { estimateTokens } from './heuristic-counter';

function compute(content: string, options?: CountTokensOptions): TokenCount {
  // Determine provider from model string if provided
  let provider = 'openai'; // default
  if (options?.model) {
    const m = options.model.toLowerCase();
    if (m.startsWith('claude-')) provider = 'anthropic';
    else if (m.startsWith('gemini-')) provider = 'google';
    else if (m.startsWith('llama-')) provider = 'meta';
    else if (m.startsWith('mistral-') || m.startsWith('codestral-')) provider = 'mistral';
    else if (m.startsWith('command-')) provider = 'cohere';
  }

  const tokens = estimateTokens(content, provider);

  const result: TokenCount = {
    tokens,
    method: 'approximate',
  };

  if (options?.model) {
    (result as TokenCount & { model?: string }).model = options.model;
  }

  return result;
}

export async function countTokens(
  content: string,
  options?: CountTokensOptions,
): Promise<TokenCount> {
  return compute(content, options);
}

export function countTokensSync(
  content: string,
  options?: CountTokensOptions,
): TokenCount {
  return compute(content, options);
}
