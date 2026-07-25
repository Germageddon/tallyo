/** In-memory sliding-window rate limiter. No persistence. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  allow(key: string): boolean {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
    if (recent.length < this.maxPerWindow) {
      recent.push(t);
      this.hits.set(key, recent);
      return true;
    }
    this.hits.set(key, recent);
    return false;
  }
}
