# prompt-price -- Task Breakdown

All tasks derived from SPEC.md. Each task maps to a specific feature, configuration option, error handling case, or edge case described in the spec.

---

## Phase 1: Project Scaffolding & Configuration

- [x] **Install dev dependencies** -- Add `typescript`, `vitest`, `eslint`, and `js-tiktoken` as devDependencies in package.json. | Status: done
- [x] **Configure peer dependencies** -- Add `model-price-registry` as a required peerDependency (`^1.0.0`) and `js-tiktoken` as an optional peerDependency (`^1.0.0`) with `peerDependenciesMeta` in package.json. | Status: done
- [x] **Configure CLI binary** -- Add `"bin": { "prompt-price": "dist/cli.js" }` to package.json so the CLI is available as `prompt-price` after global install or via npx. | Status: done
- [x] **Verify tsconfig.json** -- Confirm existing tsconfig.json settings (target ES2022, module commonjs, strict mode, outDir dist, rootDir src) are correct for the project. No changes expected. | Status: done
- [x] **Create src/types.ts** -- Define all TypeScript interfaces and types: `Message`, `ContentPart`, `ToolCall`, `ToolDefinition`, `EstimateOptions`, `CountTokensOptions`, `TokenCount`, `Estimate`, `GuardOptions`, `CheckBudgetOptions`, `BudgetResult`, `SupportedClient`, `OpenAILikeClient`, `AnthropicLikeClient`. All types must match Section 8 of the spec exactly. | Status: done
- [x] **Create src/errors.ts** -- Define `BudgetExceededError` (extends Error, contains `estimate: Estimate` and `maxCost: number` properties, formats message with cost, budget, model, and token counts) and `ModelNotFoundError` (extends Error, contains the unresolved model string). | Status: done
- [x] **Create src/index.ts exports** -- Set up the barrel file exporting all public API functions (`estimate`, `estimateSync`, `estimatePrompt`, `countTokens`, `countTokensSync`, `compareModels`, `guard`, `checkBudget`) and all types, plus `BudgetExceededError` and `ModelNotFoundError`. | Status: done

---

## Phase 2: Model Resolution

- [x] **Create src/model-resolver.ts -- provider/model parsing** -- Implement parsing of `provider/model` strings (e.g., `'openai/gpt-4o'`) into separate provider and model components. Handle the case where the string contains a `/` delimiter. | Status: done
- [x] **Implement provider inference from model name** -- When no provider prefix is given (e.g., `'gpt-4o'`), infer the provider using known prefixes: `gpt-*` and `o1/o3/o4-*` -> OpenAI, `claude-*` -> Anthropic, `gemini-*` -> Google, `llama-*` -> Meta, `mistral-*` and `codestral*` -> Mistral, `command-*` -> Cohere. Throw `ModelNotFoundError` if provider cannot be inferred. | Status: done
- [x] **Integrate with model-price-registry for price lookup** -- Call `getPrice()` from `model-price-registry` to retrieve `inputPerMTok` and `outputPerMTok` for the resolved model. Handle the case where the model is not found in the registry (throw `ModelNotFoundError` unless custom pricing is provided). | Status: done
- [ ] **Integrate with model-price-registry for model info** -- Call `getModelInfo()` to retrieve the model's category (for default output ratios), context window size, and any alias resolution. Return a `ResolvedModel` object containing provider, canonical model ID, pricing, encoding name, and provider-specific configuration (overhead tokens, chars-per-token ratio). | Status: not_done
- [ ] **Implement encoding selection for OpenAI models** -- Maintain a static lookup table mapping OpenAI models to encodings: `cl100k_base` for GPT-4o/GPT-4o-mini/GPT-4-turbo/GPT-4/GPT-3.5-turbo, `o200k_base` for GPT-4.1/GPT-4.1-mini/GPT-4.1-nano/o3/o3-mini/o4-mini/o1. Unknown OpenAI models default to `o200k_base`. | Status: not_done
- [x] **Implement provider-specific configuration constants** -- Define per-provider config: chars-per-token ratio (OpenAI cl100k: 3.9, OpenAI o200k: 4.0, Anthropic: 3.5, Google: 4.0, Mistral: 3.8, Cohere: 4.0, Meta: 3.7), base overhead tokens, per-message overhead tokens. | Status: done

