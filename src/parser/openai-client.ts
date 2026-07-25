import type { LlmClient, ParsedItemRaw } from './llm-client';
import type { ParseCtx } from './types';
import { CATEGORIES } from '../domain/categories';

/**
 * Real LLM parser via OpenAI's Chat Completions (JSON mode, temperature 0).
 * The user's text is sent as a separate `user` message — never interpolated into
 * the instruction string — so message content cannot rewrite the parser's rules.
 * Not exercised by the hermetic test suite (network); the parser validates,
 * grounds, and category-coerces whatever this returns.
 */
export class OpenAiLlmClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = 'gpt-4o-mini',
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}

  async parse(text: string, ctx: ParseCtx): Promise<ParsedItemRaw[]> {
    const system =
      `Extract expense line-items from the user's message as strict JSON of the shape ` +
      `{"items":[{"amount":"<number exactly as written>","currency":"<ISO 4217 code or null>",` +
      `"category":"<one of ${CATEGORIES.join('|')} or null>","description":"<short>",` +
      `"dateHint":"<a relative phrase like 'yesterday', an ISO date, or null>"}]}. ` +
      `Only use amounts and currencies that literally appear in the message. ` +
      `The user's default currency is ${ctx.defaultCurrency}.`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '{"items":[]}';
    const parsed = JSON.parse(content) as { items?: ParsedItemRaw[] };
    return parsed.items ?? [];
  }
}
