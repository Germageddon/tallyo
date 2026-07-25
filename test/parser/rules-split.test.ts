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

  it('splits on newlines (one expense per line), not the "and" inside a line', () => {
    const r = parseRules('grand 25\ndrinks 50\ngas 10\ncigs and gum 5', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items).toHaveLength(4);
      expect(r.items.map((i) => i.amountMinor)).toEqual([2500, 5000, 1000, 500]);
      expect(r.items[0]!.description).toBe('grand');
      expect(r.items[3]!.description).toBe('cigs and gum');
    }
  });
});
