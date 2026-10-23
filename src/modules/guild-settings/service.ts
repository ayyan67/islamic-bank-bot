import { env } from '../../config/env.js';
import { GuildSettingsRepository } from './repository.js';
import { GUILD_SETTING_DEFS, type GuildSettingKey, type GuildSettingMeta, type GuildSettings } from './types.js';
import { isEconomyGuild } from '../economy-scope/scope.js';

/** Overrides that change how much currency is minted. Ignored outside economy guilds. */
export const ECONOMY_SETTING_KEYS: ReadonlySet<GuildSettingKey> = new Set<GuildSettingKey>([
  'timelyAmount',
  'timelyCooldownHours',
  'prayerReward',
  'prayerCooldownHours',
  'prayerAllFiveBonus',
  'triviaRewardPerCorrect',
  'triviaWinBonus',
  'challengeReward'
]);

function envDefault(key: GuildSettingKey): number | boolean {
  switch (key) {
    case 'timelyAmount':
      return env.TIMELY_AMOUNT;
    case 'timelyCooldownHours':
      return env.TIMELY_COOLDOWN_HOURS;
    case 'prayerReward':
      return env.PRAYER_REWARD;
    case 'prayerCooldownHours':
      return env.PRAYER_COOLDOWN_HOURS;
    case 'prayerAllFiveBonus':
      return env.PRAYER_ALL_FIVE_BONUS;
    case 'triviaMaxScore':
      return env.TRIVIA_MAX_SCORE;
    case 'triviaDelaySeconds':
      return env.TRIVIA_DELAY_SECONDS;
    case 'triviaRewardPerCorrect':
      return env.TRIVIA_REWARD_PER_CORRECT;
    case 'triviaWinBonus':
      return env.TRIVIA_WIN_BONUS;
    case 'triviaRevealAnswer':
      return env.TRIVIA_REVEAL_ANSWER;
    case 'triviaRequireMultiplePlayers':
      return env.TRIVIA_REQUIRE_MULTIPLE_PLAYERS;
    case 'challengeReward':
      return 1000;
    case 'vaultPrivate':
      return false;
    case 'dropDeleteCommand':
      return true;
  }
}

export class GuildSettingsService {
  constructor(private readonly repo: GuildSettingsRepository) {}

  getEffectiveSettings(guildId: string | null | undefined): GuildSettings {
    const defaults: GuildSettings = {
      guildId: guildId ?? '',
      timelyAmount: env.TIMELY_AMOUNT,
      timelyCooldownHours: env.TIMELY_COOLDOWN_HOURS,
      prayerReward: env.PRAYER_REWARD,
      prayerCooldownHours: env.PRAYER_COOLDOWN_HOURS,
      prayerAllFiveBonus: env.PRAYER_ALL_FIVE_BONUS,
      triviaMaxScore: env.TRIVIA_MAX_SCORE,
      triviaDelaySeconds: env.TRIVIA_DELAY_SECONDS,
      triviaRewardPerCorrect: env.TRIVIA_REWARD_PER_CORRECT,
      triviaWinBonus: env.TRIVIA_WIN_BONUS,
      triviaRevealAnswer: env.TRIVIA_REVEAL_ANSWER,
      triviaRequireMultiplePlayers: env.TRIVIA_REQUIRE_MULTIPLE_PLAYERS,
      challengeReward: 1000,
      vaultPrivate: false,
      dropDeleteCommand: true
    };

    if (!guildId) return defaults;

    const row = this.repo.getRawSettings(guildId);
    if (!row) return defaults;

    const economyGuild = isEconomyGuild(guildId);
    for (const def of GUILD_SETTING_DEFS) {
      if (!economyGuild && ECONOMY_SETTING_KEYS.has(def.key)) continue;
      const dbValue = (row as unknown as Record<string, unknown>)[def.dbColumn];
      if (dbValue == null) continue;

      if (def.type === 'boolean') {
        (defaults as unknown as Record<string, unknown>)[def.key] = dbValue !== 0;
      } else {
        (defaults as unknown as Record<string, unknown>)[def.key] = Number(dbValue);
      }
    }

    return defaults;
  }

