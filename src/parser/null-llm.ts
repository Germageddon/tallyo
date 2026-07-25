import type { LlmClient, ParsedItemRaw } from './llm-client';
import type { ParseCtx } from './types';

export class LlmUnavailableError extends Error {}

/** Default LLM client when none is configured — makes `auto` mode effectively rules-only. */
export class NullLlmClient implements LlmClient {
  async parse(_text: string, _ctx: ParseCtx): Promise<ParsedItemRaw[]> {
    throw new LlmUnavailableError('no LLM configured (set PARSER_MODE=rules or provide a provider)');
  }
}