---

## Phase 3: Token Counting -- Heuristic

- [x] **Create src/heuristic-counter.ts** -- Implement `countWithHeuristic(text: string, charsPerToken: number): number`. Formula: `Math.ceil(text.length / charsPerToken)`. Must return 0 for empty string. | Status: done
- [x] **Ensure heuristic always rounds up** -- The function must use `Math.ceil` to ensure it never underestimates. Verify this with targeted tests. | Status: done

---

## Phase 4: Token Counting -- Native (js-tiktoken)

- [ ] **Create src/tiktoken-counter.ts** -- Implement `countWithTiktoken(text: string, encoding: string): Promise<number>`. Wraps `js-tiktoken` to encode text and return the token count. | Status: not_done
- [ ] **Implement lazy js-tiktoken detection** -- Use a dynamic `import('js-tiktoken')` wrapped in try/catch to detect availability at runtime. Cache the detection result so the import is attempted only once per process lifetime. | Status: not_done
- [ ] **Implement encoding initialization and caching** -- Initialize the WASM-based encoder lazily on first use. Cache initialized encoders keyed by encoding name (e.g., `cl100k_base`, `o200k_base`). Support caching multiple encoders simultaneously. | Status: not_done
- [ ] **Handle js-tiktoken fallback** -- When `js-tiktoken` is not installed (dynamic import fails), gracefully fall back to heuristic counting for OpenAI models. Log no warning -- this is expected behavior. | Status: not_done

---

## Phase 5: Message Overhead Calculation

- [x] **Create src/message-overhead.ts** -- Implement provider-specific overhead calculation functions. | Status: done
- [ ] **Implement OpenAI message overhead** -- Per-request base: 3 tokens. Per-message: 4 tokens (covers `<|im_start|>`, role, `<|im_sep|>`, `<|im_end|>`). Name field: +1 token if present. These constants apply to gpt-4o, gpt-4.1, o3, o4-mini. | Status: not_done
- [x] **Implement Anthropic message overhead** -- Per-request base: ~10 tokens. Per-message: 3-5 tokens for role markers. System prompt is separate (counted as content, not as a message role overhead). Use empirically calibrated values. | Status: done
- [x] **Implement default provider message overhead** -- For Google, Mistral, Cohere, Meta, and unknown providers: per-request base 10 tokens, per-message 5 tokens. Conservative defaults for providers without documented overhead formulas. | Status: done

---

## Phase 6: Tool Definition Tokenization

- [x] **Create src/tool-tokenizer.ts** -- Implement tool definition serialization and token counting. | Status: done
- [ ] **Implement OpenAI tool serialization** -- Serialize each tool to the TypeScript-like format that matches OpenAI's internal representation: `namespace functions { // <description> type <name> = (_: { <params> }) => any; }`. Tokenize the resulting string using the same tokenizer (native or heuristic) as message content. Add per-tool structural overhead. | Status: not_done
- [x] **Implement Anthropic/other tool serialization** -- For Anthropic and other providers, serialize tool definitions to compact JSON representation. Tokenize using the provider's tokenizer strategy. | Status: done
- [x] **Handle empty tools array** -- When `tools` is undefined or an empty array, return 0 tool tokens with no processing. | Status: done

---

## Phase 7: Image Token Estimation

