import { Money } from '../domain/money';
import { coerceCategory } from '../domain/categories';
import { parseRules } from './rules-parser';
import { normalizeAmount, resolveCurrencyToken, resolveDate } from './resolution';
import { parsedItemRawSchema, type LlmClient } from './llm-client';
import type { LineItem, ParseCtx, ParseOutcome } from './types';

export class Parser {
  constructor(
    private readonly mode: 'rules' | 'llm' | 'auto',
    private readonly llm: LlmClient,
  ) {}

  async parse(text: string, ctx: ParseCtx): Promise<ParseOutcome> {
    if (this.mode === 'rules') return parseRules(text, ctx);

    if (this.mode === 'auto') {
      const rules = parseRules(text, ctx);
      if (rules.ok) return rules;
    }

    return this.parseLlm(text, ctx);
  }

  private async parseLlm(text: string, ctx: ParseCtx): Promise<ParseOutcome> {
    const raw = await this.llm.parse(text, ctx);

    const validated = parsedItemRawSchema.safeParse(raw);
    if (!validated.success) return { ok: false, reason: 'unparseable' };

    const items: LineItem[] = [];
    for (const item of validated.data) {
      // every digit-run the model claims must appear in the user's text (anti-hallucination)
      const digitRuns = item.amount.match(/\d+/g) ?? [];
      for (const run of digitRuns) {
        if (!text.includes(run)) return { ok: false, reason: 'unparseable' };
      }

      const currency = resolveCurrencyToken(item.currency, ctx.defaultCurrency);

      let money: Money;
      try {
        money = Money.fromDecimalString(normalizeAmount(item.amount), currency);
      } catch {
        return { ok: false, reason: 'unparseable' };
      }

      items.push({
        amountMinor: money.amountMinor,
        currency,
        category: coerceCategory(item.category ?? item.description),
        description: item.description,
        spentOn: resolveDate(item.dateHint, ctx.timezone, ctx.now),
      });
    }

    // LLM output always needs user confirmation
    return { ok: true, items, confidence: 'low', source: 'llm' };
  }
}
