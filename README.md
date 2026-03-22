# prompt-price

Pre-flight cost estimation for any prompt and model combination. Know what an LLM call will cost before you send it.

[![npm version](https://img.shields.io/npm/v/prompt-price.svg)](https://www.npmjs.com/package/prompt-price)
[![npm downloads](https://img.shields.io/npm/dt/prompt-price.svg)](https://www.npmjs.com/package/prompt-price)
[![license](https://img.shields.io/npm/l/prompt-price.svg)](https://github.com/SiluPanda/prompt-price/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/prompt-price.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

## Description

`prompt-price` answers the question "how much will this request cost?" with a single function call -- before the API call is made. Existing LLM SDKs report token usage and cost after the response arrives, by which time the money is already spent. This package composes token counting, provider-specific message overhead calculation, tool definition tokenization, and model pricing into a unified estimation pipeline.

The package supports six providers out of the box (OpenAI, Anthropic, Google, Meta, Mistral, Cohere) and uses calibrated per-provider character-to-token ratios for fast approximate counting without any WASM or native dependencies. A budget guard middleware wraps any OpenAI or Anthropic SDK client to enforce cost limits automatically, preventing runaway spend from unexpectedly large context windows, prompt injection, or developer error.

---

## Installation

```bash
npm install prompt-price model-price-registry
```

`model-price-registry` is a required peer dependency that provides model pricing data.

### Optional: exact token counting

```bash
npm install js-tiktoken
```

When `js-tiktoken` is installed, `prompt-price` can use native tiktoken encodings for exact OpenAI token counts. Without it, a calibrated heuristic is used (fast, no WASM overhead, typically within 5% of exact counts).

---

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

---

## Features

- **Pre-flight cost estimation** -- Get token counts and dollar costs before making any API call.
- **Multi-provider support** -- Built-in pricing and token heuristics for OpenAI, Anthropic, Google, Meta, Mistral, and Cohere models.
- **Budget guard middleware** -- Wrap OpenAI or Anthropic SDK clients to enforce per-request cost limits automatically.
- **Multi-model comparison** -- Estimate the same prompt against multiple models in one call, sorted by cost.
- **Tool definition accounting** -- Estimates tokens consumed by function/tool definitions passed in the request.
- **Multimodal content support** -- Handles text, images (with detail-level awareness), audio, and file content parts.
- **System prompt tracking** -- Separately counts system prompt tokens with per-component breakdowns.
- **Sync and async APIs** -- Every core function has both an async and synchronous variant.
- **Zero mandatory runtime dependencies** -- Only requires `model-price-registry` for pricing data. Token counting works with built-in heuristics; `js-tiktoken` is optional.
- **Full TypeScript support** -- Ships with declaration files and complete type exports.

---

## API Reference

### `estimate(options: EstimateOptions): Promise<Estimate>`

Estimate the cost of an LLM call before sending it.

```ts
const est = await estimate({
  model: 'gpt-4o',                   // required -- model name or "provider/model"
  provider: 'openai',                // optional -- explicit provider override
  messages: [                        // optional -- conversation messages
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2?' },
  ],
  systemPrompt: 'Be concise.',       // optional -- separate system prompt
  maxOutputTokens: 256,              // optional -- caps output token estimate
  tools: [...],                      // optional -- tool/function definitions
});

console.log(est.inputTokens);   // e.g. 42
console.log(est.outputTokens);  // e.g. 13
console.log(est.inputCost);     // e.g. 0.000105
console.log(est.outputCost);    // e.g. 0.000130
console.log(est.totalCost);     // e.g. 0.000235
console.log(est.currency);      // 'USD'
console.log(est.method);        // 'approximate'
console.log(est.provider);      // 'openai'
console.log(est.model);         // 'gpt-4o'
console.log(est.breakdown);     // { systemTokens, conversationTokens, toolTokens }
```

When `maxOutputTokens` is not provided, output tokens default to `min(ceil(inputTokens * 0.3), 1000)`.

### `estimateSync(options: EstimateOptions): Estimate`

Synchronous version of `estimate()`. Identical parameters and return value.

```ts
const est = estimateSync({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hi' }],
});
```

### `estimatePrompt(prompt: string, options?): Promise<Estimate>`

Convenience wrapper that treats a plain string as a single user message. Defaults to `gpt-4o` when no model is specified.

```ts
const est = await estimatePrompt('Explain general relativity', {
  model: 'claude-3-5-sonnet',
});
```

### `compareModels(messages: Message[], models: string[], options?): Promise<Estimate[]>`

Run `estimate()` for multiple models and return results sorted by total cost (ascending). Useful for cost-aware model selection.

```ts
const results = await compareModels(
  [{ role: 'user', content: 'Summarize this article...' }],
  ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'gemini-1.5-flash'],
);
// results[0] is the cheapest option
results.forEach((r) => console.log(`${r.model}: $${r.totalCost.toFixed(6)}`));
```

### `countTokens(content: string, options?: CountTokensOptions): Promise<TokenCount>`

Estimate the token count of a string without computing costs.

```ts
const result = await countTokens('Hello, world!', { model: 'gpt-4o' });
// { tokens: 4, method: 'approximate' }
```

### `countTokensSync(content: string, options?: CountTokensOptions): TokenCount`

Synchronous version of `countTokens()`.

```ts
const result = countTokensSync('Hello, world!', { model: 'claude-3-5-sonnet' });
```

### `checkBudget(options: CheckBudgetOptions): Promise<BudgetResult>`

Check whether an API call would fit within a cost budget. Returns a detailed result without throwing.

```ts
const result = await checkBudget({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
  budget: 0.01,
  maxOutputTokens: 500,              // optional
  provider: 'openai',                // optional
});

console.log(result.withinBudget);    // true or false
console.log(result.utilizationPct);  // e.g. 0.53 (percent of budget used)
console.log(result.remaining);       // e.g. 0.009947 (dollars remaining)
console.log(result.estimate);        // full Estimate object
console.log(result.budget);          // the budget that was checked against
```

### `guard<T extends SupportedClient>(client: T, options: GuardOptions): T`

Wrap an OpenAI or Anthropic SDK client to automatically check costs before every request. The wrapped client has the same type as the original, so it is a drop-in replacement.

```ts
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { guard, BudgetExceededError } from 'prompt-price';

// Guard an OpenAI client
const openai = guard(new OpenAI(), {
  model: 'gpt-4o',
  maxCost: 0.05,
  onExceed: 'throw',   // 'throw' | 'warn' | 'log' (default: 'throw')
  maxOutputTokens: 1000, // optional
  provider: 'openai',    // optional
});

// Guard an Anthropic client
const anthropic = guard(new Anthropic(), {
  model: 'claude-3-5-sonnet',
  maxCost: 0.10,
  onExceed: 'warn',    // logs a warning but does not block the request
});

try {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Write a novel...' }],
  });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(`Blocked: $${err.estimate.totalCost} exceeds $${err.maxCost}`);
  }
}
```

**`onExceed` behavior:**

| Value     | Behavior                                                        |
|-----------|-----------------------------------------------------------------|
| `'throw'` | Throws `BudgetExceededError` before the request is sent         |
| `'warn'`  | Logs a warning via `console.warn` and proceeds with the request |
| `'log'`   | Logs via `console.log` and proceeds with the request            |

### `resolveModel(model: string, providerHint?: string): ResolvedModel`

Resolve a model string to its provider, canonical ID, and pricing. Supports bare names (`gpt-4o`), provider-prefixed names (`openai/gpt-4o`), and versioned names (`gpt-4o-2024-08-06`). Throws `ModelNotFoundError` if the model is not recognized.

```ts
import { resolveModel } from 'prompt-price';

const resolved = resolveModel('gpt-4o');
console.log(resolved.provider);             // 'openai'
console.log(resolved.modelId);              // 'gpt-4o'
console.log(resolved.inputPricePerMillion); // 2.50
console.log(resolved.outputPricePerMillion); // 10.00

// With provider prefix
const r2 = resolveModel('anthropic/claude-3-5-sonnet');
// With provider hint
const r3 = resolveModel('gpt-4o', 'openai');
```

### `calculateCost(tokens: number, pricePerMillion: number): number`

Calculate the USD cost for a given number of tokens at a given price per million tokens. Returns a value rounded to 6 decimal places.

```ts
import { calculateCost } from 'prompt-price';

const cost = calculateCost(1500, 2.50); // 1500 tokens at $2.50/MTok
// 0.00375
```

### `formatCost(cost: number): string`

Format a numeric cost as a dollar string with 6 decimal places.

```ts
import { formatCost } from 'prompt-price';

formatCost(0.00375); // '$0.003750'
```

### `estimateTokens(text: string, provider: string): number`

Estimate the token count for a text string using the provider-specific character-to-token ratio. Returns `Math.ceil(text.length / ratio)`.

```ts
import { estimateTokens } from 'prompt-price';

estimateTokens('hello world', 'openai');    // ceil(11 / 3.9) = 3
estimateTokens('hello world', 'anthropic'); // ceil(11 / 3.5) = 4
```

### `countChars(text: string): number`

Returns the character count of a string. Utility function used internally.

```ts
import { countChars } from 'prompt-price';
countChars('hello'); // 5
```

### `countContentTokens(content: string | ContentPart[], provider: string): number`

Count tokens for message content, handling both plain strings and multimodal content part arrays. Accounts for image token costs by provider and detail level.

```ts
import { countContentTokens } from 'prompt-price';

// Plain text
countContentTokens('hello world', 'openai'); // 3

// Multimodal content
countContentTokens([
  { type: 'text', text: 'describe this:' },
  { type: 'image_url', image_url: { url: '...', detail: 'low' } },
], 'openai'); // text tokens + 85 (low-detail image)
```

---

## Configuration

### Model specification

Models can be specified in three formats:

| Format                | Example                      | Description                          |
|-----------------------|------------------------------|--------------------------------------|
| Bare model name       | `gpt-4o`                     | Provider is inferred from the name   |
| Provider/model        | `openai/gpt-4o`              | Explicit provider prefix             |
| Versioned name        | `gpt-4o-2024-08-06`          | Resolved via prefix matching         |

### Provider inference

When no provider is specified, it is inferred from the model name prefix:

| Prefix pattern               | Provider    |
|------------------------------|-------------|
| `gpt-*`, `o1*`, `o3*`, `o4*` | openai      |
| `claude-*`                   | anthropic   |
| `gemini-*`                   | google      |
| `llama-*`                    | meta        |
| `mistral-*`, `codestral-*`  | mistral     |
| `command-*`                  | cohere      |

### Supported models

| Provider  | Models                                                                                                       |
|-----------|--------------------------------------------------------------------------------------------------------------|
| OpenAI    | gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4-turbo, gpt-3.5-turbo, o1, o1-mini, o3-mini              |
| Anthropic | claude-opus-4, claude-sonnet-4-5, claude-haiku-4-5, claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus, claude-3-haiku |
| Google    | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash                                                          |
| Meta      | llama-3.1-70b, llama-3.3-70b                                                                                |
| Mistral   | mistral-large, mistral-small                                                                                 |
| Cohere    | command-r-plus, command-r                                                                                    |

---

## Error Handling

### `BudgetExceededError`

Thrown by `guard()` (with `onExceed: 'throw'`) when a request's estimated cost exceeds the configured budget.

**Properties:**

| Property   | Type       | Description                        |
|------------|------------|------------------------------------|
| `name`     | `string`   | Always `'BudgetExceededError'`     |
| `message`  | `string`   | Human-readable description with cost, budget, model, and token counts |
| `estimate` | `Estimate` | The full estimate that triggered the error |
| `maxCost`  | `number`   | The budget threshold that was exceeded |

```ts
import { guard, BudgetExceededError } from 'prompt-price';

try {
  await guardedClient.chat.completions.create({ ... });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(err.estimate.totalCost); // the estimated cost
    console.log(err.maxCost);            // the budget limit
    console.log(err.estimate.model);     // which model
    console.log(err.estimate.inputTokens);
  }
}
```

### `ModelNotFoundError`

Thrown by `estimate()`, `estimateSync()`, `resolveModel()`, and any function that performs model resolution when the model string does not match any known model in the built-in catalog.

**Properties:**

| Property | Type     | Description                              |
|----------|----------|------------------------------------------|
| `name`   | `string` | Always `'ModelNotFoundError'`            |
| `message`| `string` | Human-readable description               |
| `model`  | `string` | The model string that was not recognized |

```ts
import { estimate, ModelNotFoundError } from 'prompt-price';

try {
  await estimate({ model: 'unknown-model', messages: [] });
} catch (err) {
  if (err instanceof ModelNotFoundError) {
    console.log(`Unknown model: ${err.model}`);
  }
}
```

---

## Advanced Usage

### Budget checking without middleware

Use `checkBudget()` for programmatic budget checks without wrapping a client:

```ts
import { checkBudget } from 'prompt-price';

const result = await checkBudget({
  model: 'gpt-4o',
  messages: conversation,
  budget: 0.50,
  maxOutputTokens: 2000,
});

if (!result.withinBudget) {
  console.log(`Request would cost $${result.estimate.totalCost.toFixed(6)}`);
  console.log(`Budget utilization: ${result.utilizationPct.toFixed(1)}%`);
  // Trim context, switch to a cheaper model, or abort
}
```

### Cost-aware model selection

Use `compareModels()` to pick the cheapest model that fits your needs:

```ts
import { compareModels } from 'prompt-price';

const candidates = ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'gemini-2.0-flash'];
const results = await compareModels(messages, candidates);

// results[0] is the cheapest
const cheapest = results[0];
console.log(`Using ${cheapest.model} at $${cheapest.totalCost.toFixed(6)}/request`);
```

### Tool definition cost estimation

Tool definitions consume tokens and affect cost. Include them in your estimate:

```ts
import { estimate } from 'prompt-price';

const est = await estimate({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What is the weather?' }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
            units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    },
  ],
});

console.log(est.breakdown?.toolTokens);          // tokens from tool definitions
console.log(est.breakdown?.conversationTokens);   // tokens from messages
```

### Multimodal content estimation

Messages with image content are accounted for with provider-specific token costs:

```ts
import { estimate } from 'prompt-price';

const est = await estimate({
  model: 'gpt-4o',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/photo.jpg', detail: 'high' },
      },
    ],
  }],
});
// Image tokens: 512 for high detail (OpenAI), 85 for low detail
```

For audio or file content parts, set `estimatedTokens` on the content part to provide a manual token estimate:

```ts
const est = await estimate({
  model: 'gpt-4o',
  messages: [{
    role: 'user',
    content: [
      { type: 'audio', estimatedTokens: 500 },
    ],
  }],
});
```

### Synchronous usage

All core functions have synchronous variants for contexts where async is not available:

```ts
import { estimateSync, countTokensSync } from 'prompt-price';

const est = estimateSync({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});

const tokens = countTokensSync('Hello, world!', { model: 'gpt-4o' });
```

---

## Token Counting Method

All token counts use a calibrated heuristic (`Math.ceil(text.length / ratio)`):

| Provider  | Chars per token | Notes                           |
|-----------|----------------|---------------------------------|
| OpenAI    | 3.9            | Typically within 5% of tiktoken |
| Anthropic | 3.5            | Calibrated against Claude tokenizer |
| Google    | 4.0            | SentencePiece-based models      |
| Mistral   | 3.8            | BPE tokenizer                   |
| Meta      | 3.7            | Llama BPE tokenizer             |
| Cohere    | 4.0            | BPE tokenizer                   |

**Image token costs:**

| Provider | Low detail | High detail |
|----------|-----------|-------------|
| OpenAI   | 85 tokens | 512 tokens  |
| Others   | 512 tokens | 512 tokens |

**Output token defaults:** When `maxOutputTokens` is not provided, output tokens are estimated as `min(ceil(inputTokens * 0.3), 1000)`.

**Message overhead:** Each provider adds structural tokens per message (role markers, formatting). OpenAI: 4 tokens/message + 3 base. Anthropic: 4 tokens/message + 10 base. Others: 5 tokens/message + 10 base.

---

## TypeScript

`prompt-price` is written in TypeScript and ships with full declaration files. All 13 interfaces and both error classes are exported:

### Types

```ts
import type {
  Message,              // A single conversation message
  ContentPart,          // Multimodal content (text, image_url, audio, file)
  ToolCall,             // A tool call made by an assistant
  ToolDefinition,       // A tool/function definition
  EstimateOptions,      // Options for estimate()
  CountTokensOptions,   // Options for countTokens()
  TokenCount,           // Result of a token count operation
  Estimate,             // Full cost estimate result
  GuardOptions,         // Options for the guard() middleware
  CheckBudgetOptions,   // Options for checkBudget()
  BudgetResult,         // Result of checkBudget()
  OpenAILikeClient,     // Type for OpenAI-compatible SDK clients
  AnthropicLikeClient,  // Type for Anthropic-compatible SDK clients
  SupportedClient,      // Union of OpenAILikeClient | AnthropicLikeClient
} from 'prompt-price';
```

### Key interfaces

```ts
interface Estimate {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: 'USD';
  method: 'exact' | 'approximate';
  breakdown?: {
    systemTokens?: number;
    conversationTokens?: number;
    toolTokens?: number;
  };
}

interface BudgetResult {
  withinBudget: boolean;
  estimate: Estimate;
  budget: number;
  remaining: number;
  utilizationPct: number;
}

interface TokenCount {
  tokens: number;
  encoding?: string;
  method: 'exact' | 'approximate';
}
```

---

## License

MIT
