import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';
import { streakBonusPercent } from '../modules/worship/service.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
}

function yesterdayUtc(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

describe('streaks', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];

  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  function boot() {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });
    return container;
  }

  const user = { discordUserId: '8001', username: 'streaker' };

  it('bonus percent scales and caps', () => {
    expect(streakBonusPercent(1)).toBe(0);
    expect(streakBonusPercent(2)).toBe(5);
    expect(streakBonusPercent(11)).toBe(50);
    expect(streakBonusPercent(40)).toBe(50);
  });

  it('first timely claim starts a 1-day streak with no bonus', () => {
    const container = boot();
    const result = container.worshipService.claimTimely(user, 1000, 12);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.streak).toBe(1);
      expect(result.streakBonus).toBe(0);
      expect(result.totalAmount).toBe(1000);
    }
    expect(container.economyService.getBalance(user)).toBe(1000);
  });

  it('claiming within the window extends the streak and pays the bonus', () => {
    const container = boot();
    const internalId = (container as any).identityRepo.ensureUser(user).id;

    // 3-streak whose last claim was 13h ago; 12h cooldown → 24h window
    const thirteenHoursAgo = new Date(Date.now() - 13 * 3_600_000).toISOString();
    container.db.sqlite
      .prepare("INSERT INTO streaks (user_id, kind, count, best, last_day, last_claim_at) VALUES (?, 'timely', 3, 3, ?, ?)")
      .run(internalId, yesterdayUtc(), thirteenHoursAgo);

    const result = container.worshipService.claimTimely(user, 1000, 12);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.streak).toBe(4);
      expect(result.streakBonus).toBe(150); // +15% of 1000
      expect(result.totalAmount).toBe(1150);
    }
    expect(container.economyService.getBalance(user)).toBe(1150);
  });

  it('hourly cooldown: consecutive hourly claims extend, a long gap resets', () => {
    const container = boot();
    const internalId = (container as any).identityRepo.ensureUser(user).id;

    // last claim 90 minutes ago with 1h cooldown → 2h window → extends
    const ninetyMinAgo = new Date(Date.now() - 90 * 60_000).toISOString();
    container.db.sqlite
      .prepare("INSERT INTO streaks (user_id, kind, count, best, last_day, last_claim_at) VALUES (?, 'timely', 5, 5, ?, ?)")
      .run(internalId, yesterdayUtc(), ninetyMinAgo);

    const r1 = container.worshipService.claimTimely(user, 100, 1);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.streak).toBe(6);

    // now simulate a 3h gap with 1h cooldown → reset
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    container.db.sqlite
      .prepare("UPDATE streaks SET last_claim_at = ? WHERE user_id = ? AND kind = 'timely'")
      .run(threeHoursAgo, internalId);
    container.db.sqlite.prepare('DELETE FROM transactions').run();

    const r2 = container.worshipService.claimTimely(user, 100, 1);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.streak).toBe(1);
  });

  it('a lapsed streak resets to 1', () => {
    const container = boot();
    const internalId = (container as any).identityRepo.ensureUser(user).id;
    container.db.sqlite
      .prepare("INSERT INTO streaks (user_id, kind, count, best, last_day, last_claim_at) VALUES (?, 'timely', 9, 9, '2020-01-01', '2020-01-01T00:00:00Z')")
      .run(internalId);

    const result = container.worshipService.claimTimely(user, 1000, 12);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.streak).toBe(1);
      expect(result.streakBonus).toBe(0);
    }
    // best is preserved
    const row = container.db.sqlite
      .prepare("SELECT best FROM streaks WHERE user_id = ? AND kind = 'timely'")
      .get(internalId) as { best: number };
    expect(row.best).toBe(9);
  });

  it('prayer checkin advances the prayer streak once per day', () => {
    const container = boot();
    const r1 = container.worshipService.claimPrayer(user, 'fajr', 200, 0, 500);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.streak).toBe(1);

    const r2 = container.worshipService.claimPrayer(user, 'dhuhr', 200, 0, 500);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.streak).toBe(1); // same UTC day — unchanged
  });

  it('streak leaderboard lists active streaks only', () => {
    const container = boot();
    const a = (container as any).identityRepo.ensureUser({ discordUserId: '8002', username: 'alpha' }).id;
    const b = (container as any).identityRepo.ensureUser({ discordUserId: '8003', username: 'beta' }).id;
    const insert = container.db.sqlite.prepare(
      "INSERT INTO streaks (user_id, kind, count, best, last_day, last_claim_at) VALUES (?, 'timely', ?, ?, ?, ?)"
    );
    insert.run(a, 5, 5, yesterdayUtc(), new Date(Date.now() - 3_600_000).toISOString());
    insert.run(b, 8, 8, '2020-01-01', '2020-01-01T00:00:00Z'); // lapsed — excluded

    const rows = container.worshipService.getStreakLeaderboard('timely', 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.username).toBe('alpha');
    expect(rows[0]!.count).toBe(5);
  });
});
