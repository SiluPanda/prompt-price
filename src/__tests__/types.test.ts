import { describe, it, expectTypeOf } from 'vitest';
import type {
  Message,
  ContentPart,
  Estimate,
  EstimateOptions,
  BudgetResult,
  TokenCount,
  GuardOptions,
  SupportedClient,
  OpenAILikeClient,
  AnthropicLikeClient,
} from '../types';

describe('Message type', () => {
  it('role is system|user|assistant|tool', () => {
    expectTypeOf<Message['role']>().toEqualTypeOf<'system' | 'user' | 'assistant' | 'tool'>();
  });

  it('content is string or ContentPart[]', () => {
    expectTypeOf<Message['content']>().toEqualTypeOf<string | ContentPart[]>();
  });

  it('optional fields are optional', () => {
    const msg: Message = { role: 'user', content: 'hello' };
    expectTypeOf(msg.tool_call_id).toEqualTypeOf<string | undefined>();
    expectTypeOf(msg.name).toEqualTypeOf<string | undefined>();
  });
});

describe('ContentPart type', () => {
  it('type covers 4 values', () => {
    expectTypeOf<ContentPart['type']>().toEqualTypeOf<'text' | 'image_url' | 'audio' | 'file'>();
  });

  it('can be constructed with each type value', () => {
    const text: ContentPart = { type: 'text', text: 'hello' };
    const img: ContentPart = { type: 'image_url', image_url: { url: 'https://example.com/img.png' } };
    const audio: ContentPart = { type: 'audio' };
    const file: ContentPart = { type: 'file' };
    expectTypeOf(text).toMatchTypeOf<ContentPart>();
    expectTypeOf(img).toMatchTypeOf<ContentPart>();
    expectTypeOf(audio).toMatchTypeOf<ContentPart>();
    expectTypeOf(file).toMatchTypeOf<ContentPart>();
  });
});

describe('Estimate type', () => {
  it('has inputCost, outputCost, totalCost', () => {
    expectTypeOf<Estimate['inputCost']>().toEqualTypeOf<number>();
    expectTypeOf<Estimate['outputCost']>().toEqualTypeOf<number>();
    expectTypeOf<Estimate['totalCost']>().toEqualTypeOf<number>();
  });

  it('currency is always USD', () => {
    expectTypeOf<Estimate['currency']>().toEqualTypeOf<'USD'>();
  });

  it('has model and provider strings', () => {
    expectTypeOf<Estimate['model']>().toEqualTypeOf<string>();
    expectTypeOf<Estimate['provider']>().toEqualTypeOf<string>();
  });

  it('has inputTokens and outputTokens', () => {
    expectTypeOf<Estimate['inputTokens']>().toEqualTypeOf<number>();
    expectTypeOf<Estimate['outputTokens']>().toEqualTypeOf<number>();
  });

  it('method is exact|approximate', () => {
    expectTypeOf<Estimate['method']>().toEqualTypeOf<'exact' | 'approximate'>();
  });
});

describe('EstimateOptions type', () => {
  it('requires model', () => {
    expectTypeOf<EstimateOptions['model']>().toEqualTypeOf<string>();
  });

  it('everything else is optional', () => {
    const opts: EstimateOptions = { model: 'openai/gpt-4o' };
    expectTypeOf(opts.provider).toEqualTypeOf<string | undefined>();
    expectTypeOf(opts.messages).toMatchTypeOf<Message[] | undefined>();
    expectTypeOf(opts.prompt).toEqualTypeOf<string | undefined>();
    expectTypeOf(opts.maxOutputTokens).toEqualTypeOf<number | undefined>();
    expectTypeOf(opts.systemPrompt).toEqualTypeOf<string | undefined>();
  });
});

describe('BudgetResult type', () => {
  it('has withinBudget, estimate, budget, remaining, utilizationPct', () => {
    expectTypeOf<BudgetResult['withinBudget']>().toEqualTypeOf<boolean>();
    expectTypeOf<BudgetResult['estimate']>().toEqualTypeOf<Estimate>();
    expectTypeOf<BudgetResult['budget']>().toEqualTypeOf<number>();
    expectTypeOf<BudgetResult['remaining']>().toEqualTypeOf<number>();
    expectTypeOf<BudgetResult['utilizationPct']>().toEqualTypeOf<number>();
  });
});

describe('TokenCount type', () => {
  it('method is exact|approximate', () => {
    expectTypeOf<TokenCount['method']>().toEqualTypeOf<'exact' | 'approximate'>();
  });

  it('has tokens number', () => {
    expectTypeOf<TokenCount['tokens']>().toEqualTypeOf<number>();
  });

  it('encoding is optional string', () => {
    expectTypeOf<TokenCount['encoding']>().toEqualTypeOf<string | undefined>();
  });
});

describe('GuardOptions type', () => {
  it('requires model and maxCost', () => {
    expectTypeOf<GuardOptions['model']>().toEqualTypeOf<string>();
    expectTypeOf<GuardOptions['maxCost']>().toEqualTypeOf<number>();
  });

  it('other fields are optional', () => {
    const opts: GuardOptions = { model: 'openai/gpt-4o', maxCost: 1.0 };
    expectTypeOf(opts.provider).toEqualTypeOf<string | undefined>();
    expectTypeOf(opts.maxOutputTokens).toEqualTypeOf<number | undefined>();
    expectTypeOf(opts.onExceed).toEqualTypeOf<'throw' | 'warn' | 'log' | undefined>();
  });
});

describe('SupportedClient type', () => {
  it('is union of OpenAILikeClient and AnthropicLikeClient', () => {
    expectTypeOf<SupportedClient>().toEqualTypeOf<OpenAILikeClient | AnthropicLikeClient>();
  });

  it('OpenAILikeClient has chat.completions.create', () => {
    expectTypeOf<OpenAILikeClient['chat']['completions']['create']>().toBeFunction();
  });

  it('AnthropicLikeClient has messages.create', () => {
    expectTypeOf<AnthropicLikeClient['messages']['create']>().toBeFunction();
  });
});