- [ ] **Create src/image-tokens.ts** -- Implement provider-specific image token formulas. | Status: not_done
- [ ] **Implement OpenAI image token formula** -- `openaiImageTokens(width, height, detail)`: For `low` detail, return flat 85 tokens. For `high`/`auto` detail: resize to fit 2048x2048, scale shortest side to 768, compute tiles as `ceil(w/512) * ceil(h/512)`, return `tiles * 85 + 170`. | Status: not_done
- [ ] **Implement Anthropic image token formula** -- `anthropicImageTokens(width, height)`: Resize so longer edge <= 1568 and total pixels <= 1,568,000. Return `Math.ceil((w * h) / 750)`. Minimum 1 token, maximum ~1600 tokens. | Status: not_done
- [ ] **Implement default image size handling** -- When image content parts have a URL but no explicit dimensions and `fetchImageDimensions` is not enabled, use configurable default dimensions (default 1024x1024) and log a warning. | Status: not_done
- [ ] **Implement image header dimension extraction** -- Parse the first 24 bytes of image data (from base64 content parts) to detect PNG/JPEG/GIF/WebP dimensions without loading the full image. This is only for inline base64 images in `source` content parts. | Status: not_done

---

## Phase 8: Token Counter Orchestrator

- [ ] **Create src/token-counter.ts** -- Implement the orchestrator that ties together all token counting components. | Status: not_done
- [ ] **Implement strategy selection logic** -- Based on the provider, select native (js-tiktoken for OpenAI when available) or heuristic counting. Accept a custom `tokenCounter` function that overrides built-in strategies. | Status: not_done
- [ ] **Implement full message array pipeline** -- Execute the 5-step pipeline: (1) add base overhead, (2) count per-message content tokens, (3) add per-message overhead tokens, (4) count tool definition tokens, (5) count image tokens. Return a complete `TokenCount` object. | Status: not_done
- [ ] **Implement per-message breakdown** -- Populate `TokenCount.perMessage` with per-message detail: role, contentTokens, overheadTokens, imageTokens for each message. | Status: not_done
- [ ] **Set confidence field** -- Set `confidence` to `'exact'` when using js-tiktoken native counting, `'approximate'` for heuristic or custom counters. | Status: not_done
- [ ] **Handle multi-part content messages** -- For messages where `content` is an array of `ContentPart` objects (mix of text and images), tokenize each text part separately and compute image tokens for each image part. | Status: not_done

---

## Phase 9: Output Token Estimation

- [ ] **Create src/output-estimator.ts** -- Implement output token estimation with priority-ordered resolution. | Status: not_done
- [ ] **Implement explicit output token count** -- When `estimatedOutputTokens` is provided in options, use it directly. Set `outputEstimationSource` to `'explicit'`. | Status: not_done
- [ ] **Implement output-to-input ratio** -- When `outputRatio` is provided (and `estimatedOutputTokens` is not), compute `estimatedOutputTokens = inputTokens * outputRatio`. Set `outputEstimationSource` to `'ratio'`. | Status: not_done
- [ ] **Implement max output tokens** -- When `maxOutputTokens` is provided (and neither explicit count nor ratio is provided), use it as worst-case estimate. Set `outputEstimationSource` to `'maxTokens'`. | Status: not_done
- [ ] **Implement category-based default ratios** -- When no output estimation parameter is provided, use the model's category from model-price-registry: flagship=0.25, balanced=0.20, fast=0.15, reasoning=0.50, code=0.30, embedding=0.00, legacy=0.20. Set `outputEstimationSource` to `'categoryDefault'`. | Status: not_done

---

## Phase 10: Cost Calculator

- [x] **Create src/cost-calculator.ts** -- Implement cost calculation from token counts and pricing data. | Status: done
- [x] **Implement basic cost formula** -- `inputCost = inputTokens / 1_000_000 * inputPerMTok`, `estimatedOutputCost = estimatedOutputTokens / 1_000_000 * outputPerMTok`, `totalEstimatedCost = inputCost + estimatedOutputCost - cachedInputSavings`. | Status: done
- [x] **Implement 6 decimal place rounding** -- Use `Math.round(value * 1_000_000) / 1_000_000` for all cost values. | Status: done
- [ ] **Implement tiered pricing** -- For models with long-context pricing tiers (e.g., Gemini 2.5 Pro at 2x above 200K tokens, Claude Sonnet 4.5 at 2x above 200K tokens), apply the tiered rate when `inputTokens` exceeds the tier threshold. The tier applies to the entire input, not just tokens above the threshold. Set `tieredPricingApplied` flag. | Status: not_done
- [ ] **Implement cached input token savings** -- When `cachedInputTokens` is provided and the model supports prompt caching (has a cached input price in model-price-registry), compute savings as `cachedInputTokens / 1_000_000 * (inputPerMTok - cachedInputPerMTok)`. Set `cachedInputSavings`. When caching is not supported, savings = 0. | Status: not_done
- [ ] **Support custom pricing overrides** -- When `pricePerMTokInput` and/or `pricePerMTokOutput` are provided in options, use them instead of model-price-registry lookup. | Status: not_done

