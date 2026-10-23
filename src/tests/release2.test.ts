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
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
    }
  }
}

describe('release 2: timely reminders + vault privacy', () => {
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

  function timelyReadyRows(container: AppContainer): Array<{ next_attempt_at: number }> {
    return container.db.sqlite
      .prepare("SELECT next_attempt_at FROM notification_outbox WHERE event_type = 'timely_ready'")
      .all() as Array<{ next_attempt_at: number }>;
  }

  const guildId = '900100';
  const user = { discordUserId: '7001', username: 'reminderfan' };

  it('does NOT enqueue timely_ready without explicit opt-in', () => {
    const container = boot();
    const result = container.worshipService.claimTimely(user, 500, 12, {
      guildId,
      sourceChannelId: '555'
    });
    expect(result.ok).toBe(true);
    expect(timelyReadyRows(container)).toHaveLength(0);
  });

  it('enqueues a delayed timely_ready after user opt-in', () => {
    const container = boot();
    container.notificationsService.setUserOverride(guildId, user.discordUserId, 'timely_ready', 'dm_only');

    const before = Date.now();
    const result = container.worshipService.claimTimely(user, 500, 12, {
      guildId,
      sourceChannelId: '555'
    });
    expect(result.ok).toBe(true);

    const rows = timelyReadyRows(container);
    expect(rows).toHaveLength(1);
    // Delivery scheduled ~12h out, not immediate
    expect(rows[0]!.next_attempt_at).toBeGreaterThanOrEqual(before + 11 * 60 * 60 * 1000);
  });

  it('vaultPrivate defaults to false and can be enabled per guild', () => {
    const container = boot();
    expect(container.guildSettingsService.getEffectiveSettings(guildId).vaultPrivate).toBe(false);

    const set = container.guildSettingsService.setSetting(guildId, 'vaultPrivate', 'true');
    expect(set.ok).toBe(true);
    expect(container.guildSettingsService.getEffectiveSettings(guildId).vaultPrivate).toBe(true);
  });
});
