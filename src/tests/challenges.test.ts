import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';
import { env } from '../config/env.js';

// Challenges only pay out in economy guilds, so every test runs in the home guild (fresh DB per test).
const HOME_GUILD = env.ECONOMY_GUILD_IDS[0]!;

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-challenge-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
    }
  }
}

describe('challenge service', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];

  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  it('creates a challenge and rewards on completion', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = HOME_GUILD;
    const channelId = 'channel-1';
    const user = { discordUserId: '80001', username: 'reciter' };

    // Set up challenge channel
    container.guildSettingsService.setChallengeChannelId(guildId, channelId);

    // Seed user with some balance
    container.economyService.creditUser(user, 500, 'claim_timely', 'seed');

    // Create a challenge directly via repo
    const challengeId = container.challengeRepo.createChallenge({
      guildId,
      channelId,
      messageId: null,
      promptKey: 'fatiha',
      promptText: '**Recite Surah Al-Fatiha**',
      rewardAmount: 1000,
      challengeDate: new Date().toISOString().slice(0, 10),
      lastPostedAt: new Date().toISOString()
    });

    expect(challengeId).toBeGreaterThan(0);

    // Complete the challenge
    const result = container.challengeService.completeChallenge(user, channelId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rewardAmount).toBe(1000);
      expect(result.completionCount).toBe(1);
    }

    // Balance should increase
    expect(container.economyService.getBalance(user)).toBe(1500);

    // Ledger entry should exist
    const recent = container.ledgerService.getRecentTransactionsByDiscordId(user.discordUserId, 1, 5);
    const challengeTx = recent.find((tx) => tx.kind === 'challenge_reward');
    expect(challengeTx?.amount).toBe(1000);
  });

  it('prevents double completion', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = HOME_GUILD;
    const channelId = 'channel-2';
    const user = { discordUserId: '80002', username: 'reciter2' };

    container.guildSettingsService.setChallengeChannelId(guildId, channelId);
    container.economyService.creditUser(user, 500, 'claim_timely', 'seed');

    container.challengeRepo.createChallenge({
      guildId,
      channelId,
      messageId: null,
      promptKey: 'ikhlas',
      promptText: '**Recite Surah Al-Ikhlas**',
      rewardAmount: 1000,
      challengeDate: new Date().toISOString().slice(0, 10),
      lastPostedAt: new Date().toISOString()
    });

    // First completion succeeds
    const first = container.challengeService.completeChallenge(user, channelId);
    expect(first.ok).toBe(true);

    // Second attempt fails silently
    const second = container.challengeService.completeChallenge(user, channelId);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('already_completed');
    }

    // Balance only increased once
    expect(container.economyService.getBalance(user)).toBe(1500);
  });

  it('allows multiple users to complete the same challenge', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = HOME_GUILD;
    const channelId = 'channel-3';
    const user1 = { discordUserId: '80003', username: 'reciter3' };
    const user2 = { discordUserId: '80004', username: 'reciter4' };

    container.guildSettingsService.setChallengeChannelId(guildId, channelId);
    container.economyService.creditUser(user1, 0, 'claim_timely', 'seed');
    container.economyService.creditUser(user2, 0, 'claim_timely', 'seed');

    container.challengeRepo.createChallenge({
      guildId,
      channelId,
      messageId: null,
      promptKey: 'nas',
      promptText: '**Recite Surah An-Nas**',
      rewardAmount: 1000,
      challengeDate: new Date().toISOString().slice(0, 10),
      lastPostedAt: new Date().toISOString()
    });

    const r1 = container.challengeService.completeChallenge(user1, channelId);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.completionCount).toBe(1);

    const r2 = container.challengeService.completeChallenge(user2, channelId);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.completionCount).toBe(2);

    expect(container.economyService.getBalance(user1)).toBe(1000);
    expect(container.economyService.getBalance(user2)).toBe(1000);
  });

  it('returns no challenge when channel has no active challenge', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const user = { discordUserId: '80005', username: 'reciter5' };
    const result = container.challengeService.completeChallenge(user, 'no-challenge-channel');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('No active challenge');
    }
  });

  it('getGuildsNeedingPost creates a new challenge for configured guilds', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = HOME_GUILD;
    const channelId = 'channel-5';

    container.guildSettingsService.setChallengeChannelId(guildId, channelId);

    const needed = container.challengeService.getGuildsNeedingPost();
    expect(needed.length).toBe(1);
    expect(needed[0]!.guildId).toBe(guildId);
    expect(needed[0]!.channelId).toBe(channelId);
    expect(needed[0]!.isNew).toBe(true);
    expect(needed[0]!.challenge.rewardAmount).toBe(1000);
    expect(needed[0]!.challenge.status).toBe('active');
  });

  it('uses guild-configured reward amount', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = HOME_GUILD;
    const channelId = 'channel-6';

    container.guildSettingsService.setChallengeChannelId(guildId, channelId);
    container.guildSettingsService.setSetting(guildId, 'challengeReward', '2500');

    const needed = container.challengeService.getGuildsNeedingPost();
    expect(needed.length).toBe(1);
    expect(needed[0]!.challenge.rewardAmount).toBe(2500);
  });

  it('does not repost if less than 3 hours since last post', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = HOME_GUILD;
    const channelId = 'channel-7';

    container.guildSettingsService.setChallengeChannelId(guildId, channelId);

    // First call creates the challenge
    const first = container.challengeService.getGuildsNeedingPost();
    expect(first.length).toBe(1);

    // Second call should not repost (too soon)
    const second = container.challengeService.getGuildsNeedingPost();
    expect(second.length).toBe(0);
  });
});