---

## Phase 11: Core API -- estimate()

- [x] **Create src/estimate.ts** -- Implement the primary `estimate()` function. | Status: done
- [x] **Implement async estimate()** -- Orchestrate: (1) resolve model via model-resolver, (2) count tokens via token-counter, (3) estimate output via output-estimator, (4) calculate cost via cost-calculator. Return a complete `Estimate` object with all fields (model, provider, resolvedModelId, inputTokens, inputBreakdown, estimatedOutputTokens, outputEstimationSource, inputCost, estimatedOutputCost, cachedInputSavings, totalEstimatedCost, currency, inputPerMTok, outputPerMTok, tieredPricingApplied, tokenCountConfidence, timestamp). | Status: done
- [x] **Implement estimateSync()** -- Synchronous variant that always uses heuristic counting (never attempts js-tiktoken). Returns the same `Estimate` shape. | Status: done
- [x] **Implement estimatePrompt()** -- Convenience wrapper that takes a plain string, wraps it in `[{ role: 'user', content: prompt }]`, and delegates to `estimate()`. | Status: done
- [ ] **Set timestamp field** -- Set `Estimate.timestamp` to the ISO 8601 timestamp of when the estimate was computed (`new Date().toISOString()`). | Status: not_done
- [x] **Set currency field** -- Always set `Estimate.currency` to `'USD'`. | Status: done

---

## Phase 12: Core API -- countTokens()

- [x] **Create src/count-tokens.ts** -- Implement standalone token counting functions. | Status: done
- [x] **Implement async countTokens()** -- Resolve model, count tokens (content, overhead, tools, images), and return a `TokenCount` object. Does not compute cost or output estimation. | Status: done
- [x] **Implement countTokensSync()** -- Synchronous variant, always uses heuristic. | Status: done

---

## Phase 13: Core API -- compareModels()

- [x] **Create src/compare.ts** -- Implement multi-model comparison. | Status: done
- [x] **Implement compareModels()** -- Call `estimate()` for each model in the array, collect all `Estimate` objects, sort by `totalEstimatedCost` ascending (cheapest first), and return the sorted array. Handle models from different providers (different token counts per model). | Status: done

---

## Phase 14: Budget Guards

- [x] **Create src/guard.ts** -- Implement budget enforcement features. | Status: done
- [x] **Implement checkBudget()** -- Low-level function: call `estimate()` with the provided messages/model/options, compare `totalEstimatedCost` against `maxCost`, return `BudgetResult { exceeded, estimate, maxCost }`. | Status: done
- [x] **Implement guard() for OpenAI SDK** -- Create a `Proxy`-based wrapper that intercepts `client.chat.completions.create()`. Extract messages, model, tools, and max_tokens from the request params. Call `estimate()`. If cost exceeds `maxCost`: abort throws `BudgetExceededError`, warn logs via logger.warn, log logs via logger.info. Call `onEstimate` callback with every estimate regardless of action. If within budget, delegate to the original method. | Status: done
- [x] **Implement guard() for Anthropic SDK** -- Intercept `client.messages.create()`. Extract messages, model, tools, system, and max_tokens. Same budget evaluation and action dispatch as OpenAI guard. | Status: done
- [x] **Implement guard() return type preservation** -- The returned proxy must match the input client's type (`T`) so it is a drop-in replacement. Compile-time error for unsupported client types (`SupportedClient` union). | Status: done
- [x] **Implement guard action: abort** -- Throw `BudgetExceededError` with the `Estimate` and `maxCost`. Prevent the API call from being sent. | Status: done
- [x] **Implement guard action: warn** -- Log a warning via `logger.warn` (default `console.warn`) with cost details. Allow the API call to proceed. | Status: done
- [x] **Implement guard action: log** -- Log at info level via `logger.info` (default `console.info`) silently. Allow the API call to proceed. | Status: done
- [ ] **Implement onEstimate callback** -- Call `options.onEstimate(estimate)` with every estimate, regardless of whether budget is exceeded or what action is configured. For metrics collection. | Status: not_done
- [x] **Default guard action** -- When `action` is not specified, default to `'abort'`. | Status: done

