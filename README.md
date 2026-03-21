# prompt-price

Pre-flight cost estimation for any prompt and model combination. Know what an LLM call will cost before you send it.

## Installation

```bash
npm install prompt-price
```

### Optional: exact token counting

```bash
npm install js-tiktoken
```

When `js-tiktoken` is installed, `prompt-price` can use native tiktoken encodings for exact OpenAI token counts. Without it, a calibrated heuristic is used (fast, no WASM overhead, typically within 5% of exact counts).

## Quick Start

```ts
import { estimate, countTokens, compareModels, guard } from 'prompt-price';

// Estimate cost for a prompt
const est = await estimate({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Explain quantum computing' }],
});
console.log(`Estimated cost: $${est.totalCost.toFixed(6)}`);
// -> Estimated cost: $0.000053

// Count tokens without cost calculation
const tokens = await countTokens('Hello, world!', { model: 'gpt-4o' });
console.log(`Tokens: ${tokens.tokens} (${tokens.method})`);
// -> Tokens: 4 (approximate)

// Compare costs across models
const comparison = await compareModels(
  [{ role: 'user', content: 'Write a haiku' }],
  ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'gemini-2.0-flash'],
);
comparison.forEach((e) =>
  console.log(`${e.model}: $${e.totalCost.toFixed(6)}`),
);
// Results are sorted cheapest-first

// Budget guard -- wraps an OpenAI or Anthropic client
import OpenAI from 'openai';
const openai = guard(new OpenAI(), { model: 'gpt-4o', maxCost: 0.05 });
// Throws BudgetExceededError if a request would exceed $0.05
```

## API Reference

### `estimate(options): Promise<Estimate>`

Estimate the cost of an LLM call before sending it.

```ts
const est = await estimate({
  model: 'gpt-4o',                   // required — model name or "provider/model"
  provider: 'openai',                // optional — explicit provider override
  messages: [                        // optional — conversation messages
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2?' },
  ],
  systemPrompt: 'Be concise.',       // optional — prepended system prompt
  maxOutputTokens: 256,              // optional — caps output token estimate
  tools: [...],                      // optional — tool definitions
});

console.log(est.inputTokens);   // e.g. 42
console.log(est.outputTokens);  // e.g. 77
console.log(est.inputCost);     // e.g. 0.000105
console.log(est.outputCost);    // e.g. 0.000770
console.log(est.totalCost);     // e.g. 0.000875
console.log(est.currency);      // 'USD'
console.log(est.method);        // 'approximate'
console.log(est.provider);      // 'openai'
console.log(est.model);         // 'gpt-4o'
```

### `estimateSync(options): Estimate`

Synchronous version of `estimate()`. Same parameters and return value.

```ts
const est = estimateSync({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Hi' }] });
```

### `estimatePrompt(prompt, options?): Promise<Estimate>`

Convenience wrapper that treats a plain string as a single user message.

```ts
const est = await estimatePrompt('Explain general relativity', { model: 'gpt-4o' });
```

### `compareModels(messages, models, options?): Promise<Estimate[]>`

Run `estimate()` for multiple models and return results sorted by total cost (ascending).

```ts
const results = await compareModels(
  [{ role: 'user', content: 'Summarize this article...' }],
  ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'gemini-1.5-flash'],
);
results.forEach((r) => console.log(`${r.model}: $${r.totalCost.toFixed(6)}`));
```

### `countTokens(content, options?): Promise<TokenCount>`

Estimate the token count of a string.

```ts
const result = await countTokens('Hello, world!', { model: 'gpt-4o' });
// { tokens: 4, method: 'approximate' }
```

### `countTokensSync(content, options?): TokenCount`

Synchronous version of `countTokens()`.

```ts
const result = countTokensSync('Hello, world!', { model: 'claude-3-5-sonnet' });
```

### `checkBudget(options): Promise<BudgetResult>`

Check whether an API call would fit within a cost budget.

```ts
const result = await checkBudget({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
  budget: 0.01,
});
console.log(result.withinBudget);    // true or false
console.log(result.utilizationPct); // e.g. 0.53 (0.53%)
console.log(result.remaining);      // e.g. 0.009947
```

### `guard(client, options): T`

Wrap an OpenAI or Anthropic SDK client to automatically check costs before every request.

```ts
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { guard, BudgetExceededError } from 'prompt-price';

const openai = guard(new OpenAI(), {
  model: 'gpt-4o',
  maxCost: 0.05,
  onExceed: 'throw',  // 'throw' | 'warn' | 'log'
});

try {
  const response = await openai.chat.completions.create({ ... });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(`Blocked: $${err.estimate.totalCost} > $${err.maxCost}`);
  }
}
```

## Supported Models

| Provider  | Models |
|-----------|--------|
| OpenAI    | gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4-turbo, gpt-3.5-turbo, o1, o1-mini, o3-mini |
| Anthropic | claude-opus-4, claude-sonnet-4-5, claude-haiku-4-5, claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus, claude-3-haiku |
| Google    | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash |
| Meta      | llama-3.1-70b, llama-3.3-70b |
| Mistral   | mistral-large, mistral-small |
| Cohere    | command-r-plus, command-r |

Models can be specified as bare names (`gpt-4o`) or with a provider prefix (`openai/gpt-4o`). Partial/versioned names are resolved via prefix matching — e.g. `gpt-4o-2024-08-06` resolves to `gpt-4o`.

## Available Exports

### Types

All 13 TypeScript interfaces are exported:

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

- `BudgetExceededError` -- thrown when a cost estimate exceeds the configured budget. Contains `estimate` and `maxCost` properties.
- `ModelNotFoundError` -- thrown when a model is not found in the price catalog. Contains the `model` string.

```ts
import { BudgetExceededError, ModelNotFoundError } from 'prompt-price';

try {
  const est = await estimate({ model: 'unknown-model', messages: [] });
} catch (err) {
  if (err instanceof ModelNotFoundError) {
    console.log(`Unknown model: ${err.model}`);
  }
}
```

## Token Counting Method

All token counts use a calibrated heuristic (chars ÷ provider-specific ratio, rounded up):

| Provider  | Chars per token |
|-----------|----------------|
| OpenAI    | 3.9 |
| Anthropic | 3.5 |
| Google    | 4.0 |
| Mistral   | 3.8 |
| Meta      | 3.7 |
| Cohere    | 4.0 |

Output tokens default to `min(ceil(inputTokens * 0.3), 1000)` unless `maxOutputTokens` is provided.

## License

MIT
