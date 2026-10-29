/** Janela deslizante em memória: no máximo `limit` eventos por chave em `windowMs`. */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): { ok: boolean; retryAfterSec: number } {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => x > t - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + this.windowMs - t) / 1000)) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(t);
    return { ok: true, retryAfterSec: 0 };
  }

  private sweep(t: number): void {
    for (const [key, list] of this.hits) {
      if (!list.some((x) => x > t - this.windowMs)) this.hits.delete(key);
    }
  }
}