---

## Phase 15: CLI

- [ ] **Create src/cli.ts** -- Implement the CLI entry point with shebang line (`#!/usr/bin/env node`). | Status: not_done
- [ ] **Implement argument parsing** -- Use `util.parseArgs` (Node.js 18+ built-in) to parse all CLI flags: `--file`, `--text`, `--tools`, `--system`, `--output-tokens`, `--output-ratio`, `--max-output-tokens`, `--format`, `--quiet`, `--max-cost`, `--version`, `--help`. | Status: not_done
- [ ] **Implement `estimate` command** -- Parse model from positional args, read input from `--file`, `--text`, or stdin. Construct messages array. Call `estimate()` with appropriate options. Format and print output. | Status: not_done
- [ ] **Implement `count` command** -- Parse model, read input, call `countTokens()`, format and print token breakdown. | Status: not_done
- [ ] **Implement `compare` command** -- Parse multiple models from positional args, read input, call `compareModels()`, format and print comparison table. | Status: not_done
- [ ] **Implement file input reading** -- Read prompt from a file path via `--file`. Support plain text files (wrap content in a user message) and JSON files (parse as a messages array). | Status: not_done
- [ ] **Implement stdin input reading** -- When no `--file` or `--text` is provided, read from stdin. Detect whether stdin is a TTY; if so, print usage hint. | Status: not_done
- [ ] **Implement --tools flag** -- Read tool definitions from a JSON file path. Parse and pass as `tools` option to estimate/countTokens. | Status: not_done
- [ ] **Implement --system flag** -- Prepend a system message with the given text content to the messages array. | Status: not_done
- [ ] **Implement human-readable output format** -- Format output with aligned columns showing: version header, model info, token confidence, input breakdown (content, overhead, tools, images, total), output estimate, cost breakdown (input cost, output cost, total). Match the format shown in Section 10 of the spec. | Status: not_done
- [ ] **Implement JSON output format** -- When `--format json` is specified, output the `Estimate` or `TokenCount` object as a JSON string to stdout. | Status: not_done
- [ ] **Implement --quiet flag** -- Print only the total estimated cost (e.g., `$0.008145`) with no other output. | Status: not_done
- [ ] **Implement budget check mode** -- When `--max-cost` is set: display the estimate, then print budget verdict. Exit code 1 if estimate exceeds threshold, exit code 0 if within budget. | Status: not_done
- [ ] **Implement exit codes** -- Exit 0 for success (and within budget if --max-cost is set). Exit 1 for budget exceeded or model/provider not found. Exit 2 for configuration errors (invalid flags, missing model, unreadable file). | Status: not_done
- [ ] **Implement --version flag** -- Print `prompt-price v<version>` from package.json and exit. | Status: not_done
- [ ] **Implement --help flag** -- Print usage information and exit. | Status: not_done
- [ ] **Implement environment variable support** -- Read `PROMPT_PRICE_FORMAT`, `PROMPT_PRICE_MODEL`, `PROMPT_PRICE_MAX_COST` from environment. CLI flags override environment variables. | Status: not_done

---

## Phase 16: Unit Tests -- Token Counting

