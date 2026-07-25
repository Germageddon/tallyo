import { Money } from '../domain/money';
import { coerceCategory } from '../domain/categories';
import { KNOWN_CURRENCIES, normalizeAmount, resolveCurrencyToken, resolveDate } from './resolution';
import type { LineItem, ParseCtx, ParseOutcome } from './types';

const AMOUNT_RE = /(?<sym>[$€£¥])?\s*(?<num>\d+(?:[.,]\d+)?)/;
const CODE_TOKEN_RE = /\b[A-Za-z]{3}\b/g;
const FILLER_RE = /\b(on|for|spent|paid)\b/gi;

/**
 * Deterministic, no-LLM parser. Splits an utterance into item chunks on commas
 * and the word " and ", then extracts one amount + currency + description per chunk.
 */
export function parseRules(text: string, ctx: ParseCtx): ParseOutcome {
  if (!text.trim()) return { ok: false, reason: 'empty' };

  const chunks = text
    .split(/,|\s+and\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const spentOn = resolveDate(null, ctx.timezone, ctx.now);
  const items: LineItem[] = [];

  for (const chunk of chunks) {
    const match = chunk.match(AMOUNT_RE);
    const num = match?.groups?.num;
    if (!match || !num) return { ok: false, reason: 'unparseable' };

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
      return { ok: false, reason: 'unparseable' };
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

    items.push({
      amountMinor: money.amountMinor,
      currency,
      category: coerceCategory(desc),
      description: desc,
      spentOn,
    });
  }

  return { ok: true, items, confidence: 'high', source: 'rules' };
}
