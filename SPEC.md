# prompt-price -- Specification

## 1. Overview

`prompt-price` is a pre-flight cost estimation library for LLM API calls. Given a prompt (or structured messages array), a target model, and optional parameters like tool definitions and images, it counts tokens accurately, looks up the model's pricing, and returns a cost estimate in USD -- all before the API call is made. It answers the question "how much will this request cost?" with a single function call: `estimate(messages, 'openai/gpt-4o')`, returning an `Estimate` object with token counts, cost breakdown, and budget verdict. A companion budget guard feature wraps any LLM client and aborts or warns when estimated cost exceeds a configured threshold, preventing runaway spend from prompt injection, unexpectedly large context windows, or developer error.

The gap this package fills is specific and well-defined. Existing LLM SDKs report token usage and cost after the API call completes -- by which time the money is already spent. OpenAI's `tiktoken` counts tokens but does not know pricing. `model-price-registry` (this monorepo) knows pricing but does not count tokens. Neither handles the provider-specific message format overhead tokens that inflate the actual billed token count beyond the raw text content. A developer who wants to know "will this prompt cost more than $0.50?" before sending it must stitch together a tokenizer, a pricing lookup, message overhead calculations, tool definition token costs, and image token formulas -- all of which vary by provider. `prompt-price` composes these concerns into a single call.

The package supports three token counting strategies, selected automatically based on the target model's provider: native tokenizer bindings (OpenAI's `tiktoken` via `js-tiktoken` for OpenAI models), approximate heuristic counting (for providers like Anthropic, Google, Mistral, and Cohere where no public tokenizer library exists), and user-supplied custom token counters for internal or fine-tuned models. All strategies account for provider-specific message format overhead: OpenAI adds per-message and per-role tokens to every chat completion request; Anthropic applies its own formatting overhead for system prompts, tool use, and multi-turn conversations; Google applies different overhead for Gemini's content structure. The package also estimates tokens consumed by tool/function definitions (JSON Schema serialized and tokenized) and by images (using OpenAI's tile-based formula and Anthropic's resolution-based formula).

`prompt-price` provides both a TypeScript/JavaScript API for programmatic use and a CLI for quick terminal-based cost checks. The API returns structured `Estimate` objects with per-component token breakdowns (message content, message overhead, tool definitions, images), per-component cost breakdowns (input cost, estimated output cost), and a budget verdict (under/over/warn). The CLI reads prompt content from stdin, files, or inline arguments and prints cost estimates in human-readable or JSON format. A middleware/wrapper API (`guard`) interposes on any LLM client to enforce budget limits automatically before each request.

---

## 2. Goals and Non-Goals

### Goals