- [x] **Create src/__tests__/heuristic.test.ts** -- Test heuristic counter: returns expected token count for known English text samples across all provider ratios; rounds up (never underestimates); returns 0 for empty string. | Status: done
- [ ] **Create src/__tests__/tiktoken.test.ts** -- Test native counter: matches OpenAI's documented token counts for reference prompts; selects `cl100k_base` for GPT-4o and `o200k_base` for GPT-4.1; falls back to heuristic when `js-tiktoken` is not installed (mock the dynamic import to reject). Skip tests if js-tiktoken is not available. | Status: not_done

---

## Phase 17: Unit Tests -- Message Overhead

- [ ] **Create src/__tests__/overhead.test.ts** -- Test: OpenAI messages add 4 tokens per message plus 3 base tokens; OpenAI messages with `name` field add 1 additional token; Anthropic overhead matches calibrated values; other providers use default overhead values. | Status: not_done

---

## Phase 18: Unit Tests -- Tool Definition Tokenization

- [ ] **Create src/__tests__/tools.test.ts** -- Test: a single tool with simple schema produces expected token count (within 10% of known actual); multiple tools accumulate correctly; tool with no parameters has lower count than tool with complex schema; empty tools array adds 0 tool tokens. | Status: not_done

---

## Phase 19: Unit Tests -- Image Token Formulas

- [ ] **Create src/__tests__/images.test.ts** -- Test OpenAI: `low` detail returns 85 regardless of dimensions; `high` detail correctly computes tiles for 1x1, 512x512, 1024x768, 2048x2048, 4096x4096; scaling to 2048 max and 768 shortest side works. Test Anthropic: formula computes correctly for various sizes; caps at ~1600 tokens for max resolution. | Status: not_done

---

## Phase 20: Unit Tests -- Cost Calculation

- [ ] **Create src/__tests__/cost.test.ts** -- Test: correct cost for known model with known token counts; tiered pricing applies when input tokens exceed threshold; tiered pricing does not apply below threshold; costs round to 6 decimal places; cached input tokens reduce cost when model supports caching; cached input tokens billed at full rate when model does not support caching; custom pricing overrides registry lookup. | Status: not_done

---

## Phase 21: Unit Tests -- Output Estimation

- [ ] **Create src/__tests__/output.test.ts** -- Test: explicit `estimatedOutputTokens` is used as-is; `outputRatio` computes correct count; `maxOutputTokens` used when no explicit estimate/ratio; category default ratios applied correctly for each category; `outputEstimationSource` reflects method used. | Status: not_done

---

## Phase 22: Unit Tests -- Model Resolver

- [x] **Create src/__tests__/model-resolver.test.ts** -- Test: `openai/gpt-4o` parses correctly; `gpt-4o` infers openai; `claude-sonnet-4-5` infers anthropic; `gemini-2.5-pro` infers google; unknown model without prefix returns error; alias resolution works; unknown model returns `ModelNotFoundError`. | Status: done

---

## Phase 23: Unit Tests -- Estimate Integration

- [x] **Create src/__tests__/estimate.test.ts** -- Test: `estimate()` produces complete Estimate with all required fields; `estimatePrompt()` wraps text correctly; `estimateSync()` produces same result as `estimate()` when using heuristic; multiple estimates with different models produce different costs. | Status: done

---

## Phase 24: Unit Tests -- compareModels

- [x] **Create src/__tests__/compare.test.ts** -- Test: `compareModels()` returns estimates sorted by cost ascending; handles models from different providers with different token counts; returns correct number of estimates. | Status: done

---

## Phase 25: Unit Tests -- Guard and Budget

- [ ] **Create src/__tests__/guard.test.ts** -- Test: `guard()` with abort action throws `BudgetExceededError` when over budget; allows call when within budget; warn action logs but does not throw; log action logs at info level; `onEstimate` callback called with every estimate; `checkBudget()` returns `exceeded: true` when over; returns `exceeded: false` when within; `BudgetExceededError` has `estimate` and `maxCost` properties. | Status: not_done

---

## Phase 26: Unit Tests -- CLI

