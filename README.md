# prompt-price

Pre-flight cost estimation for any prompt and model combination. Know what an LLM call will cost before you send it.

## Installation

```bash
npm install prompt-price model-price-registry
```

`model-price-registry` is a required peer dependency that provides up-to-date pricing data for all major LLM providers.

### Optional: exact token counting

```bash
npm install js-tiktoken
```

When `js-tiktoken` is installed, `prompt-price` uses native tiktoken encodings for exact OpenAI token counts. Without it, a calibrated heuristic is used (fast, no WASM overhead, typically within 5% of exact counts).

## Quick Start

```ts
import { estimate, countTokens, compareModels, guard } from 'prompt-price';

// Estimate cost for a prompt
const est = await estimate({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Explain quantum computing' }],
});
console.log(`Estimated cost: $${est.totalCost.toFixed(6)}`);

// Count tokens without cost calculation
const tokens = await countTokens('Hello, world!', { model: 'gpt-4o' });
console.log(`Tokens: ${tokens.tokens} (${tokens.method})`);

// Compare costs across models
const comparison = await compareModels(
  [{ role: 'user', content: 'Write a haiku' }],
  ['gpt-4o', 'claude-sonnet-4-20250514', 'gemini-2.5-pro'],
);
comparison.forEach((e) =>
  console.log(`${e.model}: $${e.totalCost.toFixed(6)}`),
);

// Budget guard -- wraps an OpenAI or Anthropic client
import OpenAI from 'openai';
const openai = guard(new OpenAI(), { model: 'gpt-4o', maxCost: 0.05 });
// Throws BudgetExceededError if a request would exceed $0.05
```

> **Note:** `estimate`, `countTokens`, `compareModels`, and `guard` are planned API functions that are not yet implemented. Currently only types and error classes are exported.

## Available Exports

### Types

All 13 TypeScript interfaces are exported for use in your own code:

- `Message` -- a single conversation message
- `ContentPart` -- multi-modal content (text, image, audio, file)
- `ToolCall` -- a tool call made by an assistant
- `ToolDefinition` -- a tool/function definition
- `EstimateOptions` -- options for `estimate()`
- `CountTokensOptions` -- options for `countTokens()`
- `TokenCount` -- result of a token count operation
- `Estimate` -- a full cost estimate result
- `GuardOptions` -- options for the `guard()` middleware
- `CheckBudgetOptions` -- options for `checkBudget()`
- `BudgetResult` -- result of `checkBudget()`
- `OpenAILikeClient` -- type for OpenAI-compatible SDK clients
- `AnthropicLikeClient` -- type for Anthropic-compatible SDK clients

### Error Classes

- `BudgetExceededError` -- thrown when a cost estimate exceeds the configured budget. Contains the `estimate` and `maxCost` properties.
- `ModelNotFoundError` -- thrown when a model is not found in the price registry. Contains the `model` string.

```ts
import { BudgetExceededError, ModelNotFoundError } from 'prompt-price';

try {
  // ... estimate or guard call
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(`Over budget: ${err.estimate.totalCost} > ${err.maxCost}`);
  }
}
```

## Planned Features

- **Heuristic token counting** -- fast, zero-dependency token estimation calibrated per provider
- **Native tiktoken counting** -- exact OpenAI token counts via optional `js-tiktoken` peer dependency
- **Multi-provider support** -- OpenAI, Anthropic, Google, Mistral, Cohere, Meta
- **Image token estimation** -- provider-specific formulas for vision model inputs
- **Tool definition tokenization** -- accurate token counts for function/tool schemas
- **Budget guards** -- proxy-based middleware for OpenAI and Anthropic SDKs
- **Model comparison** -- compare costs across models with a single call
- **CLI** -- `prompt-price estimate gpt-4o --file prompt.txt`

## License

MIT
