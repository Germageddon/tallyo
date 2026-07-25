import { describe, expect, it } from 'vitest';
import { Parser } from '../../src/parser/parser';
import { MockLlmClient, type ParsedItemRaw } from '../../src/parser/llm-client';
import type { ParseCtx } from '../../src/parser/types';

const ctx: ParseCtx = {
  defaultCurrency: 'USD',
  timezone: 'UTC',
  now: new Date('2026-07-15T12:00:00Z'),
};

describe('Parser (auto mode)', () => {
  it('uses the rules parser when the text is rule-parseable', async () => {
    const parser = new Parser('auto', new MockLlmClient([]));
    const result = await parser.parse('spent $20 on food', ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('rules');
    expect(result.items[0]!.amountMinor).toBe(2000);
  });

  it('falls back to the LLM when the rules parser cannot handle the text', async () => {
    const raw: ParsedItemRaw[] = [
      { amount: '15', currency: null, category: 'Food', description: 'lunch', dateHint: 'yesterday' },
    ];
    const parser = new Parser('auto', new MockLlmClient(raw));
    const result = await parser.parse('grabbed lunch, my share was like 15 bucks', ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('llm');
    expect(result.confidence).toBe('low');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.amountMinor).toBe(1500);
    expect(result.items[0]!.currency).toBe('USD');
    expect(result.items[0]!.category).toBe('Food');
    expect(result.items[0]!.spentOn).toBe('2026-07-14');
  });

  it('rejects an LLM amount that is not grounded in the original text', async () => {
    const raw: ParsedItemRaw[] = [
      { amount: '99', currency: null, category: 'Food', description: 'lunch', dateHint: null },
    ];
    const parser = new Parser('auto', new MockLlmClient(raw));
    const result = await parser.parse('grabbed lunch out with friends', ctx);
    expect(result).toEqual({ ok: false, reason: 'unparseable' });
  });
});
