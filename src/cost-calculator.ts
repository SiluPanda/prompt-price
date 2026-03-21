/**
 * Calculate the cost in USD for a given number of tokens and price per million.
 */
export function calculateCost(tokens: number, pricePerMillion: number): number {
  const raw = (tokens / 1_000_000) * pricePerMillion;
  // Round to 6 decimal places
  return Math.round(raw * 1_000_000) / 1_000_000;
}

/**
 * Format a cost as a dollar string, e.g. "$0.001234"
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(6)}`;
}
