import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-identity-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
    }
  }
}

describe('IdentityRepository.syncGuildMembers', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];

  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  function openContainer(): AppContainer {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });
    return container;
  }

  it('replaces stale guild presence rows with the live member set', () => {
    const container = openContainer();
    const guildId = 'guild-1';

    const valid = { discordUserId: 'valid-1', username: 'valid-1' };
    const ghost = { discordUserId: 'ghost-1', username: 'ghost-1' };

    container.economyService.creditUser(valid, 500, 'claim_timely', 'seed');
    container.economyService.creditUser(ghost, 400, 'claim_timely', 'seed');

    container.identityRepo.trackGuildPresence(valid.discordUserId, guildId);
    container.identityRepo.trackGuildPresence(ghost.discordUserId, guildId);

    container.identityRepo.syncGuildMembers(guildId, new Set([valid.discordUserId]));

    const rows = container.economyService.getLeaderboard(1, 10, guildId);
    expect(rows.map((row) => row.discordUserId)).toEqual([valid.discordUserId]);

    const userGuildRows = container.db.sqlite
      .prepare('SELECT discord_user_id FROM user_guilds WHERE guild_id = ? ORDER BY discord_user_id ASC')
      .all(guildId) as Array<{ discord_user_id: string }>;

    expect(userGuildRows).toEqual([{ discord_user_id: valid.discordUserId }]);
  });
});
