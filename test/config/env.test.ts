import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env';

describe('loadConfig', () => {
  it('applies defaults for an empty env', () => {
    const c = loadConfig({});
    expect(c.DB_PATH).toBe('./data/tallyo.sqlite');
    expect(c.DEFAULT_CURRENCY).toBe('USD');
    expect(c.DEFAULT_TZ).toBe('UTC');
    expect(c.PARSER_MODE).toBe('auto');
  });
  it('reads provided values', () => {
    const c = loadConfig({ DEFAULT_CURRENCY: 'EUR', PARSER_MODE: 'rules' });
    expect(c.DEFAULT_CURRENCY).toBe('EUR');
    expect(c.PARSER_MODE).toBe('rules');
  });
  it('rejects an invalid currency length', () => {
    expect(() => loadConfig({ DEFAULT_CURRENCY: 'US' })).toThrow(ConfigError);
  });
  it('rejects an invalid parser mode', () => {
    expect(() => loadConfig({ PARSER_MODE: 'magic' })).toThrow(ConfigError);
  });
});
