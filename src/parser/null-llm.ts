import type { LlmClient, ParsedItemRaw } from './llm-client';
import type { ParseCtx } from './types';

export class LlmUnavailableError extends Error {}

export class NullLlmClient implements LlmClient {
  async parse(_text: string, _ctx: ParseCtx): Promise<ParsedItemRaw[]> {
    throw new LlmUnavailableError('no LLM configured (set PARSER_MODE=rules or provide a provider)');
  }
}