- Provide an `estimate(messages, model, options?)` function that counts input tokens, estimates cost, and returns a structured `Estimate` object with token counts, cost breakdown, and budget verdict -- all before the API call is made.
- Support accurate token counting for OpenAI models using `js-tiktoken` (the JavaScript port of OpenAI's `tiktoken`), including correct encoding selection per model (cl100k_base for GPT-4/GPT-4o, o200k_base for GPT-4.1/o3/o4-mini).
- Support approximate token counting for Anthropic, Google, Mistral, Cohere, and Meta models using a calibrated heuristic (characters-per-token ratio tuned per provider's tokenizer characteristics).
- Account for provider-specific message format overhead tokens: OpenAI's per-message tokens (`<|im_start|>`, role, `<|im_sep|>`, `<|im_end|>` = ~4 tokens per message plus 3 tokens per request), Anthropic's system prompt formatting, and other providers' structural overhead.
- Count tokens consumed by tool/function definitions by serializing the JSON Schema to a canonical string representation and tokenizing it, matching how providers bill for tool definitions.
- Estimate image input tokens using provider-specific formulas: OpenAI's tile system (512x512 tiles at 85 tokens each plus 170 base tokens), Anthropic's resolution-based formula (width * height / 750 tokens, capped at 1600 tokens).
- Look up model pricing from `model-price-registry` automatically, with no manual price configuration required for supported models.
- Provide output token estimation heuristics: callers can supply an expected output token count, an output-to-input ratio, or use a provider-category default ratio.
- Provide a `guard(client, budget)` middleware wrapper that intercepts requests, runs `estimate()`, and aborts/warns/logs when estimated cost exceeds the configured threshold.
- Provide a `countTokens(content, model)` function for standalone token counting without cost estimation.
- Provide a CLI (`prompt-price`) for estimating cost from prompt files, stdin, or inline text.
- Support multi-model comparison: estimate the same prompt against multiple models in a single call to enable cost-aware model selection.
- Zero mandatory runtime dependencies beyond `model-price-registry`. Token counting with `js-tiktoken` is an optional peer dependency -- when absent, the approximate heuristic is used for all providers including OpenAI.
- Target Node.js 18+. Use only built-in modules for non-tokenizer functionality.

### Non-Goals

- **Not a post-hoc cost tracker.** This package estimates cost before the API call. It does not intercept API responses, parse usage headers, or track actual spend. For post-hoc cost tracking, use `ai-chargeback` or `ai-spend-forecast` from this monorepo.
- **Not a tokenizer library.** This package uses tokenizers internally for cost estimation but does not expose a general-purpose tokenizer API. For raw tokenization (encode/decode, token-level inspection), use `tiktoken` or `js-tiktoken` directly.
- **Not a billing system.** This package provides estimates based on published list prices. It does not model batch API discounts (OpenAI/Anthropic 50% batch discount), committed use agreements, volume tiers, or enterprise pricing. Actual billed cost may differ from estimates.
- **Not a prompt optimizer.** This package tells you how much a prompt costs; it does not suggest how to make it cheaper. For context window optimization, use `context-budget` from this monorepo.
- **Not a rate limiter.** Budget guards abort individual requests that exceed a cost threshold. They do not implement sliding windows, token-per-minute limits, or request queuing. For rate limiting, use `ai-circuit-breaker` from this monorepo.
- **Not a real-time price fetcher.** Pricing comes from the bundled `model-price-registry` data. If the registry is stale, estimates use stale prices. Update `model-price-registry` to get current prices.

---

## 3. Target Users and Use Cases

### AI Application Developers

Developers building chatbots, agents, or RAG pipelines who want to prevent expensive API calls before they happen. A retrieval-augmented generation system might inject 50,000 tokens of context into every request; `estimate()` lets the developer verify cost per request during development and `guard()` enforces a hard ceiling in production. A developer building a customer-facing chatbot uses `guard()` to ensure no single user interaction can exceed $0.25, protecting against prompt injection attacks that inflate context or adversarial inputs designed to trigger expensive tool chains.

### Platform / FinOps Engineers

Engineers building internal LLM platforms where multiple teams share API keys. They embed `guard()` in the shared SDK client to enforce per-request cost budgets, preventing any single team's runaway prompt from blowing the monthly budget. The structured `Estimate` objects feed into cost attribution dashboards that show estimated vs. actual spend per team.

### Prompt Engineers

Engineers iterating on prompts who need fast feedback on cost implications. Adding a 2,000-word system prompt or 15 tool definitions has a real cost impact that compounds across thousands of requests. The CLI provides instant cost feedback: `prompt-price estimate openai/gpt-4o --file system-prompt.md --tools tools.json` shows the per-request cost before the prompt goes to production.

### Test Infrastructure Engineers

Engineers running AI-powered test suites who want to budget individual test costs before execution. Before each test that makes an LLM call, `estimate()` checks whether the expected cost is within the test budget. This catches regressions where a code change accidentally inflates prompt size, turning a $0.01 test into a $5.00 test.

### CLI / Script Authors

Developers writing shell scripts or automation that interact with LLM APIs. The CLI provides a scriptable interface for cost estimation: pipe a prompt file through `prompt-price`, parse the JSON output, and conditionally proceed with the API call based on the estimated cost.

---

## 4. Core Concepts

### Pre-Flight Estimation

Pre-flight estimation means computing the cost of an LLM API call before making it. The estimation pipeline has four stages:

1. **Token counting**: Count input tokens in the messages array, including message content, message format overhead, tool definitions, and image inputs.
2. **Output estimation**: Estimate the expected output token count using caller-provided values, ratios, or heuristic defaults.
3. **Price lookup**: Retrieve the model's input and output per-million-token prices from `model-price-registry`.
4. **Cost calculation**: Multiply token counts by per-token prices to produce a dollar amount.

The estimate is an upper bound for text-only prompts (real token counts from the provider may differ slightly due to tokenizer version differences) and a rough approximation for output tokens (which are inherently unknowable before the call). The package is explicit about uncertainty: the `Estimate` object distinguishes between `inputTokens` (counted, high confidence) and `estimatedOutputTokens` (heuristic, low confidence).

### Token Counting

Token counting converts text content into the number of tokens a model's tokenizer would produce. Different providers use different tokenizers:

- **OpenAI**: Uses BPE tokenizers. GPT-4 and GPT-4o use `cl100k_base`. GPT-4.1, o3, and o4-mini use `o200k_base`. Token counts from `js-tiktoken` match OpenAI's billing exactly.
- **Anthropic**: Uses a proprietary BPE tokenizer. No public JavaScript library exists. The approximate heuristic uses a ratio of 3.5 characters per token, calibrated against Anthropic's tokenizer documentation and empirical testing on English text. Claude models tend to be slightly more token-efficient than OpenAI models for English text.
- **Google**: Gemini models use SentencePiece tokenizers. No public JavaScript library exists for Gemini tokenization. The heuristic uses 4.0 characters per token for Gemini models.
- **Mistral**: Uses a BPE tokenizer similar to OpenAI's. The heuristic uses 3.8 characters per token.
- **Cohere**: Uses a BPE tokenizer. The heuristic uses 4.0 characters per token.
- **Meta (Llama)**: Llama 4 uses a BPE tokenizer with a 200K vocabulary. The heuristic uses 3.7 characters per token.

The heuristic-based counting is explicitly approximate. For OpenAI models with `js-tiktoken` installed, counts are exact. For all other providers, counts may differ from actual billed token counts by 5-15%. The `Estimate` object includes a `confidence` field (`'exact'` or `'approximate'`) so callers know the precision of the estimate.

### Message Format Overhead

LLM APIs do not bill only for the text content of messages. Each provider adds structural tokens for message formatting that are invisible to the user but counted in billing:

**OpenAI chat completions overhead:**
- Every request has a base overhead of 3 tokens (the `<|im_start|>assistant` priming).
- Each message adds ~4 tokens of structural overhead: `<|im_start|>`, the role name, `<|im_sep|>`, and `<|im_end|>`.
- The `name` field, if present, adds 1 additional token (the `<|im_sep|>` between role and name is replaced by the name itself, but an additional token is consumed for the delimiter).
- For function/tool calls, the function name and argument structure add overhead beyond the raw content.

The exact overhead formula is model-specific and has changed across OpenAI model generations. `prompt-price` uses the documented overhead values and updates them when OpenAI publishes changes. The reference implementation follows OpenAI's cookbook formula:

```
tokens_per_message = 3  (for gpt-4o, gpt-4.1, o3, o4-mini)
tokens_per_name = 1     (if "name" field is present)
base_tokens = 3         (every request)
```

**Anthropic message overhead:**
- Anthropic's Messages API uses a simpler structure. The system prompt is a separate parameter, not a message. The overhead is smaller: approximately 10-15 tokens per request for the request structure, plus 3-5 tokens per message for role markers. Anthropic does not publish exact overhead token counts; the package uses empirically calibrated values.

**Other providers:**
- Google Gemini, Mistral, and Cohere add their own structural overhead. The heuristic adds a flat 10-token-per-message overhead as a conservative default for providers without documented overhead formulas.

### Tool Definition Token Cost

When tools (functions) are defined in a chat completion request, their JSON Schema definitions are serialized and included in the prompt. Providers bill for these tokens. A single tool with a moderately complex schema can consume 100-300 tokens. An application with 20 tools can add 2,000-6,000 tokens to every request -- a significant cost factor that is easy to overlook.

`prompt-price` estimates tool definition tokens by:
1. Serializing each tool definition (name, description, parameters schema) to a compact JSON string.
2. Tokenizing the resulting string using the same tokenizer as the message content.
3. Adding a per-tool overhead for structural formatting (OpenAI adds namespace and type markers around each function definition).

The estimate is approximate because providers use internal serialization formats that may differ from a naive `JSON.stringify`. However, empirical testing shows the estimate is within 5-10% of actual billed tokens for tool definitions.

### Image Token Cost

Vision-capable models bill for image inputs based on image dimensions, not raw byte size. The formulas differ by provider:

**OpenAI image tokens (GPT-4o, GPT-4.1):**
- Images are resized to fit within a maximum bounding box (2048x2048 for `high` detail, 768x768 for `low` detail).
- The resized image is divided into 512x512 tiles. Each tile costs 85 tokens.
- A base cost of 170 tokens is added regardless of tile count.
- Formula: `tiles = ceil(width/512) * ceil(height/512); tokens = tiles * 85 + 170`.
- `low` detail mode is a flat 85 tokens regardless of resolution.

**Anthropic image tokens (Claude models):**
- Images are resized so the longer edge is at most 1568 pixels and the total pixel count is at most 1,568,000.
- Token cost is calculated as: `tokens = (width * height) / 750`, rounded up.
- Minimum: 1 token. Maximum: approximately 1,600 tokens for a full-resolution image.

`prompt-price` accepts image dimensions (width, height) or image URLs/base64 data in the messages array. When dimensions are provided directly, the formula is applied immediately. When raw image data is provided, the package reads image headers to extract dimensions without loading the full image into memory (using the first bytes to detect PNG/JPEG/GIF/WebP dimensions).

### Budget Guards

Budget guards are the enforcement mechanism for cost limits. A guard wraps an LLM client and interposes on every request:

1. Extract the messages, tools, and model from the pending request.
2. Call `estimate()` to compute the pre-flight cost.
3. Compare the estimated cost against the configured budget threshold.
4. Take action based on the comparison: `abort` (throw an error, preventing the API call), `warn` (log a warning but allow the call), or `log` (silently record the estimate for later analysis).

Guards operate on estimated cost, which includes uncertainty (especially for output tokens). A guard configured with `maxCost: 0.50` and `action: 'abort'` will refuse any request whose estimated cost exceeds $0.50. Since output tokens are estimated, the guard uses the caller's configured output estimation parameters (explicit token count, ratio, or default heuristic) to compute the output portion of the estimate.

Guards are composable: a platform team can set a hard abort at $5.00, while individual applications add a tighter warn at $0.50. Guards do not interfere with each other -- each independently evaluates the same estimate.

### Model Identification

Models are identified by a `provider/model` string (e.g., `'openai/gpt-4o'`, `'anthropic/claude-sonnet-4-5'`) or by separate provider and model parameters. The provider prefix determines which tokenizer and overhead formula to use. The model identifier is passed to `model-price-registry` for price lookup.

When only a model string is provided without a provider prefix (e.g., `'gpt-4o'`), the package attempts to infer the provider from the model name using known prefixes: `gpt-*` and `o1/o3/o4-*` map to OpenAI, `claude-*` maps to Anthropic, `gemini-*` maps to Google, `llama-*` maps to Meta, `mistral-*` and `codestral*` map to Mistral, `command-*` maps to Cohere. If the provider cannot be inferred, the function returns an error.

---

## 5. Token Counting

### Counting Strategy Selection

When `countTokens()` or `estimate()` is called, the package selects a counting strategy based on the model's provider:

| Provider | Strategy | Accuracy | Requirement |
|---|---|---|---|
| OpenAI | `js-tiktoken` native BPE | Exact | `js-tiktoken` peer dependency installed |
| OpenAI (fallback) | Heuristic (3.9 chars/token for cl100k_base, 4.0 for o200k_base) | Approximate (~5% error) | None |
| Anthropic | Heuristic (3.5 chars/token) | Approximate (~10% error) | None |
| Google | Heuristic (4.0 chars/token) | Approximate (~10% error) | None |
| Mistral | Heuristic (3.8 chars/token) | Approximate (~8% error) | None |
| Cohere | Heuristic (4.0 chars/token) | Approximate (~10% error) | None |
| Meta | Heuristic (3.7 chars/token) | Approximate (~10% error) | None |

The `js-tiktoken` dependency is optional. When it is not installed, OpenAI models fall back to the heuristic. The package detects `js-tiktoken` availability at runtime via a dynamic `import()` wrapped in a try/catch. The detection result is cached so the import is attempted only once.

### Encoding Selection for OpenAI Models

When `js-tiktoken` is available, the correct encoding must be selected per model:

| Models | Encoding |
|---|---|
| `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo` | `cl100k_base` |
| `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o3`, `o3-mini`, `o4-mini`, `o1` | `o200k_base` |

The encoding map is maintained as a static lookup table. Unknown OpenAI models default to `o200k_base` (the newer encoding) as a conservative default.

### Heuristic Token Counting

The heuristic counter uses a simple formula:

```
tokens = ceil(text.length / charsPerToken)
```

Where `charsPerToken` is a provider-specific constant calibrated against each provider's tokenizer. The calibration process uses a corpus of 10,000 representative English text samples (technical documentation, conversational text, code, and mixed content) tokenized with each provider's tokenizer to determine the average characters-per-token ratio.

The heuristic intentionally overestimates slightly (lower chars-per-token ratio than the actual average) so that cost estimates are conservative. A prompt estimated at $0.48 should not actually cost $0.55 due to underestimation.

For non-English text, the heuristic is less accurate. CJK characters, emoji, and scripts with low Unicode density produce more tokens per character than the English-calibrated ratio predicts. The package does not attempt language detection or per-language calibration in v1. For applications with significant non-English content, callers should use a higher `outputEstimationBuffer` or install `js-tiktoken` for OpenAI models.

### Message Token Counting Pipeline

For a complete messages array, token counting follows this pipeline:

```
Total input tokens = base_overhead
                   + sum(message_content_tokens + message_overhead_tokens for each message)
                   + tool_definition_tokens
                   + image_tokens
```

**Step 1: Base overhead.** Add the per-request base tokens (3 for OpenAI, 10 for Anthropic, 10 for others).

**Step 2: Per-message content tokens.** For each message in the array, tokenize the text content. For messages with an array of content parts (text + images), tokenize each text part separately.

**Step 3: Per-message overhead tokens.** Add the per-message overhead for the provider (4 for OpenAI, 3-5 for Anthropic, 5 for others). If the message has a `name` field (OpenAI), add the name overhead.

**Step 4: Tool definition tokens.** If tools are provided, serialize each tool definition and tokenize the result. Add per-tool overhead.

**Step 5: Image tokens.** For each image content part, compute the token cost using the provider's image formula. Requires either explicit dimensions or image data for dimension extraction.

### Tool Definition Tokenization

Tool definitions are tokenized by serializing the tool object to a string representation that approximates the provider's internal format:

**OpenAI tool format:**
```
// Each tool is serialized approximately as:
// namespace functions {
//   // <description>
//   type <name> = (_: {
//     <param1>: <type>,  // <param_description>
//     <param2>?: <type>,  // <param_description>
//   }) => any;
// }
```

The package serializes each tool's `function.name`, `function.description`, and `function.parameters` (JSON Schema) into a compact TypeScript-like representation, then tokenizes the resulting string. This matches OpenAI's internal tool token counting closely (within 5% based on empirical testing).

For Anthropic and other providers, the serialization uses a compact JSON representation of the tool definition, as these providers include the raw JSON Schema in the prompt.

### Image Token Estimation

Image tokens are computed from dimensions without downloading or decoding the full image:

```typescript
function openaiImageTokens(width: number, height: number, detail: 'low' | 'high' | 'auto'): number {
  if (detail === 'low') return 85;

  // Resize to fit within 2048x2048
  const scale = Math.min(2048 / width, 2048 / height, 1);
  let w = Math.round(width * scale);
  let h = Math.round(height * scale);

  // Scale shortest side to 768
  const shortScale = 768 / Math.min(w, h);
  if (shortScale < 1) {
    w = Math.round(w * shortScale);
    h = Math.round(h * shortScale);
  }

  const tilesX = Math.ceil(w / 512);
  const tilesY = Math.ceil(h / 512);
  return tilesX * tilesY * 85 + 170;
}

function anthropicImageTokens(width: number, height: number): number {
  // Resize so longer edge <= 1568 and total pixels <= 1,568,000
  let w = width;
  let h = height;

  const longEdge = Math.max(w, h);
  if (longEdge > 1568) {
    const scale = 1568 / longEdge;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  if (w * h > 1_568_000) {
    const scale = Math.sqrt(1_568_000 / (w * h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  return Math.ceil((w * h) / 750);
}
```

When image content parts include a URL but no explicit dimensions, the package does not fetch the image by default (to avoid network I/O during estimation). Instead, it uses a configurable default image size (1024x1024) and logs a warning that the estimate is based on assumed dimensions. Callers can provide explicit dimensions via the `imageSize` option or set `fetchImageDimensions: true` to enable HTTP HEAD requests for dimension extraction from image headers.

### Custom Token Counter

For internal models, fine-tuned models, or providers not covered by the built-in strategies, callers can supply a custom token counter:

```typescript
const estimate = await estimate(messages, 'internal/custom-model', {
  tokenCounter: (text: string) => myTokenizer.encode(text).length,
  pricePerMTokInput: 1.00,
  pricePerMTokOutput: 3.00,
});
```

The custom counter receives a plain text string and must return an integer token count. Message overhead, tool definitions, and image tokens are still handled by the package using configurable overhead values.

---

## 6. Cost Estimation

### Cost Formula

The cost estimation formula mirrors `model-price-registry`'s `estimateCost` but operates on counted tokens rather than caller-supplied token numbers:

```
inputCost        = inputTokens / 1_000_000 * inputPerMTok
estimatedOutputCost = estimatedOutputTokens / 1_000_000 * outputPerMTok
totalEstimatedCost  = inputCost + estimatedOutputCost
```

All costs are in USD. Results are rounded to 6 decimal places using `Math.round(value * 1_000_000) / 1_000_000`.

For models with long-context pricing tiers (e.g., Gemini 2.5 Pro at 2x above 200K tokens, Claude Sonnet 4.5 at 2x above 200K tokens), the tiered rate is applied when `inputTokens` exceeds the tier threshold. This matches provider billing behavior where the tier applies to the entire input, not just tokens above the threshold.

### Output Token Estimation

Output tokens are inherently unknowable before the API call. The package provides four mechanisms for output estimation, in priority order:

1. **Explicit output token count**: The caller supplies `estimatedOutputTokens: 500` directly. Used as-is.

2. **Output-to-input ratio**: The caller supplies `outputRatio: 0.25`, meaning expected output is 25% of input tokens. Calculated as `estimatedOutputTokens = inputTokens * outputRatio`.

3. **Max tokens parameter**: If the caller is using `max_tokens` in their API call, they can pass it as `maxOutputTokens`. The estimate uses this as the output token count (worst case).

4. **Default ratio by model category**: When no output estimation parameter is provided, the package uses a default ratio based on the model's category from `model-price-registry`:

| Category | Default Output Ratio | Rationale |
|---|---|---|
| `flagship` | 0.25 | Flagship models typically used for generation tasks with moderate output |
| `balanced` | 0.20 | Balanced models often used for shorter, focused responses |
| `fast` | 0.15 | Fast models used for quick responses, classification, extraction |
| `reasoning` | 0.50 | Reasoning models generate internal chain-of-thought (billed as output) |
| `code` | 0.30 | Code models produce significant output for code generation |
| `embedding` | 0.00 | Embedding models produce no text output |
| `legacy` | 0.20 | Conservative default for older models |

These defaults are conservative estimates. The `Estimate` object clearly marks whether output tokens are user-supplied or heuristic-derived via the `outputEstimationSource` field.

### Multi-Model Comparison

The `compareModels()` function estimates the same prompt against multiple models, returning estimates sorted by total cost:

```typescript
import { compareModels } from 'prompt-price';

const results = await compareModels(messages, [
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-haiku-3-5',
  'google/gemini-2.5-flash',
], { estimatedOutputTokens: 1000 });

// Returns: Estimate[] sorted by totalEstimatedCost ascending
for (const est of results) {
  console.log(`${est.model}: $${est.totalEstimatedCost.toFixed(4)}`);
}
```

This enables cost-aware model selection: choose the cheapest model that meets quality requirements.

---

## 7. Budget Guards

### Guard Configuration

A budget guard is created by wrapping an LLM client with a budget configuration:

```typescript
import { guard } from 'prompt-price';
import OpenAI from 'openai';

const openai = new OpenAI();

const guarded = guard(openai, {
  maxCost: 0.50,                    // Maximum estimated cost per request in USD
  action: 'abort',                  // 'abort' | 'warn' | 'log'
  estimatedOutputTokens: 2000,      // Used for output cost estimation
});

// Use guarded client exactly like the original
const response = await guarded.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: longPrompt }],
});
// Throws BudgetExceededError if estimated cost > $0.50
```

### Guard Actions

| Action | Behavior |
|---|---|
| `abort` | Throws a `BudgetExceededError` before the API call is made. The error includes the `Estimate` object with full cost breakdown. The API call is never sent. |
| `warn` | Logs a warning via the configured logger (default: `console.warn`) with the cost estimate. The API call proceeds normally. |
| `log` | Silently records the estimate to the configured logger at `info` level. The API call proceeds normally. No visible warning. |

### Guard Middleware Pattern

The guard function returns a proxy object that intercepts method calls on the client. For OpenAI's SDK, it intercepts `chat.completions.create()`. For Anthropic's SDK, it intercepts `messages.create()`. The guard extracts the messages, model, tools, and max_tokens from the request parameters, calls `estimate()`, evaluates the budget, takes the configured action, and either proceeds with the original call or throws.

```typescript
interface GuardOptions {
  /** Maximum estimated cost per request in USD. Required. */
  maxCost: number;

  /** Action to take when estimated cost exceeds maxCost. Default: 'abort'. */
  action?: 'abort' | 'warn' | 'log';

  /** Estimated output tokens for cost calculation. Default: uses category-based heuristic. */
  estimatedOutputTokens?: number;

  /** Output-to-input ratio for cost calculation. Overridden by estimatedOutputTokens. */
  outputRatio?: number;

  /** Logger for warn and log actions. Default: console. */
  logger?: {
    warn: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
  };

  /** Callback invoked with every estimate, regardless of action. For metrics collection. */
  onEstimate?: (estimate: Estimate) => void;
}
```

### BudgetExceededError

```typescript
class BudgetExceededError extends Error {
  /** The cost estimate that triggered the guard. */
  readonly estimate: Estimate;

  /** The configured budget threshold. */
  readonly maxCost: number;

  constructor(estimate: Estimate, maxCost: number) {
    super(
      `Estimated cost $${estimate.totalEstimatedCost.toFixed(4)} exceeds budget ` +
      `$${maxCost.toFixed(4)} for model ${estimate.model} ` +
      `(${estimate.inputTokens} input tokens, ${estimate.estimatedOutputTokens} estimated output tokens)`
    );
    this.name = 'BudgetExceededError';
    this.estimate = estimate;
    this.maxCost = maxCost;
  }
}
```

### Generic Guard (Non-SDK)

For applications not using the OpenAI or Anthropic SDK directly (e.g., custom HTTP clients, LangChain, or other frameworks), the package provides a lower-level `checkBudget()` function:

```typescript
import { checkBudget } from 'prompt-price';

const result = checkBudget(messages, 'openai/gpt-4o', {
  maxCost: 0.50,
  tools: toolDefinitions,
  estimatedOutputTokens: 1000,
});

if (result.exceeded) {
  throw new Error(`Budget exceeded: estimated $${result.estimate.totalEstimatedCost.toFixed(4)}`);
}

// Proceed with API call
```

---

## 8. API Surface

### Installation

```bash
npm install prompt-price model-price-registry
```

### Peer Dependencies

```json
{
  "peerDependencies": {
    "model-price-registry": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "model-price-registry": { "optional": false }
  },
  "optionalDependencies": {
    "js-tiktoken": "^1.0.0"
  }
}
```

`model-price-registry` is required for pricing data. `js-tiktoken` is optional -- when installed, it provides exact token counting for OpenAI models. When absent, the heuristic is used for all providers.

### `estimate`

The primary function. Counts input tokens, estimates output tokens and cost, and returns a structured estimate.

```typescript
import { estimate } from 'prompt-price';

const est = await estimate(
  [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain quantum computing in simple terms.' },
  ],
  'openai/gpt-4o',
  { estimatedOutputTokens: 500 },
);

console.log(est.inputTokens);          // 28
console.log(est.estimatedOutputTokens); // 500
console.log(est.inputCost);             // 0.000070
console.log(est.estimatedOutputCost);   // 0.005000
console.log(est.totalEstimatedCost);    // 0.005070
```

**Signature:**

```typescript
function estimate(
  messages: Message[],
  model: string,
  options?: EstimateOptions,
): Promise<Estimate>;
```

**Note:** `estimate` is async because loading `js-tiktoken` encodings is async (WASM initialization). If `js-tiktoken` is not installed, the function resolves synchronously (wrapped in a resolved promise). A synchronous variant `estimateSync` is provided for contexts where async is inconvenient, but it cannot use `js-tiktoken` (always uses the heuristic).

### `estimateSync`

Synchronous variant of `estimate`. Always uses the heuristic token counter, even if `js-tiktoken` is installed.

```typescript
import { estimateSync } from 'prompt-price';

const est = estimateSync(
  [{ role: 'user', content: 'Hello' }],
  'openai/gpt-4o',
);
```

**Signature:**

```typescript
function estimateSync(
  messages: Message[],
  model: string,
  options?: EstimateOptions,
): Estimate;
```

### `estimatePrompt`

Convenience function for estimating a single plain-text prompt string (not a messages array). Wraps the string in a single user message.

```typescript
import { estimatePrompt } from 'prompt-price';

const est = await estimatePrompt(
  'Explain quantum computing in simple terms.',
  'openai/gpt-4o',
);
```

**Signature:**

```typescript
function estimatePrompt(
  prompt: string,
  model: string,
  options?: EstimateOptions,
): Promise<Estimate>;
```

### `countTokens`

Standalone token counting without cost estimation. Returns a detailed token breakdown.

```typescript
import { countTokens } from 'prompt-price';

const count = await countTokens(
  [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
  'openai/gpt-4o',
);

console.log(count.totalTokens);       // 22
console.log(count.contentTokens);     // 11
console.log(count.overheadTokens);    // 11  (base + per-message)
console.log(count.toolTokens);        // 0
console.log(count.imageTokens);       // 0
console.log(count.confidence);        // 'exact' (js-tiktoken is installed)
```

**Signature:**

```typescript
function countTokens(
  messages: Message[],
  model: string,
  options?: CountTokensOptions,
): Promise<TokenCount>;

function countTokensSync(
  messages: Message[],
  model: string,
  options?: CountTokensOptions,
): TokenCount;
```

### `compareModels`

Estimates the same prompt against multiple models, returning results sorted by cost.

```typescript
import { compareModels } from 'prompt-price';

const results = await compareModels(
  [{ role: 'user', content: 'Summarize this document...' }],
  ['openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-haiku-3-5'],
  { estimatedOutputTokens: 500 },
);

for (const est of results) {
  console.log(`${est.model}: $${est.totalEstimatedCost.toFixed(4)}`);
}
```

**Signature:**

```typescript
function compareModels(
  messages: Message[],
  models: string[],
  options?: EstimateOptions,
): Promise<Estimate[]>;
```

Returns estimates sorted by `totalEstimatedCost` ascending (cheapest first).

### `guard`

Wraps an LLM client with budget enforcement.

```typescript
import { guard } from 'prompt-price';
import OpenAI from 'openai';

const openai = new OpenAI();
const guarded = guard(openai, { maxCost: 1.00, action: 'abort' });

// Throws BudgetExceededError if estimated cost > $1.00
await guarded.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: veryLongPrompt }],
});
```

**Signature:**

```typescript
function guard<T extends SupportedClient>(
  client: T,
  options: GuardOptions,
): T;
```

The return type matches the input client type, so the guarded client is a drop-in replacement. `SupportedClient` is a union type covering known SDK client shapes. Unsupported client types produce a compile-time error.

### `checkBudget`

Low-level budget check without client wrapping.

```typescript
import { checkBudget } from 'prompt-price';

const result = await checkBudget(
  [{ role: 'user', content: longPrompt }],
  'openai/gpt-4o',
  {
    maxCost: 0.50,
    tools: myTools,
    estimatedOutputTokens: 1000,
  },
);

if (result.exceeded) {
  console.error(`Budget exceeded: $${result.estimate.totalEstimatedCost.toFixed(4)}`);
}
```

**Signature:**

```typescript
function checkBudget(
  messages: Message[],
  model: string,
  options: CheckBudgetOptions,
): Promise<BudgetResult>;
```

### Type Definitions

```typescript
// ── Messages ─────────────────────────────────────────────────────────

/** A chat message in the OpenAI/Anthropic message format. */
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ContentPart {
  type: 'text' | 'image_url' | 'image';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ── Tool Definitions ─────────────────────────────────────────────────

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>; // JSON Schema
  };
}

// ── Estimate Options ─────────────────────────────────────────────────

interface EstimateOptions {
  /** Explicit expected output token count. Highest priority for output estimation. */
  estimatedOutputTokens?: number;

  /** Output-to-input ratio (e.g., 0.25 means output is 25% of input tokens).
   *  Used when estimatedOutputTokens is not provided. */
  outputRatio?: number;

  /** Max tokens parameter from the API call. Used as worst-case output estimate
   *  when neither estimatedOutputTokens nor outputRatio is provided. */
  maxOutputTokens?: number;

  /** Tool definitions included in the request. Their token cost is counted. */
  tools?: ToolDefinition[];

  /** Default image dimensions for images without explicit size info.
   *  Default: { width: 1024, height: 1024 }. */
  defaultImageSize?: { width: number; height: number };

  /** Image detail level for OpenAI models. Default: 'auto'. */
  imageDetail?: 'low' | 'high' | 'auto';

  /** Custom token counter function. Overrides built-in tokenizers. */
  tokenCounter?: (text: string) => number;

  /** Override input price per million tokens (USD). Bypasses model-price-registry lookup. */
  pricePerMTokInput?: number;

  /** Override output price per million tokens (USD). Bypasses model-price-registry lookup. */
  pricePerMTokOutput?: number;

  /** Number of cached input tokens (reduces cost if model supports prompt caching). */
  cachedInputTokens?: number;
}

// ── Count Tokens Options ─────────────────────────────────────────────

interface CountTokensOptions {
  /** Tool definitions to include in token count. */
  tools?: ToolDefinition[];

  /** Default image dimensions. Default: { width: 1024, height: 1024 }. */
  defaultImageSize?: { width: number; height: number };

  /** Image detail level for OpenAI models. Default: 'auto'. */
  imageDetail?: 'low' | 'high' | 'auto';

  /** Custom token counter function. */
  tokenCounter?: (text: string) => number;
}

// ── Token Count Result ───────────────────────────────────────────────

interface TokenCount {
  /** Total input tokens (content + overhead + tools + images). */
  totalTokens: number;

  /** Tokens from message text content only. */
  contentTokens: number;

  /** Tokens from message format overhead (per-message, per-request, name fields). */
  overheadTokens: number;

  /** Tokens from tool/function definitions. */
  toolTokens: number;

  /** Tokens from image inputs. */
  imageTokens: number;

  /** Per-message token breakdown. */
  perMessage: Array<{
    role: string;
    contentTokens: number;
    overheadTokens: number;
    imageTokens: number;
  }>;

  /** Whether the count is exact (native tokenizer) or approximate (heuristic). */
  confidence: 'exact' | 'approximate';

  /** The provider used for counting. */
  provider: string;

  /** The model used for counting. */
  model: string;
}

// ── Estimate Result ──────────────────────────────────────────────────

interface Estimate {
  /** The model string used for this estimate. */
  model: string;

  /** The provider extracted from the model string. */
  provider: string;

  /** The canonical model ID after alias resolution. */
  resolvedModelId: string;

  // ── Input tokens ──
  /** Total input tokens (content + overhead + tools + images). */
  inputTokens: number;

  /** Detailed input token breakdown. */
  inputBreakdown: TokenCount;

  // ── Output tokens ──
  /** Estimated output tokens. */
  estimatedOutputTokens: number;

  /** How the output token estimate was derived. */
  outputEstimationSource: 'explicit' | 'ratio' | 'maxTokens' | 'categoryDefault';

  // ── Cost ──
  /** Cost of input tokens in USD. */
  inputCost: number;

  /** Estimated cost of output tokens in USD. */
  estimatedOutputCost: number;

  /** Cost savings from cached input tokens, in USD. 0 if caching not applicable. */
  cachedInputSavings: number;

  /** Total estimated cost: inputCost + estimatedOutputCost - cachedInputSavings. */
  totalEstimatedCost: number;

  /** Currency code. Always 'USD'. */
  currency: 'USD';

  // ── Pricing metadata ──
  /** Input price per million tokens used in the calculation. */
  inputPerMTok: number;

  /** Output price per million tokens used in the calculation. */
  outputPerMTok: number;

  /** Whether tiered (long-context) pricing was applied. */
  tieredPricingApplied: boolean;

  // ── Confidence ──
  /** Whether the token count is exact or approximate. */
  tokenCountConfidence: 'exact' | 'approximate';

  /** ISO 8601 timestamp of when the estimate was computed. */
  timestamp: string;
}

// ── Budget Types ─────────────────────────────────────────────────────

interface GuardOptions {
  /** Maximum estimated cost per request in USD. */
  maxCost: number;

  /** Action when budget is exceeded. Default: 'abort'. */
  action?: 'abort' | 'warn' | 'log';

  /** Estimated output tokens for cost calculation. */
  estimatedOutputTokens?: number;

  /** Output-to-input ratio for cost calculation. */
  outputRatio?: number;

  /** Logger for warn/log actions. Default: console. */
  logger?: {
    warn: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
  };

  /** Callback invoked with every estimate. */
  onEstimate?: (estimate: Estimate) => void;
}

interface CheckBudgetOptions extends EstimateOptions {
  /** Maximum estimated cost in USD. */
  maxCost: number;
}

interface BudgetResult {
  /** Whether the estimated cost exceeds the maxCost threshold. */
  exceeded: boolean;

  /** The full cost estimate. */
  estimate: Estimate;

  /** The configured budget threshold. */
  maxCost: number;
}

// ── Supported client types for guard() ───────────────────────────────

type SupportedClient = OpenAILikeClient | AnthropicLikeClient;

interface OpenAILikeClient {
  chat: {
    completions: {
      create: (params: Record<string, unknown>) => Promise<unknown>;
    };
  };
}

interface AnthropicLikeClient {
  messages: {
    create: (params: Record<string, unknown>) => Promise<unknown>;
  };
}
```

### Type Exports

```typescript
export type {
  Message,
  ContentPart,
  ToolCall,
  ToolDefinition,
  EstimateOptions,
  CountTokensOptions,
  TokenCount,
  Estimate,
  GuardOptions,
  CheckBudgetOptions,
  BudgetResult,
  SupportedClient,
};

export { BudgetExceededError } from './errors';
```

---

## 9. Configuration

### No Configuration Required

`prompt-price` has no configuration files, environment variables, or initialization steps for programmatic use. Import and call:

```typescript
import { estimate } from 'prompt-price';
const est = await estimate(messages, 'openai/gpt-4o');
// Works immediately. No setup.
```

All behavior is controlled via function parameters. Pricing data comes from `model-price-registry`, which is also zero-configuration.

### Overriding Defaults

Every default can be overridden per-call via the `options` parameter:

| Default | Override | Purpose |
|---|---|---|
| Provider-specific tokenizer | `options.tokenCounter` | Use a custom token counter for unsupported models |
| `model-price-registry` pricing | `options.pricePerMTokInput`, `options.pricePerMTokOutput` | Use custom pricing for internal models or discounted rates |
| Category-based output ratio | `options.estimatedOutputTokens`, `options.outputRatio`, `options.maxOutputTokens` | Control output token estimation |
| Default image size 1024x1024 | `options.defaultImageSize` | Change assumed dimensions for images without size info |
| `auto` image detail | `options.imageDetail` | Force `low` or `high` detail for OpenAI image token calculation |

### Environment Variables (CLI Only)

The CLI supports environment variable configuration. Environment variables are overridden by explicit flags.

| Environment Variable | CLI Flag | Description |
|---|---|---|
| `PROMPT_PRICE_FORMAT` | `--format` | Output format: `human` or `json` |
| `PROMPT_PRICE_MODEL` | `--model` | Default model for estimation |
| `PROMPT_PRICE_MAX_COST` | `--max-cost` | Default budget threshold for budget check mode |

---

## 10. CLI Design

### Installation and Invocation

```bash
# Global install
npm install -g prompt-price
prompt-price estimate openai/gpt-4o --file prompt.md

# npx (no install)
npx prompt-price estimate openai/gpt-4o --file prompt.md

# Pipe from stdin
echo "Explain quantum computing" | npx prompt-price estimate openai/gpt-4o
```

### CLI Binary Name

`prompt-price`

### Commands

#### `prompt-price estimate <model> [options]`

Estimates the cost of a prompt for a given model.

**Input sources (exactly one required):**
- `--file <path>`: Read prompt from a file.
- `--text <string>`: Inline prompt text.
- `stdin`: If no `--file` or `--text` is provided, reads from stdin.

**Flags:**

```
Input:
  --file <path>              Read prompt from a file (text or JSON messages array)
  --text <string>            Inline prompt text
  --tools <path>             JSON file containing tool definitions
  --system <string>          System prompt text (prepended as a system message)

Output estimation:
  --output-tokens <n>        Expected output token count
  --output-ratio <ratio>     Output-to-input ratio (e.g., 0.25)
  --max-output-tokens <n>    Max tokens parameter (worst-case output estimate)

Output format:
  --format <format>          Output format: human (default) | json
  --quiet                    Print only the total estimated cost

Budget:
  --max-cost <usd>           Budget threshold. If set, exit code reflects budget status.

Meta:
  --version                  Print version and exit
  --help                     Print help and exit
```

**Human-Readable Output Example:**

```
$ prompt-price estimate openai/gpt-4o --file prompt.md --output-tokens 500

  prompt-price v0.1.0

  Model:    OpenAI / GPT-4o (gpt-4o)
  Tokens:   exact (js-tiktoken)

  Input breakdown:
    Content:    1,247 tokens
    Overhead:      11 tokens (3 messages)
    Tools:          0 tokens
    Images:         0 tokens
    ──────────────────────
    Total:      1,258 tokens

  Output:       500 tokens (explicit)

  Cost breakdown:
    Input:   1,258 tokens x $2.50/MTok  = $0.003145
    Output:    500 tokens x $10.00/MTok = $0.005000
    ─────────────────────────────────────────────
    Total:   $0.008145
```

**JSON Output Example:**

```
$ prompt-price estimate openai/gpt-4o --file prompt.md --output-tokens 500 --format json
```

Outputs the `Estimate` object as a JSON string to stdout.

**Budget Check Mode:**

```
$ prompt-price estimate openai/gpt-4o --file large-prompt.md --output-tokens 2000 --max-cost 0.50

  prompt-price v0.1.0

  Model:    OpenAI / GPT-4o (gpt-4o)
  ...
  Total:   $0.621500

  BUDGET EXCEEDED: $0.6215 > $0.5000
```

Exit code 1 when budget is exceeded, 0 otherwise.

#### `prompt-price count <model> [options]`

Counts tokens without cost estimation.

```
$ prompt-price count openai/gpt-4o --file prompt.md

  prompt-price v0.1.0

  Model:    OpenAI / GPT-4o (gpt-4o)
  Method:   exact (js-tiktoken, o200k_base)

  Content:    1,247 tokens
  Overhead:      11 tokens
  Tools:          0 tokens
  Images:         0 tokens
  ──────────────────────
  Total:      1,258 tokens
```

#### `prompt-price compare <model1> <model2> [model3...] [options]`

Compares cost across multiple models.

```
$ prompt-price compare openai/gpt-4o openai/gpt-4o-mini anthropic/claude-haiku-3-5 \
    --file prompt.md --output-tokens 500

  prompt-price v0.1.0

  Prompt: prompt.md (1,247 content tokens)
  Output: 500 tokens (explicit)

  Model                          Input Tokens   Est. Cost
  ─────────────────────────────  ────────────   ─────────
  anthropic/claude-haiku-3-5            1,271   $0.003017
  openai/gpt-4o-mini                    1,258   $0.000489
  openai/gpt-4o                         1,258   $0.008145

  Cheapest: openai/gpt-4o-mini at $0.000489
```

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success. Estimate computed. If `--max-cost` is set, estimate is within budget. |
| `1` | Budget exceeded (`--max-cost` set and estimate exceeds threshold). Also used for model/provider not found. |
| `2` | Configuration error (invalid flags, missing model, unreadable file). |

---

## 11. Architecture

### Component Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        estimate()                                 │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Model       │  │   Token      │  │   Cost       │           │
│  │   Resolver    │  │   Counter    │  │   Calculator │           │
│  │              │  │              │  │              │           │
│  │  Parses      │  │  Counts      │  │  Applies     │           │
│  │  provider/   │  │  tokens per  │  │  pricing to  │           │
│  │  model,      │  │  provider    │  │  token       │           │
│  │  resolves    │  │  strategy    │  │  counts      │           │
│  │  aliases     │  │              │  │              │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│         ▼                 │                 ▼                    │
│  ┌──────────────┐         │          ┌──────────────┐           │
│  │ model-price- │         │          │   Output     │           │
│  │ registry     │◀────────┘          │   Estimator  │           │
│  └──────────────┘                    └──────────────┘           │
│                                                                   │
│  ┌──────────────────────────────────────────────────────┐        │
│  │                    guard()                            │        │
│  │  Wraps client, calls estimate(), enforces budget     │        │
│  └──────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

### Internal Modules

1. **`model-resolver.ts`** -- Parses the `provider/model` string, infers provider from model name when no prefix is provided, and calls `model-price-registry`'s `resolveModel` and `getPrice` to retrieve pricing and model metadata. Returns a `ResolvedModel` object with provider, canonical model ID, pricing, encoding name, and provider-specific configuration (overhead tokens, chars-per-token ratio).

2. **`token-counter.ts`** -- Orchestrates token counting. Selects the counting strategy (native or heuristic) based on provider and `js-tiktoken` availability. Delegates to `tiktoken-counter.ts` for native counting or `heuristic-counter.ts` for approximate counting. Handles the full message array pipeline: content, overhead, tools, images.

3. **`tiktoken-counter.ts`** -- Wraps `js-tiktoken` for OpenAI token counting. Manages encoding initialization (async WASM load), encoding selection per model, and caching of initialized encoders. Exports a single function: `countWithTiktoken(text: string, encoding: string): Promise<number>`.

4. **`heuristic-counter.ts`** -- Implements the characters-per-token heuristic. Exports a single function: `countWithHeuristic(text: string, charsPerToken: number): number`.

5. **`message-overhead.ts`** -- Calculates per-message and per-request overhead tokens for each provider. Contains the provider-specific overhead constants and formulas documented in Section 5.

6. **`tool-tokenizer.ts`** -- Serializes tool definitions to a string representation matching the provider's internal format and counts the resulting tokens. Uses the same tokenizer (native or heuristic) as message content.

7. **`image-tokens.ts`** -- Implements the OpenAI tile formula and Anthropic resolution formula for image token estimation. Exports `openaiImageTokens(width, height, detail)` and `anthropicImageTokens(width, height)`.

8. **`cost-calculator.ts`** -- Takes token counts and pricing data, computes cost breakdown, applies tiered pricing when applicable, and rounds to 6 decimal places. Pure arithmetic, no I/O.

9. **`output-estimator.ts`** -- Resolves the output token estimate from the caller's options (explicit count, ratio, max tokens, or category default). Returns the estimate and its source label.

10. **`guard.ts`** -- Implements the `guard()` and `checkBudget()` functions. Creates Proxy-based wrappers for OpenAI and Anthropic SDK clients. Intercepts `create()` calls, runs `estimate()`, evaluates budget, and dispatches the configured action.

11. **`errors.ts`** -- Defines `BudgetExceededError` and `ModelNotFoundError`.

12. **`cli.ts`** -- CLI entry point. Parses arguments with `util.parseArgs`, reads input from file/stdin/text, calls `estimate()` or `countTokens()` or `compareModels()`, formats output, and exits with the appropriate code.

### Data Flow

```
estimate(messages, 'openai/gpt-4o', options) called
  │
  ├── Model Resolver
  │     ├── Parse 'openai/gpt-4o' -> provider: 'openai', model: 'gpt-4o'
  │     ├── model-price-registry.getPrice('openai', 'gpt-4o') -> PriceEntry
  │     └── Return ResolvedModel { provider, modelId, pricing, encoding, overheadConfig }
  │
  ├── Token Counter
  │     ├── Detect js-tiktoken availability (cached)
  │     ├── Select strategy: native (js-tiktoken + o200k_base) or heuristic (3.9 chars/tok)
  │     ├── For each message:
  │     │     ├── Count content tokens (text parts)
  │     │     ├── Add per-message overhead (4 tokens for OpenAI)
  │     │     └── Count image tokens (if image content parts present)
  │     ├── Add per-request base overhead (3 tokens for OpenAI)
  │     ├── Count tool definition tokens (if tools provided)
  │     └── Return TokenCount { totalTokens, contentTokens, overheadTokens, toolTokens, imageTokens }
  │
  ├── Output Estimator
  │     ├── Check options: estimatedOutputTokens? outputRatio? maxOutputTokens?
  │     ├── If none: use category default ratio (0.25 for 'flagship')
  │     └── Return { estimatedOutputTokens: 315, source: 'categoryDefault' }
  │
  ├── Cost Calculator
  │     ├── inputCost = 1258 / 1_000_000 * 2.50 = $0.003145
  │     ├── estimatedOutputCost = 315 / 1_000_000 * 10.00 = $0.003150
  │     ├── Check tiered pricing: 1258 < 200K threshold, no tier applied
  │     ├── totalEstimatedCost = $0.006295
  │     └── Round all values to 6 decimal places
  │
  └── Return Estimate { inputTokens: 1258, estimatedOutputTokens: 315, ... }
```

---

## 12. Integration with Monorepo Packages

### Integration with `model-price-registry`

`model-price-registry` is the pricing data source. `prompt-price` calls `getPrice()` to retrieve per-model pricing and `getModelInfo()` to retrieve model category (for default output ratios) and context window (for validation).

```typescript
import { getPrice, getModelInfo } from 'model-price-registry';

// Internal usage in model-resolver.ts
const price = getPrice('openai', 'gpt-4o');
const info = getModelInfo('openai', 'gpt-4o');
const category = info?.category ?? 'balanced';
```

The dependency is a runtime `peerDependency`. Callers must install `model-price-registry` alongside `prompt-price`. This ensures callers control the registry version and receive pricing updates independently.

### Integration with `token-fence`

`token-fence` (this monorepo) enforces hard token limits on LLM requests to prevent context window overflow. `prompt-price` and `token-fence` are complementary: `prompt-price` estimates cost (dollars), `token-fence` enforces size (tokens). They can be composed:

```typescript
import { estimate } from 'prompt-price';
import { enforceLimit } from 'token-fence';

// First, check cost
const est = await estimate(messages, 'openai/gpt-4o');
if (est.totalEstimatedCost > 1.00) throw new Error('Too expensive');

// Then, check token limit
const safe = enforceLimit(messages, { maxTokens: 100_000, model: 'gpt-4o' });
```

### Integration with `ai-cost-compare`

`ai-cost-compare` (this monorepo) compares cost across models at the workload level (aggregate cost over many requests). `prompt-price`'s `compareModels()` provides per-request comparison. `ai-cost-compare` can use `prompt-price` internally for per-request estimates within a workload simulation:

```typescript
import { estimate } from 'prompt-price';
import { compareWorkload } from 'ai-cost-compare';

// ai-cost-compare may use prompt-price internally for per-request estimation
const comparison = await compareWorkload(sampleRequests, models, {
  estimator: estimate,
});
```

### Integration with `context-budget`

`context-budget` (this monorepo) manages context window allocation to avoid exceeding model limits. It can use `prompt-price`'s token counting to measure how much of the context budget each component consumes:

```typescript
import { countTokens } from 'prompt-price';
import { allocateBudget } from 'context-budget';

const systemTokens = await countTokens([systemMessage], 'openai/gpt-4o');
const toolTokens = await countTokens([], 'openai/gpt-4o', { tools: myTools });
const remaining = allocateBudget({
  total: 128_000,
  reserved: { system: systemTokens.totalTokens, tools: toolTokens.totalTokens },
});
```

---

## 13. Testing Strategy

### Unit Tests

**Token counting tests:**
- Heuristic counter returns expected token count for known English text samples across all provider ratios.
- Heuristic counter rounds up (never underestimates).
- Tiktoken counter (when `js-tiktoken` is available) matches OpenAI's documented token counts for reference prompts.
- Tiktoken counter selects `cl100k_base` for GPT-4o and `o200k_base` for GPT-4.1.
- Tiktoken counter falls back to heuristic when `js-tiktoken` is not installed (simulated by mocking the dynamic import to reject).
- Empty string produces 0 content tokens (but overhead is still counted).

**Message overhead tests:**
- OpenAI messages add 4 tokens per message plus 3 base tokens.
- OpenAI messages with `name` field add 1 additional token.
- Anthropic overhead matches calibrated values.
- Other providers use default overhead values.

**Tool definition token tests:**
- A single tool with a simple schema produces expected token count (within 10% of known actual).
- Multiple tools accumulate correctly.
- Tool with no parameters has lower token count than tool with complex schema.
- Empty tools array adds 0 tool tokens.

**Image token tests:**
- OpenAI `low` detail returns 85 tokens regardless of dimensions.
- OpenAI `high` detail correctly computes tiles for various image sizes (1x1, 512x512, 1024x768, 2048x2048, 4096x4096).
- OpenAI scaling to 2048 max and 768 shortest side works correctly.
- Anthropic formula computes correctly for various image sizes.
- Anthropic formula caps at ~1600 tokens for maximum resolution.

**Cost calculation tests:**
- Correct cost for known model with known token counts.
- Tiered pricing applies when input tokens exceed threshold.
- Tiered pricing does not apply when input tokens are below threshold.
- Costs round to 6 decimal places.
- Cached input tokens reduce cost when model supports caching.
- Cached input tokens billed at full rate when model does not support caching.
- Custom pricing overrides model-price-registry lookup.

**Output estimation tests:**
- Explicit `estimatedOutputTokens` is used as-is.
- `outputRatio` computes correct token count from input.
- `maxOutputTokens` is used when no explicit estimate or ratio provided.
- Category default ratios are applied correctly for each model category.
- `outputEstimationSource` field reflects the method used.

**Estimate integration tests:**
- `estimate()` produces a complete `Estimate` object with all required fields.
- `estimatePrompt()` wraps text in a user message and produces correct estimate.
- `estimateSync()` produces the same result as `estimate()` when using heuristic.
- `compareModels()` returns estimates sorted by cost ascending.
- `compareModels()` handles models from different providers with different token counts.

**Guard tests:**
- `guard()` with `action: 'abort'` throws `BudgetExceededError` when estimate exceeds `maxCost`.
- `guard()` with `action: 'abort'` allows call when estimate is within budget.
- `guard()` with `action: 'warn'` logs warning but does not throw.
- `guard()` with `action: 'log'` logs at info level.
- `guard()` calls `onEstimate` callback with every estimate.
- `checkBudget()` returns `{ exceeded: true }` when over budget.
- `checkBudget()` returns `{ exceeded: false }` when within budget.
- `BudgetExceededError` contains the `estimate` and `maxCost` properties.

**Model resolver tests:**
- `openai/gpt-4o` parses to provider `openai`, model `gpt-4o`.
- `gpt-4o` (no prefix) infers provider `openai`.
- `claude-sonnet-4-5` infers provider `anthropic`.
- `gemini-2.5-pro` infers provider `google`.
- Unknown model without provider prefix returns an error.
- Alias resolution works (e.g., `openai/chatgpt-4o-latest` resolves to `gpt-4o`).
- Unknown model returns `ModelNotFoundError` (not undefined -- `estimate` must fail explicitly).

**CLI tests:**
- `prompt-price estimate openai/gpt-4o --text "Hello"` exits with code 0 and produces output.
- `prompt-price estimate openai/gpt-4o --file prompt.md` reads file and estimates.
- `prompt-price estimate openai/gpt-4o --text "Hello" --format json` outputs valid JSON.
- `prompt-price estimate openai/gpt-4o --text "Hello" --max-cost 0.001` exits with code 0 (within budget).
- `prompt-price estimate openai/gpt-4o --file huge-prompt.md --max-cost 0.001` exits with code 1 (over budget).
- `prompt-price count openai/gpt-4o --text "Hello"` outputs token count.
- `prompt-price compare openai/gpt-4o openai/gpt-4o-mini --text "Hello"` outputs comparison.
- Stdin input works when piped.
- `--help` and `--version` flags work.
- Invalid model exits with code 2.
- Missing input exits with code 2.

### Edge Cases to Test

- Message with empty string content.
- Message with only whitespace.
- Message array with 0 messages (returns only base overhead).
- Messages with very long content (100K+ characters).
- Tool definition with deeply nested JSON Schema.
- Image content part with no dimensions and no fetchImageDimensions option.
- Model with tiered pricing at exactly the tier threshold (boundary condition).
- `estimatedOutputTokens: 0` (input-cost-only estimate).
- Custom `tokenCounter` that returns non-integer values (should be rounded up).
- Concurrent `estimate()` calls (js-tiktoken encoder should be safely shared or per-call).

### Test Framework

Tests use Vitest, matching the project's existing configuration.

---

## 14. Performance

### Token Counting Latency

**Heuristic counting**: The heuristic counter performs a single `text.length` lookup and a division. It is effectively instantaneous -- under 0.001ms for any text length.

**Native counting (js-tiktoken)**: First-call latency includes WASM initialization for the encoding (~50-100ms for `o200k_base`). Subsequent calls reuse the cached encoder. Per-call latency for native counting is 0.1-1ms for typical prompts (1K-10K characters). For very large prompts (100K+ characters), latency may reach 5-10ms. The encoder is initialized lazily and cached for the lifetime of the process.

### Estimate Throughput

A full `estimate()` call with heuristic counting performs: one model resolution (two object lookups), one heuristic token count (one division per message), one output estimation (one multiplication), and one cost calculation (three multiplications). Total time: under 0.1ms. With native counting, add the tiktoken encoding time.

For applications calling `estimate()` on every request in a hot path (e.g., inside a guard), the heuristic path adds negligible latency. The native path adds ~1ms, which is insignificant compared to the LLM API call latency (typically 500ms-30s).

### Memory Footprint

The package itself is lightweight: pure functions with no state beyond the cached `js-tiktoken` encoder. The encoder for a single encoding (e.g., `o200k_base`) uses approximately 2-4 MB of memory (the BPE merge table). Only one encoder is initialized at a time (for the most recently used encoding). If two different encodings are needed (e.g., `cl100k_base` for GPT-4o and `o200k_base` for GPT-4.1 in the same process), both are cached, using ~4-8 MB total.

The `model-price-registry` data adds ~100-200 KB. Total memory overhead: under 10 MB in all cases.

### Guard Overhead

The `guard()` proxy adds one `estimate()` call per LLM request. For heuristic counting, this adds <0.1ms to each request. For native counting, ~1ms. The proxy itself (JavaScript `Proxy` object) adds negligible overhead to property access.

---

## 15. Dependencies

### Runtime Dependencies

| Dependency | Type | Purpose | Why Not Avoid It |
|---|---|---|---|
| `model-price-registry` | peer (required) | Provides per-model pricing data for cost calculation. | This is the monorepo's pricing source of truth. Bundling pricing data directly would create a stale copy that diverges from the registry's weekly updates. |

### Optional Dependencies

| Dependency | Type | Purpose | Why Not Avoid It |
|---|---|---|---|
| `js-tiktoken` | optional peer | Provides exact BPE token counting for OpenAI models via WASM. | This is the standard JavaScript port of OpenAI's tiktoken. Reimplementing BPE tokenization would be error-prone and would diverge from OpenAI's actual tokenizer. When not installed, the heuristic fallback is used. |

### No Other Runtime Dependencies

CLI argument parsing uses Node.js built-in `util.parseArgs` (Node.js 18+). File I/O uses `node:fs`. Image header parsing (for dimension extraction) uses a minimal inline implementation reading only the first 24 bytes of the file (no image processing library needed). No HTTP client, no utility library.

### Dev Dependencies

| Dependency | Purpose |
|---|---|
| `typescript` | TypeScript compiler. |
| `vitest` | Test runner. |
| `eslint` | Linter. |
| `js-tiktoken` | Dev dependency for testing native token counting. |

---

## 16. File Structure

```
prompt-price/
├── src/
│   ├── index.ts                  # Public API exports
│   ├── estimate.ts               # estimate(), estimateSync(), estimatePrompt()
│   ├── count-tokens.ts           # countTokens(), countTokensSync()
│   ├── compare.ts                # compareModels()
│   ├── guard.ts                  # guard(), checkBudget()
│   ├── model-resolver.ts         # Model string parsing, provider inference, pricing lookup
│   ├── token-counter.ts          # Strategy selection, orchestrates counting pipeline
│   ├── tiktoken-counter.ts       # js-tiktoken wrapper, encoding selection, caching
│   ├── heuristic-counter.ts      # Characters-per-token heuristic
│   ├── message-overhead.ts       # Provider-specific overhead constants and formulas
│   ├── tool-tokenizer.ts         # Tool definition serialization and token counting
│   ├── image-tokens.ts           # OpenAI tile formula, Anthropic resolution formula
│   ├── cost-calculator.ts        # Price * tokens arithmetic, tiered pricing
│   ├── output-estimator.ts       # Output token estimation heuristics
│   ├── errors.ts                 # BudgetExceededError, ModelNotFoundError
│   ├── types.ts                  # All TypeScript interfaces and types
│   ├── cli.ts                    # CLI entry point, argument parsing, output formatting
│   └── __tests__/
│       ├── estimate.test.ts      # estimate(), estimateSync(), estimatePrompt() tests
│       ├── count-tokens.test.ts  # countTokens() tests
│       ├── compare.test.ts       # compareModels() tests
│       ├── guard.test.ts         # guard(), checkBudget(), BudgetExceededError tests
│       ├── model-resolver.test.ts # Model parsing and provider inference tests
│       ├── heuristic.test.ts     # Heuristic counter accuracy tests
│       ├── tiktoken.test.ts      # Native counter tests (skipped if js-tiktoken unavailable)
│       ├── overhead.test.ts      # Message overhead calculation tests
│       ├── tools.test.ts         # Tool definition tokenization tests
│       ├── images.test.ts        # Image token formula tests
│       ├── cost.test.ts          # Cost calculation and rounding tests
│       ├── output.test.ts        # Output estimation heuristic tests
│       └── cli.test.ts           # CLI integration tests
├── package.json
├── tsconfig.json
└── SPEC.md
```

---

## 17. Roadmap

The following features are explicitly out of scope for v1 but may be added in later versions.

### Anthropic Native Tokenizer

If Anthropic publishes a JavaScript tokenizer library (as they have for Python with `anthropic-tokenizer`), `prompt-price` will add it as an optional peer dependency alongside `js-tiktoken`, upgrading Anthropic token counting from approximate to exact.

### Google Gemini Token Count API

Google provides a `countTokens` API endpoint for Gemini models. A future version could offer an opt-in mode that calls this API for exact Gemini token counts, trading latency for precision. This would require network access and a Google API key, so it would be strictly opt-in.

### Streaming Cost Estimation

Estimating cost during a streaming response: as output tokens arrive, update the running cost estimate and trigger a callback or abort when the actual (not estimated) cost exceeds a threshold. This requires integration with streaming response handlers.

### Batch Request Estimation

Estimating cost for a batch of requests (e.g., OpenAI Batch API). Batch pricing is typically 50% off standard pricing. A future version could detect batch mode and apply the discount automatically.

### Audio and Video Token Cost

As models add native audio and video input support, the package will need token/cost formulas for these modalities. OpenAI's audio tokens and Google's video tokens follow different pricing models that are not yet standardized.

### Prompt Caching Estimation

More sophisticated prompt caching estimation: given a sequence of requests with shared prefixes, estimate how many tokens would be served from cache vs. computed fresh, and calculate the blended cost. This requires understanding the provider's caching behavior (TTL, prefix matching rules).

### Framework Integrations

First-class integrations with LangChain, LlamaIndex, Vercel AI SDK, and other popular frameworks. The current `guard()` function supports raw OpenAI and Anthropic SDKs; framework-specific wrappers would provide tighter integration with the framework's request lifecycle.

### Custom Provider Plugins

A plugin system for adding custom providers with their own tokenizer, overhead formula, and pricing, without forking the package. Currently, custom models require manual `tokenCounter` and `pricePerMTok*` options on every call.

---

## 18. Examples

### Example: Basic Cost Estimation

```typescript
import { estimate } from 'prompt-price';

const messages = [
  { role: 'system', content: 'You are a helpful coding assistant.' },
  { role: 'user', content: 'Write a TypeScript function that sorts an array using quicksort.' },
];

const est = await estimate(messages, 'openai/gpt-4o', {
  estimatedOutputTokens: 500,
});

console.log(`Input: ${est.inputTokens} tokens ($${est.inputCost.toFixed(4)})`);
console.log(`Output: ~${est.estimatedOutputTokens} tokens ($${est.estimatedOutputCost.toFixed(4)})`);
console.log(`Total: $${est.totalEstimatedCost.toFixed(4)}`);
```

### Example: Pre-Flight Budget Check

```typescript
import { estimate } from 'prompt-price';

const est = await estimate(messages, 'anthropic/claude-opus-4', {
  estimatedOutputTokens: 4000,
});

if (est.totalEstimatedCost > 0.50) {
  console.error(`Request too expensive: $${est.totalEstimatedCost.toFixed(4)}`);
  // Fall back to a cheaper model
  const cheaperEst = await estimate(messages, 'anthropic/claude-haiku-3-5', {
    estimatedOutputTokens: 4000,
  });
  console.log(`Haiku cost: $${cheaperEst.totalEstimatedCost.toFixed(4)}`);
}
```

### Example: Guard Wrapping an OpenAI Client

```typescript
import { guard } from 'prompt-price';
import OpenAI from 'openai';

const client = new OpenAI();
const guarded = guard(client, {
  maxCost: 1.00,
  action: 'abort',
  estimatedOutputTokens: 2000,
  onEstimate: (est) => {
    metrics.recordEstimate(est.model, est.totalEstimatedCost);
  },
});

try {
  const response = await guarded.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: veryLongDocument }],
  });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.error(`Blocked: estimated $${err.estimate.totalEstimatedCost.toFixed(4)} > $${err.maxCost}`);
  }
}
```

### Example: Token Counting with Tool Definitions

```typescript
import { countTokens } from 'prompt-price';

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'search',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Maximum results to return' },
        },
        required: ['query'],
      },
    },
  },
];

const count = await countTokens(
  [{ role: 'user', content: 'Search for TypeScript best practices' }],
  'openai/gpt-4o',
  { tools },
);

console.log(`Content: ${count.contentTokens} tokens`);
console.log(`Overhead: ${count.overheadTokens} tokens`);
console.log(`Tools: ${count.toolTokens} tokens`);
console.log(`Total: ${count.totalTokens} tokens`);
```

### Example: Image Cost Estimation

```typescript
import { estimate } from 'prompt-price';

const messages = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/photo.jpg', detail: 'high' },
      },
    ],
  },
];

const est = await estimate(messages, 'openai/gpt-4o', {
  estimatedOutputTokens: 200,
  defaultImageSize: { width: 1920, height: 1080 },
});

console.log(`Image tokens: ${est.inputBreakdown.imageTokens}`);
console.log(`Total input tokens: ${est.inputTokens}`);
console.log(`Estimated cost: $${est.totalEstimatedCost.toFixed(4)}`);
```

### Example: Multi-Model Cost Comparison

```typescript
import { compareModels } from 'prompt-price';

const messages = [
  { role: 'system', content: longSystemPrompt },
  { role: 'user', content: userQuery },
];

const results = await compareModels(messages, [
  'openai/gpt-4o',
  'openai/gpt-4.1',
  'openai/gpt-4o-mini',
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-haiku-3-5',
  'google/gemini-2.5-flash',
], { estimatedOutputTokens: 1000 });

console.log('Cost comparison (cheapest first):');
for (const est of results) {
  const flag = est.tokenCountConfidence === 'exact' ? '' : ' ~';
  console.log(`  ${est.model}: $${est.totalEstimatedCost.toFixed(4)}${flag}`);
}
```

### Example: CLI Usage

```bash
# Estimate cost from a file
$ prompt-price estimate openai/gpt-4o --file system-prompt.md --output-tokens 2000

# Estimate with tools
$ prompt-price estimate openai/gpt-4o --file prompt.md --tools tools.json --output-tokens 500

# Budget check in a CI script
$ prompt-price estimate openai/gpt-4o --file prompt.md --output-tokens 1000 --max-cost 0.10 --quiet
$ echo $?  # 0 if within budget, 1 if exceeded

# Compare models
$ prompt-price compare openai/gpt-4o anthropic/claude-sonnet-4-5 google/gemini-2.5-flash \
    --file prompt.md --output-tokens 500

# Count tokens only
$ prompt-price count openai/gpt-4o --text "Hello, world!"

# Pipe from stdin
$ cat prompt.md | prompt-price estimate openai/gpt-4o --output-tokens 500 --format json
```

### Example: Custom Model Pricing

```typescript
import { estimate } from 'prompt-price';

// For an internal model not in model-price-registry
const est = await estimate(
  [{ role: 'user', content: 'Translate this document...' }],
  'internal/custom-llm',
  {
    tokenCounter: (text) => Math.ceil(text.length / 3.5),
    pricePerMTokInput: 0.50,
    pricePerMTokOutput: 1.50,
    estimatedOutputTokens: 2000,
  },
);

console.log(`Custom model cost: $${est.totalEstimatedCost.toFixed(4)}`);
```
