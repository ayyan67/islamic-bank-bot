import type { Database } from '../../infra/db/database.js';
import type { StatsRepository } from './repository.js';
import { GLOBAL_GUILD, type DailyMetric, type DailyStatPoint } from './types.js';

const SOURCE_KINDS = ['claim_timely', 'claim_prayer', 'claim_eid', 'claim_tag_reward', 'claim_trivia', 'challenge_reward', 'admin_award'];
const BOT_USERNAMES = ['MEE6', 'Dyno', 'Carl-bot', 'Arcane', 'ProBot'];
export const BACKFILL_DAYS = 30;

function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return utcDate(d);
}

/**
 * Daily metric snapshots. Cheap by construction: every query is bounded to a
 * single UTC day via idx_transactions_created_at, except the supply metrics
 * which sum the wallets tables once (93k rows, a few ms) and only run for the
 * most recent day.
 */
export class StatsService {
  constructor(
    private readonly db: Database,
    private readonly repo: StatsRepository
  ) {}

  /**
   * Compute every missing day up to yesterday (UTC). Backfills at most
   * BACKFILL_DAYS on first run. Returns the number of day/guild snapshots written.
   */
  runDue(now = new Date()): { computed: number; ms: number } {
    const started = Date.now();
    const yesterday = addDays(utcDate(now), -1);
    const latest = this.repo.latestDate(GLOBAL_GUILD);
    let cursor = latest ? addDays(latest, 1) : addDays(yesterday, -(BACKFILL_DAYS - 1));
    if (cursor < addDays(yesterday, -(BACKFILL_DAYS - 1))) cursor = addDays(yesterday, -(BACKFILL_DAYS - 1));

    let computed = 0;
    while (cursor <= yesterday) {
      computed += this.computeDay(cursor, { withSupply: cursor === yesterday });
      cursor = addDays(cursor, 1);
    }
    return { computed, ms: Date.now() - started };
  }

  /** Compute one UTC day for the global scope and every guild with scoped activity. */
  computeDay(date: string, opts: { withSupply?: boolean } = {}): number {
    let written = 0;
    this.repo.upsertMany(date, GLOBAL_GUILD, this.metricsFor(date, null, opts.withSupply ?? false));
    written++;
    for (const guildId of this.repo.guildsActiveOn(date)) {
      this.repo.upsertMany(date, guildId, this.metricsFor(date, guildId, false));
      written++;
    }
    return written;
  }

  getSeries(metric: DailyMetric, days: number, guildId: string = GLOBAL_GUILD): DailyStatPoint[] {
    return this.repo.getSeries(metric, guildId, days);
  }

  private metricsFor(date: string, guildId: string | null, withSupply: boolean): Partial<Record<DailyMetric, number>> {
    const s = this.db.sqlite;
    const from = date;
    const to = addDays(date, 1);
    const scope = guildId === null ? '' : 'AND guild_id = @guildId';
    const p = { from, to, guildId };
    const one = (sql: string): Record<string, number> => (s.prepare(sql).get(p) as Record<string, number>) ?? {};
    const inList = (xs: string[]) => xs.map((x) => `'${x}'`).join(',');

    const out: Partial<Record<DailyMetric, number>> = {};

    const base = `FROM transactions WHERE kind != 'legacy' AND created_at >= @from AND created_at < @to ${scope}`;
    out.active_users = one(`SELECT count(DISTINCT user_id) v ${base}`).v ?? 0;
    out.minted = one(`SELECT coalesce(sum(amount),0) v ${base} AND amount > 0 AND kind IN (${inList(SOURCE_KINDS)})`).v ?? 0;
    const purchases = one(`SELECT count(*) n, coalesce(sum(-amount),0) v ${base} AND kind = 'shop_purchase'`);
    const refunds = one(`SELECT count(*) n, coalesce(sum(amount),0) v ${base} AND kind = 'shop_refund'`);
    const take = one(`SELECT coalesce(sum(-amount),0) v ${base} AND kind = 'admin_take'`).v ?? 0;
    out.burned = (purchases.v ?? 0) - (refunds.v ?? 0) + take;
    out.shop_purchases = purchases.n ?? 0;
    out.shop_refunds = refunds.n ?? 0;
    out.timely_claims = one(`SELECT count(*) v ${base} AND kind = 'claim_timely' AND subtype = 'timely'`).v ?? 0;
    const transfers = one(`SELECT count(*) n, coalesce(sum(-amount),0) v ${base} AND kind = 'transfer' AND subtype = 'sent'`);
    out.transfers_count = transfers.n ?? 0;
    out.transfers_volume = transfers.v ?? 0;

    const dropScope = guildId === null ? '' : 'AND guild_id = @guildId';
    const drops = one(`SELECT count(*) n, coalesce(sum(amount),0) v FROM drops WHERE created_at >= @from AND created_at < @to ${dropScope}`);
    out.drops_count = drops.n ?? 0;
    out.drops_volume = drops.v ?? 0;

    if (guildId === null) {
      out.new_users = one(`SELECT count(*) v FROM users WHERE created_at NOT LIKE '1970%' AND created_at >= @from AND created_at < @to`).v ?? 0;
      out.prayer_checkins = one(
        `SELECT count(*) v FROM prayer_checkins WHERE prayer_name IN ('fajr','dhuhr','asr','maghrib','isha') AND checked_in_at >= @from AND checked_in_at < @to`
      ).v ?? 0;

      if (withSupply) {
        const supply = one(
          `SELECT (SELECT coalesce(sum(balance),0) FROM wallets) w, (SELECT coalesce(sum(balance),0) FROM vault_accounts) v`
        );
        out.supply_wallets = supply.w ?? 0;
        out.supply_vaults = supply.v ?? 0;
        const total = (supply.w ?? 0) + (supply.v ?? 0);
        const top = one(
          `SELECT coalesce(sum(b),0) v FROM (
             SELECT w.balance + coalesce(va.balance,0) b FROM wallets w
             JOIN users u ON u.id = w.user_id
             LEFT JOIN vault_accounts va ON va.user_id = w.user_id
             WHERE u.username NOT IN (${inList(BOT_USERNAMES)})
             ORDER BY b DESC LIMIT 10)`
        ).v ?? 0;
        out.top10_share = total > 0 ? top / total : 0;
      }
    }

    return out;
  }
}
