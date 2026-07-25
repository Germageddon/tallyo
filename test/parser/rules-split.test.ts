import { describe, expect, it } from 'vitest';
import { parseRules } from '../../src/parser/rules-parser';

const ctx = { defaultCurrency: 'USD', timezone: 'UTC', now: new Date('2026-06-15T12:00:00Z') };

describe('parseRules item splitting', () => {
  it('keeps a single-amount "and" phrase as ONE item', () => {
    const r = parseRules('beers and cigs 12', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items).toHaveLength(1);
      expect(r.items[0]!.amountMinor).toBe(1200);
      expect(r.items[0]!.description).toContain('beers');
    }
  });

  it('splits on "and" when there are two amounts', () => {
    const r = parseRules('coffee 5 and gas 10', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items).toHaveLength(2);
  });

  it('splits on commas', () => {
    const r = parseRules('coffee 5, gas 10', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items).toHaveLength(2);
  });
});
