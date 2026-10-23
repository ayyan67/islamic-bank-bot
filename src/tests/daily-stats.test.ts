import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';
import { getCommandScope, installCommandScope, runInCommandScope } from '../infra/discord/commandScope.js';
import { GLOBAL_GUILD } from '../modules/stats/types.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-daily-stats-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}
function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const c = `${dbPath}${suffix}`;
    if (fs.existsSync(c)) fs.unlinkSync(c);
  }
}

describe('command scope', () => {
  it('survives awaits and is stamped onto ledger rows', async () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    try {
      await runInCommandScope({ guildId: 'g1', channelId: 'c1' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        expect(getCommandScope()).toEqual({ guildId: 'g1', channelId: 'c1' });
        container.worshipService.claimTimely({ discordUserId: '1', username: 'alice' }, 500, 1, {});
      });
      const row = container.db.sqlite.prepare("SELECT guild_id, channel_id FROM transactions WHERE kind='claim_timely' LIMIT 1").get() as any;
      expect(row).toEqual({ guild_id: 'g1', channel_id: 'c1' });

      // Outside any scope: nulls, never a crash.
      container.worshipService.claimTimely({ discordUserId: '2', username: 'bob' }, 500, 1, {});
      const rows = container.db.sqlite.prepare("SELECT guild_id FROM transactions WHERE kind='claim_timely' AND subtype='timely' ORDER BY id").all() as any[];
      expect(rows.map((r) => r.guild_id)).toEqual(['g1', null]);
    } finally {
      container.close();
      removeDbFiles(dbPath);
    }
  });

  it('wraps Seyfert dispatch entry points with the raw payload ids', async () => {
    const seen: unknown[] = [];
    const fakeClient = {
      handleCommand: {
        interaction: async (body: unknown) => {
          void body;
          seen.push(getCommandScope());
        },
        message: async (msg: unknown) => {
          void msg;
          seen.push(getCommandScope());
        }
      }
    };
    installCommandScope(fakeClient);
    await fakeClient.handleCommand.interaction({ guild_id: 'g9', channel_id: 'c9' });
    await fakeClient.handleCommand.message({ guild_id: 'g8', channel_id: 'c8' });
    await fakeClient.handleCommand.message({ channel_id: 'dm' });
    expect(seen).toEqual([
      { guildId: 'g9', channelId: 'c9' },
      { guildId: 'g8', channelId: 'c8' },
      { guildId: null, channelId: 'dm' }
    ]);
  });
});

describe('daily stats snapshots', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];
  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  it('computes global and per-guild metrics for a day', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });
    const today = new Date().toISOString().slice(0, 10);

    runInCommandScope({ guildId: 'g1', channelId: 'c1' }, () => {
      container.worshipService.claimTimely({ discordUserId: '1', username: 'alice' }, 500, 1, {});
      container.worshipService.claimTimely({ discordUserId: '2', username: 'bob' }, 500, 1, {});
      container.economyService.transfer({ discordUserId: '1', username: 'alice' }, { discordUserId: '2', username: 'bob' }, 100);
    });
    runInCommandScope({ guildId: 'g2', channelId: 'c2' }, () => {
      container.worshipService.claimTimely({ discordUserId: '3', username: 'carol' }, 500, 1, {});
    });

    const written = container.statsService.computeDay(today, { withSupply: true });
    expect(written).toBe(3); // global + g1 + g2

    const g = (metric: any, guild = GLOBAL_GUILD) => container.statsService.getSeries(metric, 1, guild)[0]?.value;
    expect(g('active_users')).toBe(3);
    expect(g('timely_claims')).toBe(3);
    expect(g('minted')).toBeGreaterThanOrEqual(1500);
    expect(g('transfers_count')).toBe(1);
    expect(g('transfers_volume')).toBe(100);
    expect(g('supply_wallets')).toBeGreaterThanOrEqual(1500);
    expect(g('top10_share')).toBe(1);

    expect(g('active_users', 'g1')).toBe(2);
    expect(g('timely_claims', 'g1')).toBe(2);
    expect(g('active_users', 'g2')).toBe(1);
    expect(g('supply_wallets', 'g1')).toBeUndefined(); // global-only metric
  });

  it('runDue backfills up to yesterday and is idempotent', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const first = container.statsService.runDue(new Date());
    expect(first.computed).toBe(30);
    const second = container.statsService.runDue(new Date());
    expect(second.computed).toBe(0);
    expect(container.statsService.getSeries('active_users', 60)).toHaveLength(30);
  });
});
