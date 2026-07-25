import { z } from 'zod';

const ConfigSchema = z.object({
  DB_PATH: z.string().min(1).default('./data/tally.sqlite'),
  DEFAULT_CURRENCY: z.string().length(3).default('USD'),
  DEFAULT_TZ: z.string().min(1).default('UTC'),
  PARSER_MODE: z.enum(['rules', 'llm', 'auto']).default('auto'),
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
