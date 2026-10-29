import type { Clock } from '../domain/types';
import type { Db } from './db';

export interface Budget {
  scope: 'user' | 'global';
  key: string;
  limit: number;
}

class BudgetExceeded extends Error {
  constructor(public readonly budget: Budget) {
    super('budget exceeded');
  }
}

export class UsageStore {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock = () => new Date(),
  ) {}

  private day(): string {
    return this.clock().toISOString().slice(0, 10); // UTC: o orçamento "vira" à meia-noite UTC
  }

  /** Tenta gastar 1 unidade de cada orçamento. Devolve o que estourou, ou null se tudo passou. */
  tryConsume(budgets: Budget[]): Budget | null {
    const day = this.day();
    const insert = this.db.prepare('INSERT OR IGNORE INTO usage_counters (scope, key, day, count) VALUES (?, ?, ?, 0)');
    const bump = this.db.prepare('UPDATE usage_counters SET count = count + 1 WHERE scope = ? AND key = ? AND day = ? AND count < ?');
    try {
      this.db.transaction(() => {
        for (const b of budgets) {
          insert.run(b.scope, b.key, day);
          const res = bump.run(b.scope, b.key, day, b.limit) as { changes: number };
          if (res.changes === 0) throw new BudgetExceeded(b);
        }
      })();
      return null;
    } catch (err) {
      if (err instanceof BudgetExceeded) return err.budget;
      throw err;
    }
  }

  used(scope: Budget['scope'], key: string): number {
    const row = this.db
      .prepare('SELECT count FROM usage_counters WHERE scope = ? AND key = ? AND day = ?')
      .get(scope, key, this.day()) as { count: number } | undefined;
    return row?.count ?? 0;
  }
}
