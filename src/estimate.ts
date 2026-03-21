import type { EstimateOptions, Estimate, Message } from './types';
import { resolveModel } from './model-resolver';
import { countContentTokens, estimateTokens } from './heuristic-counter';
import { messageOverhead, baseOverhead } from './message-overhead';
import { estimateToolTokens } from './tool-tokenizer';
import { calculateCost } from './cost-calculator';

function computeEstimate(options: EstimateOptions): Estimate {
  const resolved = resolveModel(options.model, options.provider);
  const { provider, modelId } = resolved;

  let systemTokens = 0;
  let conversationTokens = 0;
  let toolTokens = 0;

  // Base overhead
  let inputTokens = baseOverhead(provider);

  // System prompt
  if (options.systemPrompt) {
    systemTokens = estimateTokens(options.systemPrompt, provider);
    inputTokens += systemTokens;
  }

  // Messages
  const messages: Message[] = options.messages ?? [];
  for (const msg of messages) {
    const overhead = messageOverhead(msg.role, provider);
    const contentTokens = countContentTokens(msg.content, provider);
    conversationTokens += overhead + contentTokens;
  }
  inputTokens += conversationTokens;

  // Tool definitions
  if (options.tools && options.tools.length > 0) {
    toolTokens = estimateToolTokens(options.tools, provider);
    inputTokens += toolTokens;
  }

  // Output token estimate
  const outputTokens = options.maxOutputTokens ?? Math.min(Math.ceil(inputTokens * 0.3), 1000);

  // Costs
  const inputCost = calculateCost(inputTokens, resolved.inputPricePerMillion);
  const outputCost = calculateCost(outputTokens, resolved.outputPricePerMillion);
  const totalCostFinal = Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;

  const breakdown: Estimate['breakdown'] = {};
  if (systemTokens > 0) breakdown.systemTokens = systemTokens;
  if (conversationTokens > 0) breakdown.conversationTokens = conversationTokens;
  if (toolTokens > 0) breakdown.toolTokens = toolTokens;

  return {
    model: modelId,
    provider,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost: totalCostFinal,
    currency: 'USD',
    method: 'approximate',
    breakdown: Object.keys(breakdown).length > 0 ? breakdown : undefined,
  };
}

export async function estimate(options: EstimateOptions): Promise<Estimate> {
  return computeEstimate(options);
}

export function estimateSync(options: EstimateOptions): Estimate {
  return computeEstimate(options);
}

export async function estimatePrompt(
  prompt: string,
  options?: Omit<EstimateOptions, 'prompt'>,
): Promise<Estimate> {
  const messages: Message[] = [{ role: 'user', content: prompt }];
  return estimate({
    ...options,
    model: options?.model ?? 'gpt-4o',
    messages,
  });
}

export async function compareModels(
  messages: Message[],
  models: string[],
  options?: Omit<EstimateOptions, 'model' | 'messages'>,
): Promise<Estimate[]> {
  const estimates = await Promise.all(
    models.map((model) => estimate({ ...options, model, messages })),
  );
  return estimates.sort((a, b) => a.totalCost - b.totalCost);
}
