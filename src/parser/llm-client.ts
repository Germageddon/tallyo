import { z } from 'zod';
import type { ParseCtx } from './types';

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

export class MockLlmClient implements LlmClient {
  constructor(private readonly items: ParsedItemRaw[]) {}

  async parse(_text: string, _ctx: ParseCtx): Promise<ParsedItemRaw[]> {
    return this.items;
  }
}

export const parsedItemRawSchema = z.array(
  z.object({
    amount: z.string().min(1),
    currency: z.string().nullable(),
    category: z.string().nullable(),
    description: z.string(),
    dateHint: z.string().nullable(),
  }),
);
