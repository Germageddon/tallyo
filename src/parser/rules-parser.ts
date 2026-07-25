import { Money } from '../domain/money';
import { coerceCategory } from '../domain/categories';
import { KNOWN_CURRENCIES, normalizeAmount, resolveCurrencyToken, resolveDate } from './resolution';
import type { LineItem, ParseCtx, ParseOutcome } from './types';

const AMOUNT_RE = /(?<sym>[$€£¥])?\s*(?<num>\d+(?:[.,]\d+)?)/;
const AMOUNT_G = /\d+(?:[.,]\d+)?/g;
const CODE_TOKEN_RE = /\b[A-Za-z]{3}\b/g;
const FILLER_RE = /\b(on|for|spent|paid)\b/gi;

/**
 * Deterministic, no-LLM parser.
 *
 * Item boundaries are newlines and commas. The word "and" only splits a chunk
 * when that chunk contains 2+ amounts — so "cigs and gum 5" stays a single
 * $5 item, while "coffee 5 and gas 10" becomes two.
 */
export function parseRules(text: string, ctx: ParseCtx): ParseOutcome {
  if (!text.trim()) return { ok: false, reason: 'empty' };

  const spentOn = resolveDate(null, ctx.timezone, ctx.now);
  const items: LineItem[] = [];

  // Primary item boundaries: newlines and commas (people list one expense per line).
  const itemChunks = text.split(/[\n,]/).map((c) => c.trim()).filter(Boolean);
  for (const line of itemChunks) {
    const amountCount = (line.match(AMOUNT_G) ?? []).length;
    const subChunks =
      amountCount >= 2
        ? line.split(/\s+and\s+/i).map((c) => c.trim()).filter(Boolean)
        : [line];

    for (const chunk of subChunks) {
      const item = parseChunk(chunk, ctx, spentOn);
      if (!item) return { ok: false, reason: 'unparseable' };
      items.push(item);
    }
  }

  if (items.length === 0) return { ok: false, reason: 'unparseable' };
  return { ok: true, items, confidence: 'high', source: 'rules' };
}

function parseChunk(chunk: string, ctx: ParseCtx, spentOn: string): LineItem | null {
  const match = chunk.match(AMOUNT_RE);
  const num = match?.groups?.num;
  if (!match || !num) return null;

  const sym = match.groups?.sym ?? null;

  // Currency: a leading symbol wins; otherwise sniff a standalone known 3-letter
  // code. A description word like "food" (4 letters) can never be mistaken here.
  let currency: string;
  let codeToken: string | null = null;
  if (sym) {
    currency = resolveCurrencyToken(sym, ctx.defaultCurrency);
  } else {
    const tokens = chunk.match(CODE_TOKEN_RE) ?? [];
    const found = tokens.find((t) => KNOWN_CURRENCIES.has(t.toUpperCase()));
    if (found) {
      codeToken = found;
      currency = found.toUpperCase();
    } else {
      currency = ctx.defaultCurrency.toUpperCase();
    }
  }

  let money: Money;
  try {
    money = Money.fromDecimalString(normalizeAmount(num), currency);
  } catch {
    return null;
  }

  // Description = chunk minus the amount, the code token, symbols and filler words.
  let desc = chunk.replace(match[0], ' ');
  if (codeToken) desc = desc.replace(new RegExp(`\\b${codeToken}\\b`, 'i'), ' ');
  desc = desc
    .replace(/[$€£¥]/g, ' ')
    .replace(FILLER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!desc) desc = 'expense';

  return {
    amountMinor: money.amountMinor,
    currency,
    category: coerceCategory(desc),
    description: desc,
    spentOn,
  };
}
