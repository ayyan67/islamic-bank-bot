import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';
import { env } from '../config/env.js';
import { isEconomyGuild } from '../modules/economy-scope/scope.js';

const HOME = env.ECONOMY_GUILD_IDS[0]!;
const OTHER = '999999999999999999';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-scope-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}
function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const c = `${dbPath}${suffix}`;
    if (fs.existsSync(c)) fs.unlinkSync(c);
  }
}

describe('economy scope', () => {
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

  it('only the configured home guild(s) count as economy guilds', () => {
    expect(isEconomyGuild(HOME)).toBe(true);
    expect(isEconomyGuild(OTHER)).toBe(false);
    expect(isEconomyGuild(null)).toBe(false);
    expect(isEconomyGuild(undefined)).toBe(false);
  });

  it('canEarn: home guild yes, other guild no, DMs only for home-guild members', () => {
    const app = boot();
    expect(app.economyScope.canEarn({ guildId: HOME, discordUserId: 'u1' })).toEqual({ ok: true });
    expect(app.economyScope.canEarn({ guildId: OTHER, discordUserId: 'u1' }).ok).toBe(false);
    expect(app.economyScope.canEarn({ guildId: null, discordUserId: 'u1' }).ok).toBe(false);

    app.identityRepo.trackGuildPresence('u1', HOME);
    expect(app.economyScope.canEarn({ guildId: null, discordUserId: 'u1' })).toEqual({ ok: true });

    app.identityRepo.trackGuildPresence('u2', OTHER);
    const denied = app.economyScope.canEarn({ guildId: null, discordUserId: 'u2' });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toContain(env.HOME_GUILD_NAME);
  });

  it('economy overrides are ignored and rejected outside the home guild', () => {
    const app = boot();
    const svc = app.guildSettingsService;

    // Other guild: cannot set, and any pre-existing override is ignored.
    const set = svc.setSetting(OTHER, 'timelyAmount', '1000000');
    expect(set.ok).toBe(false);
    app.guildSettingsRepo.setSetting(OTHER, 'timelyAmount', 1_000_000);
    app.guildSettingsRepo.setSetting(OTHER, 'timelyCooldownHours', 0);
    const other = svc.getEffectiveSettings(OTHER);
    expect(other.timelyAmount).toBe(env.TIMELY_AMOUNT);
    expect(other.timelyCooldownHours).toBe(env.TIMELY_COOLDOWN_HOURS);

    // Non-economy settings still work anywhere.
    expect(svc.setSetting(OTHER, 'vaultPrivate', 'true').ok).toBe(true);
    expect(svc.getEffectiveSettings(OTHER).vaultPrivate).toBe(true);

    // Home guild: overrides apply.
    expect(svc.setSetting(HOME, 'timelyAmount', '750').ok).toBe(true);
    expect(svc.getEffectiveSettings(HOME).timelyAmount).toBe(750);
  });
});
