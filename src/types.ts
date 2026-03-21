/** A single message in a conversation */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

/** A multi-modal content part */
export interface ContentPart {
  type: 'text' | 'image_url' | 'audio' | 'file';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
  /** Estimated tokens for non-text parts when exact count is unavailable */
  estimatedTokens?: number;
}

/** A tool call made by an assistant message */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** A tool/function definition passed in the tools parameter */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/** Options for the estimate() function */
export interface EstimateOptions {
  model: string;
  provider?: string;
  messages?: Message[];
  prompt?: string;
  maxOutputTokens?: number;
  tools?: ToolDefinition[];
  systemPrompt?: string;
}

/** Options for countTokens() */
export interface CountTokensOptions {
  model?: string;
  encoding?: string;  // tiktoken encoding name
}

/** Result of a token count operation */
export interface TokenCount {
  tokens: number;
  encoding?: string;
  method: 'exact' | 'approximate';
}

/** A cost estimate result */
export interface Estimate {
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

/** Options for the guard() middleware */
export interface GuardOptions {
  model: string;
  provider?: string;
  maxCost: number;
  maxOutputTokens?: number;
  onExceed?: 'throw' | 'warn' | 'log';
}

/** Options for checkBudget() */
export interface CheckBudgetOptions {
  model: string;
  provider?: string;
  messages: Message[];
  budget: number;
  maxOutputTokens?: number;
}

/** Result of checkBudget() */
export interface BudgetResult {
  withinBudget: boolean;
  estimate: Estimate;
  budget: number;
  remaining: number;
  utilizationPct: number;
}

/** A client that looks like the OpenAI SDK */
export interface OpenAILikeClient {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<unknown>;
    };
  };
}

/** A client that looks like the Anthropic SDK */
export interface AnthropicLikeClient {
  messages: {
    create(params: Record<string, unknown>): Promise<unknown>;
  };
}

export type SupportedClient = OpenAILikeClient | AnthropicLikeClient;
