import type { ToolDefinition } from './types';

/**
 * Estimate the number of tokens consumed by a list of tool definitions.
 */
export function estimateToolTokens(tools: ToolDefinition[], provider: string): number {
  if (!tools || tools.length === 0) return 0;

  let total = 0;
  for (const tool of tools) {
    const fn = tool.function;
    // Name: ~10 tokens
    const nameTokens = 10;
    // Description: length / 4
    const descTokens = fn.description ? Math.ceil(fn.description.length / 4) : 0;
    // Parameters schema: JSON length / 4
    const paramsTokens = fn.parameters ? Math.ceil(JSON.stringify(fn.parameters).length / 4) : 0;
    // Per-tool formatting overhead
    const overheadTokens = 30;

    total += nameTokens + descTokens + paramsTokens + overheadTokens;
  }

  // Suppress unused parameter warning — provider may be used in future for provider-specific
  void provider;

  return total;
}
