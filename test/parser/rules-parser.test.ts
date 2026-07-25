import { describe, expect, it } from 'vitest';
import { parseRules } from '../../src/parser/rules-parser';
import type { ParseCtx } from '../../src/parser/types';

const ctx: ParseCtx = {
  defaultCurrency: 'USD',
  timezone: 'UTC',
  now: new Date('2026-07-15T12:00:00Z'),
};

describe('parseRules', () => {
  it('splits on commas into multiple items with symbol + default currency', () => {
    const result = parseRules('spent $20 on food, 10 on gas', ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(2);
    expect(result.source).toBe('rules');
    expect(result.confidence).toBe('high');

    const [food, gas] = result.items;
    expect(food!.currency).toBe('USD');
    expect(food!.amountMinor).toBe(2000);
    expect(food!.category).toBe('Food');

    expect(gas!.currency).toBe('USD');
    expect(gas!.amountMinor).toBe(1000);
    expect(gas!.category).toBe('Transport');
  });

  it('parses a bare "description amount" chunk', () => {
    const result = parseRules('coffee 5', ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.amountMinor).toBe(500);
    expect(result.items[0]!.category).toBe('Food');
  });

  it('picks up a standalone known currency code', () => {
    const result = parseRules('20 usd food', ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]!.currency).toBe('USD');
    expect(result.items[0]!.amountMinor).toBe(2000);
    expect(result.items[0]!.category).toBe('Food');
  });

  it('does not misread a description word as a currency code', () => {
    // "food" is not a currency; with a EUR default the item must stay EUR.
    const result = parseRules('food 20', { ...ctx, defaultCurrency: 'EUR' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]!.currency).toBe('EUR');
    expect(result.items[0]!.category).toBe('Food');
    expect(result.items[0]!.description).toBe('food');
  });

  it('returns unparseable when a chunk has no amount', () => {
    const result = parseRules('hello there', ctx);
    expect(result).toEqual({ ok: false, reason: 'unparseable' });
  });

  it('returns empty for whitespace-only input', () => {
    expect(parseRules('   ', ctx)).toEqual({ ok: false, reason: 'empty' });
  });
});
