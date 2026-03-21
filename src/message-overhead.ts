/**
 * Per-message token overhead (role tokens, formatting, etc.)
 */
export function messageOverhead(role: string, provider: string): number {
  const p = provider.toLowerCase();
  if (p === 'openai') {
    return 4; // 4 tokens per message for role + formatting
  }
  if (p === 'anthropic') {
    return 4;
  }
  return 5;
}

/**
 * Base request overhead added once per API call.
 */
export function baseOverhead(provider: string): number {
  const p = provider.toLowerCase();
  if (p === 'openai') {
    return 3;
  }
  return 10;
}
