import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/safety/rate-limiter';

describe('RateLimiter', () => {
  it('allows up to maxPerWindow then blocks within the window', () => {
    const clock = 1000;
    const limiter = new RateLimiter(3, 1000, () => clock);
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(false); // 4th within the same window
  });

  it('allows again once the window advances past old hits', () => {
    let clock = 1000;
    const limiter = new RateLimiter(2, 1000, () => clock);
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(false);
    clock += 1001; // old timestamps now fall outside the window
    expect(limiter.allow('k')).toBe(true);
  });

  it('tracks keys independently', () => {
    const clock = 0;
    const limiter = new RateLimiter(1, 1000, () => clock);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    expect(limiter.allow('b')).toBe(true);
  });
});
