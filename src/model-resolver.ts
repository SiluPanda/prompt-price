import { ModelNotFoundError } from './errors';

export interface ResolvedModel {
  provider: string;
  modelId: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

interface ModelEntry {
  provider: string;
  prefix: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

const MODEL_CATALOG: ModelEntry[] = [
  // OpenAI
  { provider: 'openai', prefix: 'gpt-4o-mini', inputPricePerMillion: 0.15, outputPricePerMillion: 0.60 },
  { provider: 'openai', prefix: 'gpt-4o', inputPricePerMillion: 2.50, outputPricePerMillion: 10.00 },
  { provider: 'openai', prefix: 'gpt-4.1-mini', inputPricePerMillion: 0.40, outputPricePerMillion: 1.60 },
  { provider: 'openai', prefix: 'gpt-4.1', inputPricePerMillion: 2.00, outputPricePerMillion: 8.00 },
  { provider: 'openai', prefix: 'gpt-4-turbo', inputPricePerMillion: 10.00, outputPricePerMillion: 30.00 },
  { provider: 'openai', prefix: 'gpt-3.5-turbo', inputPricePerMillion: 0.50, outputPricePerMillion: 1.50 },
  { provider: 'openai', prefix: 'o1-mini', inputPricePerMillion: 3.00, outputPricePerMillion: 12.00 },
  { provider: 'openai', prefix: 'o1', inputPricePerMillion: 15.00, outputPricePerMillion: 60.00 },
  { provider: 'openai', prefix: 'o3-mini', inputPricePerMillion: 1.10, outputPricePerMillion: 4.40 },
  // Anthropic
  { provider: 'anthropic', prefix: 'claude-opus-4', inputPricePerMillion: 15.00, outputPricePerMillion: 75.00 },
  { provider: 'anthropic', prefix: 'claude-sonnet-4-5', inputPricePerMillion: 3.00, outputPricePerMillion: 15.00 },
  { provider: 'anthropic', prefix: 'claude-haiku-4-5', inputPricePerMillion: 0.80, outputPricePerMillion: 4.00 },
  { provider: 'anthropic', prefix: 'claude-3-5-sonnet', inputPricePerMillion: 3.00, outputPricePerMillion: 15.00 },
  { provider: 'anthropic', prefix: 'claude-3-5-haiku', inputPricePerMillion: 0.80, outputPricePerMillion: 4.00 },
  { provider: 'anthropic', prefix: 'claude-3-opus', inputPricePerMillion: 15.00, outputPricePerMillion: 75.00 },
  { provider: 'anthropic', prefix: 'claude-3-haiku', inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 },
  // Google
  { provider: 'google', prefix: 'gemini-2.0-flash', inputPricePerMillion: 0.10, outputPricePerMillion: 0.40 },
  { provider: 'google', prefix: 'gemini-1.5-pro', inputPricePerMillion: 1.25, outputPricePerMillion: 5.00 },
  { provider: 'google', prefix: 'gemini-1.5-flash', inputPricePerMillion: 0.075, outputPricePerMillion: 0.30 },
  // Meta
  { provider: 'meta', prefix: 'llama-3.1-70b', inputPricePerMillion: 0.88, outputPricePerMillion: 0.88 },
  { provider: 'meta', prefix: 'llama-3.3-70b', inputPricePerMillion: 0.88, outputPricePerMillion: 0.88 },
  // Mistral
  { provider: 'mistral', prefix: 'mistral-large', inputPricePerMillion: 2.00, outputPricePerMillion: 6.00 },
  { provider: 'mistral', prefix: 'mistral-small', inputPricePerMillion: 0.10, outputPricePerMillion: 0.30 },
  // Cohere
  { provider: 'cohere', prefix: 'command-r-plus', inputPricePerMillion: 2.50, outputPricePerMillion: 10.00 },
  { provider: 'cohere', prefix: 'command-r', inputPricePerMillion: 0.15, outputPricePerMillion: 0.60 },
];

function inferProvider(modelId: string): string | undefined {
  if (/^(gpt-|o1|o3|o4)/.test(modelId)) return 'openai';
  if (/^claude-/.test(modelId)) return 'anthropic';
  if (/^gemini-/.test(modelId)) return 'google';
  if (/^llama-/.test(modelId)) return 'meta';
  if (/^(mistral-|codestral-)/.test(modelId)) return 'mistral';
  if (/^command-/.test(modelId)) return 'cohere';
  return undefined;
}

/**
 * Parses a model string that may have an explicit "provider/modelId" format.
 * Returns { provider, modelId } where provider may be undefined if not explicit.
 */
function parseModelString(model: string): { explicitProvider?: string; modelId: string } {
  const slashIdx = model.indexOf('/');
  if (slashIdx !== -1) {
    return {
      explicitProvider: model.slice(0, slashIdx),
      modelId: model.slice(slashIdx + 1),
    };
  }
  return { modelId: model };
}

export function resolveModel(model: string, providerHint?: string): ResolvedModel {
  const { explicitProvider, modelId } = parseModelString(model);
  const provider = providerHint ?? explicitProvider;

  // Sort entries by prefix length descending to match more specific prefixes first
  const sorted = MODEL_CATALOG.slice().sort((a, b) => b.prefix.length - a.prefix.length);

  for (const entry of sorted) {
    const idToMatch = modelId.toLowerCase();
    const prefixLower = entry.prefix.toLowerCase();

    // If provider is specified, filter to it
    if (provider && entry.provider !== provider) continue;

    // Prefix match: model id starts with the catalog prefix
    if (idToMatch === prefixLower || idToMatch.startsWith(prefixLower + '-') || idToMatch.startsWith(prefixLower + '.') || idToMatch.startsWith(prefixLower + '_') || idToMatch.startsWith(prefixLower + ':')) {
      return {
        provider: entry.provider,
        modelId: entry.prefix,
        inputPricePerMillion: entry.inputPricePerMillion,
        outputPricePerMillion: entry.outputPricePerMillion,
      };
    }
    // Exact match fallback
    if (idToMatch === prefixLower) {
      return {
        provider: entry.provider,
        modelId: entry.prefix,
        inputPricePerMillion: entry.inputPricePerMillion,
        outputPricePerMillion: entry.outputPricePerMillion,
      };
    }
  }

  // Try without provider filter as a fallback when provider was specified but no match
  if (provider) {
    for (const entry of sorted) {
      const idToMatch = modelId.toLowerCase();
      const prefixLower = entry.prefix.toLowerCase();
      if (idToMatch === prefixLower || idToMatch.startsWith(prefixLower + '-') || idToMatch.startsWith(prefixLower + '.')) {
        return {
          provider: entry.provider,
          modelId: entry.prefix,
          inputPricePerMillion: entry.inputPricePerMillion,
          outputPricePerMillion: entry.outputPricePerMillion,
        };
      }
    }
  }

  // Final attempt: infer provider and try again
  const inferredProvider = inferProvider(modelId.toLowerCase());
  if (inferredProvider) {
    for (const entry of sorted) {
      if (entry.provider !== inferredProvider) continue;
      const idToMatch = modelId.toLowerCase();
      const prefixLower = entry.prefix.toLowerCase();
      if (idToMatch.startsWith(prefixLower)) {
        return {
          provider: entry.provider,
          modelId: entry.prefix,
          inputPricePerMillion: entry.inputPricePerMillion,
          outputPricePerMillion: entry.outputPricePerMillion,
        };
      }
    }
  }

  throw new ModelNotFoundError(model);
}
