import { z } from 'zod';

const ConfigSchema = z.object({
  DB_PATH: z.string().min(1).default('./data/tallyo.sqlite'),
  DEFAULT_CURRENCY: z.string().length(3).default('USD'),
  DEFAULT_TZ: z.string().min(1).default('UTC'),
  PARSER_MODE: z.enum(['rules', 'llm', 'auto']).default('auto'),

  // Public bot only, not the local CLI.
  ACCESS_MODE: z.enum(['allowlist', 'open']).default('allowlist'),
  OWNER_ID: z.string().optional(), // bypasses the allowlist
  ALLOWLIST: z.string().default(''), // comma-separated
  MAX_INPUT_CHARS: z.coerce.number().int().positive().default(500),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
  DAILY_MSG_QUOTA: z.coerce.number().int().positive().default(1000),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new ConfigError(`invalid configuration: ${details}`);
  }
  return result.data;
}