- [ ] **Create src/__tests__/cli.test.ts** -- Test: `estimate` command with `--text` exits 0; `--file` reads file; `--format json` outputs valid JSON; `--max-cost` within budget exits 0; `--max-cost` exceeded exits 1; `count` command outputs token count; `compare` command outputs comparison; stdin input works; `--help` and `--version` flags work; invalid model exits 2; missing input exits 2. | Status: not_done

---

## Phase 27: Edge Case Tests

- [ ] **Test empty string content** -- Message with empty string content produces 0 content tokens but overhead is still counted. | Status: not_done
- [ ] **Test whitespace-only content** -- Message with only whitespace still counts tokens for that whitespace. | Status: not_done
- [ ] **Test zero messages** -- Message array with 0 messages returns only base overhead tokens. | Status: not_done
- [ ] **Test very long content** -- Messages with 100K+ characters produce reasonable token counts without error or excessive latency. | Status: not_done
- [ ] **Test deeply nested tool schema** -- Tool definition with deeply nested JSON Schema (objects within objects, arrays of objects) tokenizes without error. | Status: not_done
- [ ] **Test image with no dimensions and no fetchImageDimensions** -- Image content part with URL but no explicit dimensions uses default 1024x1024 and logs warning. | Status: not_done
- [ ] **Test tiered pricing at exact threshold** -- Model with tiered pricing where inputTokens equals exactly the tier threshold (boundary condition). | Status: not_done
- [ ] **Test estimatedOutputTokens: 0** -- Setting output tokens to 0 produces an input-cost-only estimate with $0 output cost. | Status: not_done
- [ ] **Test custom tokenCounter returning non-integer** -- Custom counter returning fractional values should be rounded up (Math.ceil). | Status: not_done
- [ ] **Test concurrent estimate() calls** -- Multiple concurrent async `estimate()` calls complete without race conditions or shared state corruption (js-tiktoken encoder safely shared or per-call). | Status: not_done

---

## Phase 28: Documentation

- [ ] **Create README.md** -- Write the package README with: overview, installation instructions, peer dependency setup, API reference for all exported functions, CLI usage examples, budget guard examples, multi-model comparison examples, custom model/pricing examples, and links to related monorepo packages. | Status: not_done
- [ ] **Add JSDoc comments to all public functions** -- Add JSDoc with @param, @returns, and @example tags to `estimate`, `estimateSync`, `estimatePrompt`, `countTokens`, `countTokensSync`, `compareModels`, `guard`, `checkBudget`. | Status: not_done
- [ ] **Add JSDoc comments to all exported types** -- Add JSDoc descriptions to every field on `Message`, `Estimate`, `TokenCount`, `EstimateOptions`, `GuardOptions`, `BudgetResult`, and other exported interfaces. | Status: not_done

---

## Phase 29: Build & Lint Verification

- [ ] **Verify TypeScript compilation** -- Run `npm run build` and confirm all source files compile without errors. dist/ output includes .js, .d.ts, and .js.map files. | Status: not_done
- [ ] **Verify lint passes** -- Run `npm run lint` and fix any lint issues. | Status: not_done
- [ ] **Verify all tests pass** -- Run `npm run test` (vitest) and confirm all tests pass. | Status: not_done
- [ ] **Verify CLI works end-to-end** -- Run the built CLI binary (`node dist/cli.js estimate openai/gpt-4o --text "Hello"`) and confirm it produces correct output. Test all three commands (estimate, count, compare). | Status: not_done

---

## Phase 30: Version Bump & Publishing Prep

- [ ] **Bump version in package.json** -- Bump from 0.1.0 to the appropriate version based on the scope of changes (likely 1.0.0 for initial full implementation). | Status: not_done
- [ ] **Verify package.json metadata** -- Ensure name, description, main, types, files, bin, engines, license, keywords, peerDependencies, and optionalDependencies are all correct. | Status: not_done
- [ ] **Test npm pack** -- Run `npm pack` and inspect the tarball contents to verify only dist/ and package.json/README are included (no src/, no test files). | Status: not_done
