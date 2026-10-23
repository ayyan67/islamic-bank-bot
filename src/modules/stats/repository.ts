import type { Database } from '../../infra/db/database.js';
import type { DailyMetric, DailyStatPoint } from './types.js';

export class StatsRepository {
  constructor(private readonly db: Database) {}

  hasDay(date: string, guildId: string): boolean {
    const row = this.db.sqlite
      .prepare('SELECT 1 AS x FROM daily_stats WHERE date = ? AND guild_id = ? LIMIT 1')
      .get(date, guildId) as { x: number } | undefined;
    return Boolean(row);
  }

  upsertMany(date: string, guildId: string, values: Partial<Record<DailyMetric, number>>): void {
    const stmt = this.db.sqlite.prepare(
      `INSERT INTO daily_stats (date, guild_id, metric, value, computed_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (date, guild_id, metric) DO UPDATE SET value = excluded.value, computed_at = CURRENT_TIMESTAMP`
    );
    this.db.transaction(() => {
      for (const [metric, value] of Object.entries(values)) {
        if (typeof value === 'number' && Number.isFinite(value)) stmt.run(date, guildId, metric, value);
      }
    });
  }

  getSeries(metric: DailyMetric, guildId: string, days: number): DailyStatPoint[] {
    return this.db.sqlite
      .prepare(
        `SELECT date, value FROM daily_stats WHERE guild_id = ? AND metric = ? ORDER BY date DESC LIMIT ?`
      )
      .all(guildId, metric, days)
      .reverse() as DailyStatPoint[];
  }

  latestDate(guildId: string): string | null {
    const row = this.db.sqlite
      .prepare('SELECT max(date) AS d FROM daily_stats WHERE guild_id = ?')
      .get(guildId) as { d: string | null } | undefined;
    return row?.d ?? null;
  }

  /** Guilds that had scoped ledger activity on a given UTC day. */
  guildsActiveOn(date: string): string[] {
    const rows = this.db.sqlite
      .prepare(
        `SELECT DISTINCT guild_id FROM transactions
         WHERE guild_id IS NOT NULL AND created_at >= ? AND created_at < date(?, '+1 day')`
      )
      .all(date, date) as Array<{ guild_id: string }>;
    return rows.map((r) => r.guild_id);
  }
}
