import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
}

describe('weekly digest', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];

  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  const guildId = '901000';

  it('computes top earners, transfers and activity for the week', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const alice = { discordUserId: '9001', username: 'alice' };
    const bob = { discordUserId: '9002', username: 'bob' };

    // Put both users in the guild
    for (const u of [alice, bob]) {
      const id = (container as any).identityRepo.ensureUser(u).id;
      container.db.sqlite
        .prepare('INSERT OR IGNORE INTO user_guilds (discord_user_id, guild_id) VALUES (?, ?)')
        .run(u.discordUserId, guildId);
      void id;
    }

    // Earnings via timely claims and a transfer between them
    container.worshipService.claimTimely(alice, 1500, 12);
    container.worshipService.claimTimely(bob, 500, 12);
    container.economyService.transfer(alice, bob, 400);

    const digest = container.digestService.computeWeeklyDigest(guildId);

    expect(digest.topEarners[0]!.username).toBe('alice');
    expect(digest.topEarners[0]!.earned).toBe(1500);
    expect(digest.biggestTransfer).not.toBeNull();
    expect(digest.biggestTransfer!.amount).toBe(400);
    expect(digest.biggestTransfer!.fromUsername).toBe('alice');
    expect(digest.biggestTransfer!.toUsername).toBe('bob');
    expect(digest.activeUsers).toBeGreaterThanOrEqual(2);
    expect(digest.totalEarned).toBe(2000);
    expect(digest.topTimelyStreaks.length).toBeGreaterThan(0);
  });

  it('digest channel setting round-trips', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    expect(container.guildSettingsService.getDigestChannelId(guildId)).toBeNull();
    container.guildSettingsService.setDigestChannelId(guildId, '12345');
    expect(container.guildSettingsService.getDigestChannelId(guildId)).toBe('12345');
    expect(container.guildSettingsService.listGuildsWithDigestChannel()).toEqual([
      { guildId, channelId: '12345', lastPosted: null }
    ]);
    container.guildSettingsService.setDigestLastPosted(guildId, '2026-07-31');
    expect(container.guildSettingsService.listGuildsWithDigestChannel()[0]!.lastPosted).toBe('2026-07-31');
  });
});

describe('digest streak scoping', () => {
  it('ranks only guild members and expresses timely streaks in approximate days', async () => {
    const { AppContainer } = await import('../app/container.js');
    const { describeTimelyStreak } = await import('../modules/digest/service.js');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dbPath = path.join(os.tmpdir(), `halal-economy-digest-scope-${Date.now()}.db`);
    const container = new AppContainer(dbPath);
    try {
      const guildId = '100000000000000001';
      const member = { discordUserId: '1', username: 'member' };
      const outsider = { discordUserId: '2', username: 'outsider' };
      container.identityRepo.trackGuildPresence(member.discordUserId, guildId);
      container.worshipService.claimTimely(member, 500, 1, {});
      container.worshipService.claimTimely(outsider, 500, 1, {});

      const digest = container.digestService.computeWeeklyDigest(guildId);
      expect(digest.topTimelyStreaks.map((s) => s.username)).toEqual(['member']);
      expect(container.worshipService.getStreakLeaderboard('timely', 10, guildId).map((r) => r.username)).toEqual(['member']);
      expect(container.worshipService.getStreakLeaderboard('timely', 10).length).toBe(2);

      expect(describeTimelyStreak(5, 1)).toBe('5 in a row');
      expect(describeTimelyStreak(893, 1)).toBe('893 in a row (~37 days)');
      expect(describeTimelyStreak(10, 12)).toBe('10 in a row (~5 days)');
    } finally {
      container.close();
      for (const suffix of ['', '-shm', '-wal']) {
        const c = `${dbPath}${suffix}`;
        if (fs.existsSync(c)) fs.unlinkSync(c);
      }
    }
  });
});