  setSetting(
    guildId: string,
    key: string,
    rawValue: string
  ): { ok: true; key: GuildSettingKey; value: number | boolean } | { ok: false; reason: string } {
    const def = GUILD_SETTING_DEFS.find((d) => d.key === key);
    if (!def) {
      const validKeys = GUILD_SETTING_DEFS.map((d) => d.key).join(', ');
      return { ok: false, reason: `Unknown setting key. Valid keys: ${validKeys}` };
    }
    if (ECONOMY_SETTING_KEYS.has(def.key) && !isEconomyGuild(guildId)) {
      return { ok: false, reason: `${def.label} can only be changed in ${env.HOME_GUILD_NAME}, the home server where rewards are earned.` };
    }

    if (def.type === 'boolean') {
      const lower = rawValue.toLowerCase();
      if (lower !== 'true' && lower !== 'false' && lower !== '1' && lower !== '0') {
        return { ok: false, reason: `${def.label} must be true or false.` };
      }
      const boolVal = lower === 'true' || lower === '1';
      this.repo.setSetting(guildId, def.key, boolVal ? 1 : 0);
      return { ok: true, key: def.key, value: boolVal };
    }

    const numVal = Number(rawValue);
    if (!Number.isInteger(numVal)) {
      return { ok: false, reason: `${def.label} must be a whole number.` };
    }
    if (def.min != null && numVal < def.min) {
      return { ok: false, reason: `${def.label} minimum is ${def.min}.` };
    }
    if (def.max != null && numVal > def.max) {
      return { ok: false, reason: `${def.label} maximum is ${def.max}.` };
    }

    this.repo.setSetting(guildId, def.key, numVal);
    return { ok: true, key: def.key, value: numVal };
  }

  resetSetting(guildId: string, key: string): { ok: true; key: GuildSettingKey } | { ok: false; reason: string } {
    const def = GUILD_SETTING_DEFS.find((d) => d.key === key);
    if (!def) {
      return { ok: false, reason: 'Unknown setting key.' };
    }
    this.repo.setSetting(guildId, def.key, null);
    return { ok: true, key: def.key };
  }

  resetAllSettings(guildId: string): boolean {
    return this.repo.resetAllSettings(guildId);
  }

  getSettingDefs(): readonly GuildSettingMeta[] {
    return GUILD_SETTING_DEFS;
  }

  getChallengeChannelId(guildId: string): string | null {
    return this.repo.getChallengeChannelId(guildId);
  }

  setChallengeChannelId(guildId: string, channelId: string | null): void {
    this.repo.setChallengeChannelId(guildId, channelId);
  }

  listGuildsWithChallengeChannel(): Array<{ guildId: string; channelId: string }> {
    return this.repo.listGuildsWithChallengeChannel();
  }

  getDigestChannelId(guildId: string): string | null {
    return this.repo.getDigestChannelId(guildId);
  }

  setDigestChannelId(guildId: string, channelId: string | null): void {
    this.repo.setDigestChannelId(guildId, channelId);
  }

  listGuildsWithDigestChannel(): Array<{ guildId: string; channelId: string; lastPosted: string | null }> {
    return this.repo.listGuildsWithDigestChannel();
  }

  setDigestLastPosted(guildId: string, dateIso: string): void {
    this.repo.setDigestLastPosted(guildId, dateIso);
  }

  getOverrides(guildId: string): Array<{ key: GuildSettingKey; label: string; value: number | boolean; defaultValue: number | boolean }> {
    const row = this.repo.getRawSettings(guildId);
    if (!row) return [];

    const overrides: Array<{ key: GuildSettingKey; label: string; value: number | boolean; defaultValue: number | boolean }> = [];
    for (const def of GUILD_SETTING_DEFS) {
      const dbValue = (row as unknown as Record<string, unknown>)[def.dbColumn];
      if (dbValue == null) continue;
      const value = def.type === 'boolean' ? dbValue !== 0 : Number(dbValue);
      overrides.push({ key: def.key, label: def.label, value, defaultValue: envDefault(def.key) });
    }
    return overrides;
  }
}
