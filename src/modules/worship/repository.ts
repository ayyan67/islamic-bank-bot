import { Database } from '../../infra/db/database.js';
import { endOfUtcDay, isRamadan, secondsUntilUtcDayReset, startOfUtcDay } from '../../infra/utils/time.js';

const STANDARD_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
const ALL_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'taraweeh'] as const;

export type PrayerName = (typeof ALL_PRAYERS)[number];
export type StreakKind = 'timely' | 'prayer';

export interface StreakRow {
  count: number;
  best: number;
  last_day: string | null;
  last_claim_at: string | null;
}

export interface StreakLeaderboardRow {
  discord_user_id: string;
  username: string | null;
  count: number;
  best: number;
}

function utcDayString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function previousDayString(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

interface PrayerRow {
  prayer_name: string;
}

interface BalanceRow {
  balance: number;
}

interface LatestPrayerRow {
  checked_in_at: string;
}

export class WorshipRepository {
  constructor(private readonly db: Database) {}

  getDailyPrayers(): readonly PrayerName[] {
    return isRamadan() ? ALL_PRAYERS : STANDARD_PRAYERS;
  }

  ensureWalletExists(userId: number): void {
    const wallet = this.db.sqlite
      .prepare('SELECT balance FROM wallets WHERE user_id = ? LIMIT 1')
      .get(userId) as BalanceRow | undefined;

    if (!wallet) {
      this.db.sqlite.prepare('INSERT INTO wallets (user_id, balance) VALUES (?, 0)').run(userId);
    }
  }

  creditWallet(userId: number, amount: number): void {
    this.db.sqlite
      .prepare('UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
      .run(amount, userId);
  }

  getStreak(userId: number, kind: StreakKind): StreakRow | undefined {
    return this.db.sqlite
      .prepare('SELECT count, best, last_day, last_claim_at FROM streaks WHERE user_id = ? AND kind = ? LIMIT 1')
      .get(userId, kind) as StreakRow | undefined;
  }

  /**
   * Advance the timely streak: consecutive claims where the gap since the
   * previous claim stays within `windowMs` (2x cooldown). A longer gap
   * resets to 1.
   */
  touchTimelyStreak(userId: number, windowMs: number, now = new Date()): { count: number; best: number } {
    const row = this.getStreak(userId, 'timely');
    const last = row?.last_claim_at ? Date.parse(row.last_claim_at) : null;

    const count = last !== null && now.getTime() - last <= windowMs ? (row?.count ?? 0) + 1 : 1;
    const best = Math.max(count, row?.best ?? 0);
    this.db.sqlite
      .prepare(
        `INSERT INTO streaks (user_id, kind, count, best, last_day, last_claim_at) VALUES (?, 'timely', ?, ?, ?, ?)
         ON CONFLICT (user_id, kind) DO UPDATE SET count = excluded.count, best = excluded.best, last_day = excluded.last_day, last_claim_at = excluded.last_claim_at`
      )
      .run(userId, count, best, now.toISOString().slice(0, 10), now.toISOString());
    return { count, best };
  }

  /** Timely streak still alive if the last claim is within the window. */
  getActiveTimelyStreak(userId: number, windowMs: number, now = new Date()): number {
    const row = this.getStreak(userId, 'timely');
    if (!row?.last_claim_at) return 0;
    return now.getTime() - Date.parse(row.last_claim_at) <= windowMs ? row.count : 0;
  }

  /**
   * Advance a streak for today's UTC day. Same-day calls are idempotent;
   * a claim on the day after the last one extends the streak, anything
   * later resets it to 1.
   */
  touchStreak(userId: number, kind: StreakKind, date = new Date()): { count: number; best: number } {
    const today = utcDayString(date);
    const row = this.getStreak(userId, kind);

    let count: number;
    if (row?.last_day === today) {
      return { count: row.count, best: row.best };
    } else if (row?.last_day === previousDayString(today)) {
      count = row.count + 1;
    } else {
      count = 1;
    }

    const best = Math.max(count, row?.best ?? 0);
    this.db.sqlite
      .prepare(
        `INSERT INTO streaks (user_id, kind, count, best, last_day) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, kind) DO UPDATE SET count = excluded.count, best = excluded.best, last_day = excluded.last_day`
      )
      .run(userId, kind, count, best, today);
    return { count, best };
  }

  /** Current streak counting only if still alive (claimed today or yesterday). */
  getActiveStreak(userId: number, kind: StreakKind, date = new Date()): number {
    const row = this.getStreak(userId, kind);
    if (!row?.last_day) return 0;
    const today = utcDayString(date);
    return row.last_day === today || row.last_day === previousDayString(today) ? row.count : 0;
  }

  /**
   * Streak leaderboard. When guildId is given, only members of that guild
   * (per user_guilds) are ranked, so satellite-server accounts never appear
   * in a guild's digest or leaderboard.
   */
  topStreaks(kind: StreakKind, limit: number, date = new Date(), guildId?: string | null): StreakLeaderboardRow[] {
    const memberJoin = guildId
      ? 'INNER JOIN user_guilds ug ON ug.discord_user_id = u.discord_user_id AND ug.guild_id = ?'
      : '';
    const memberParams = guildId ? [guildId] : [];

    if (kind === 'timely') {
      // Cooldowns vary per guild — use a generous 48h liveness cutoff.
      const cutoff = new Date(date.getTime() - 48 * 3_600_000).toISOString();
      return this.db.sqlite
        .prepare(
          `SELECT u.discord_user_id, u.username, s.count, s.best
           FROM streaks s
           INNER JOIN users u ON u.id = s.user_id
           ${memberJoin}
           WHERE s.kind = 'timely' AND s.count > 0 AND s.last_claim_at >= ?
           ORDER BY s.count DESC, s.best DESC, u.id ASC
           LIMIT ?`
        )
        .all(...memberParams, cutoff, limit) as StreakLeaderboardRow[];
    }

    const today = utcDayString(date);
    const yesterday = previousDayString(today);
    return this.db.sqlite
      .prepare(
        `SELECT u.discord_user_id, u.username, s.count, s.best
         FROM streaks s
         INNER JOIN users u ON u.id = s.user_id
         ${memberJoin}
         WHERE s.kind = ? AND s.count > 0 AND s.last_day IN (?, ?)
         ORDER BY s.count DESC, s.best DESC, u.id ASC
         LIMIT ?`
      )
      .all(...memberParams, kind, today, yesterday, limit) as StreakLeaderboardRow[];
  }

  getPrayerStatus(userId: number, date = new Date()): {
    claimed: PrayerName[];
    lastClaimAt: string | null;
    hasBonus: boolean;
  } {
    const dayStart = startOfUtcDay(date).toISOString();
    const dayEnd = endOfUtcDay(date).toISOString();

    const rows = this.db.sqlite
      .prepare(
        `
        SELECT prayer_name
        FROM prayer_checkins
        WHERE user_id = ? AND checked_in_at BETWEEN ? AND ?
      `
      )
      .all(userId, dayStart, dayEnd) as PrayerRow[];

    const claimed = rows
      .map((row) => row.prayer_name)
      .filter((name): name is PrayerName => (ALL_PRAYERS as readonly string[]).includes(name));

    const hasBonus = rows.some((row) => row.prayer_name === 'all_five_bonus');

    const last = this.db.sqlite
      .prepare(
        `
        SELECT checked_in_at
        FROM prayer_checkins
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `
      )
      .get(userId) as LatestPrayerRow | undefined;

    return {
      claimed,
      lastClaimAt: last?.checked_in_at ?? null,
      hasBonus
    };
  }

  claimPrayer(
    userId: number,
    prayer: PrayerName,
    reward: number,
    cooldownHours: number,
    allFiveBonus: number,
    now = new Date()
  ):
    | { ok: true; bonusAwarded: number; checkedInAt: string }
    | { ok: false; reason: string; remainingSeconds?: number } {
    if (prayer === 'taraweeh' && !isRamadan()) {
      return { ok: false, reason: 'Taraweeh check-in is only available during Ramadan.' } as const;
    }

    const dayStart = startOfUtcDay(now).toISOString();
    const dayEnd = endOfUtcDay(now).toISOString();
    const nowIso = now.toISOString();

    return this.db.transaction(() => {
      const todayClaim = this.db.sqlite
        .prepare(
          `
          SELECT 1
          FROM prayer_checkins
          WHERE user_id = ? AND prayer_name = ? AND checked_in_at BETWEEN ? AND ?
          LIMIT 1
        `
        )
        .get(userId, prayer, dayStart, dayEnd);

      if (todayClaim) {
        return {
          ok: false,
          reason: `You already checked in  this prayer day.`,
          resetInSeconds: secondsUntilUtcDayReset(now)
        } as const;
      }

      const latest = this.db.sqlite
        .prepare(
          `
          SELECT checked_in_at
          FROM prayer_checkins
          WHERE user_id = ? AND prayer_name != 'all_five_bonus'
          ORDER BY id DESC
          LIMIT 1
        `
        )
        .get(userId) as LatestPrayerRow | undefined;

      if (latest) {
        const nextAt = Date.parse(latest.checked_in_at) + cooldownHours * 60 * 60 * 1000;
        if (Date.now() < nextAt) {
          return {
            ok: false,
            reason: 'Prayer check-in cooldown is active.',
            remainingSeconds: Math.ceil((nextAt - Date.now()) / 1000)
          } as const;
        }
      }

      this.db.sqlite
        .prepare(
          `
          INSERT INTO prayer_checkins (user_id, prayer_name, checked_in_at, reward_amount)
          VALUES (?, ?, ?, ?)
        `
        )
        .run(userId, prayer, nowIso, reward);

      this.creditWallet(userId, reward);

      let bonusAwarded = 0;

      const todayRows = this.db.sqlite
        .prepare(
          `
          SELECT prayer_name
          FROM prayer_checkins
          WHERE user_id = ? AND checked_in_at BETWEEN ? AND ?
        `
        )
        .all(userId, dayStart, dayEnd) as PrayerRow[];

      const claimedSet = new Set(todayRows.map((row) => row.prayer_name));
      const hasAllPrayers = STANDARD_PRAYERS.every((name) => claimedSet.has(name));
      const bonusAlready = claimedSet.has('all_five_bonus');

      if (hasAllPrayers && !bonusAlready && allFiveBonus > 0) {
        bonusAwarded = allFiveBonus;

        this.db.sqlite
          .prepare(
            `
            INSERT INTO prayer_checkins (user_id, prayer_name, checked_in_at, reward_amount)
            VALUES (?, 'all_five_bonus', ?, ?)
          `
          )
          .run(userId, nowIso, bonusAwarded);

        this.creditWallet(userId, bonusAwarded);
      }

      return { ok: true, bonusAwarded, checkedInAt: nowIso } as const;
    });
  }

  deleteLatestPrayerCheckin(userId: number, prayer?: PrayerName): boolean {
    const query = prayer
      ? `SELECT id FROM prayer_checkins WHERE user_id = ? AND prayer_name = ? ORDER BY id DESC LIMIT 1`
      : `SELECT id FROM prayer_checkins WHERE user_id = ? AND prayer_name != 'all_five_bonus' ORDER BY id DESC LIMIT 1`;

    const row = (prayer
      ? this.db.sqlite.prepare(query).get(userId, prayer)
      : this.db.sqlite.prepare(query).get(userId)) as { id: number } | undefined;

    if (!row) return false;

    this.db.sqlite.prepare(`DELETE FROM prayer_checkins WHERE id = ?`).run(row.id);
    return true;
  }

  deleteAllPrayerCheckins(userId: number): number {
    const result = this.db.sqlite
      .prepare(`DELETE FROM prayer_checkins WHERE user_id = ?`)
      .run(userId);
    return result.changes;
  }
}
