import type { Category } from '../domain/categories';

export type LineItem = {
  amountMinor: number;
  currency: string; // ISO-4217, uppercase
  category: Category;
  description: string;
  spentOn: string; // YYYY-MM-DD
};

export type ParseCtx = {
  defaultCurrency: string;
  timezone: string; // IANA, e.g. 'Europe/Berlin'
  now: Date;
};

export type ParseOutcome =
  | { ok: true; items: LineItem[]; confidence: 'high' | 'low'; source: 'rules' | 'llm' }
  | { ok: false; reason: 'empty' | 'unparseable' };
