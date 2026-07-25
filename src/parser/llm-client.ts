import { z } from 'zod';
import type { ParseCtx } from './types';

/** One raw item as an LLM emits it — unresolved strings, later normalized/validated. */
export type ParsedItemRaw = {
  amount: string;
  currency: string | null;
  category: string | null;
  description: string;
  dateHint: string | null;
};

export interface LlmClient {
  parse(text: string, ctx: ParseCtx): Promise<ParsedItemRaw[]>;
}

/** Test double: returns a fixed set of raw items regardless of input. */
export class MockLlmClient implements LlmClient {
  constructor(private readonly items: ParsedItemRaw[]) {}

  async parse(_text: string, _ctx: ParseCtx): Promise<ParsedItemRaw[]> {
    return this.items;
  }
}

/** Runtime guard for whatever the LLM returns before we trust it. */
export const parsedItemRawSchema = z.array(
  z.object({
    amount: z.string().min(1),
    currency: z.string().nullable(),
    category: z.string().nullable(),
    description: z.string(),
    dateHint: z.string().nullable(),
  }),
);
