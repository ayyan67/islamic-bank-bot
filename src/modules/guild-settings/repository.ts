import type { Database } from '../../infra/db/database.js';
import { GUILD_SETTING_DEFS, type GuildSettingKey } from './types.js';

interface GuildSettingsRow {
  guild_id: string;
  timely_amount: number | null;
  timely_cooldown_hours: number | null;
  prayer_reward: number | null;
  prayer_cooldown_hours: number | null;
  prayer_all_five_bonus: number | null;
  trivia_max_score: number | null;
  trivia_delay_seconds: number | null;
  trivia_reward_per_correct: number | null;
  trivia_win_bonus: number | null;
  trivia_reveal_answer: number | null;
}

const COLUMNS = GUILD_SETTING_DEFS.map((d) => d.dbColumn);

export class GuildSettingsRepository {
  constructor(private readonly db: Database) {}

  getRawSettings(guildId: string): GuildSettingsRow | undefined {
    return this.db.sqlite
      .prepare(`SELECT guild_id, ${COLUMNS.join(', ')} FROM guild_settings WHERE guild_id = ?`)
      .get(guildId) as GuildSettingsRow | undefined;
  }

  setSetting(guildId: string, key: GuildSettingKey, value: number | null): void {
    const def = GUILD_SETTING_DEFS.find((d) => d.key === key);
    if (!def) return;

    const column = def.dbColumn;

    // Ensure the row exists
    this.db.sqlite
      .prepare(
        `INSERT INTO guild_settings (guild_id) VALUES (?)
         ON CONFLICT (guild_id) DO NOTHING`
      )
      .run(guildId);

    // Update the specific column
    this.db.sqlite
      .prepare(`UPDATE guild_settings SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`)
      .run(value, guildId);
  }

  resetAllSettings(guildId: string): boolean {
    const sets = COLUMNS.map((c) => `${c} = NULL`).join(', ');
    const result = this.db.sqlite
      .prepare(`UPDATE guild_settings SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`)
      .run(guildId);
    return result.changes > 0;
  }

  getChallengeChannelId(guildId: string): string | null {
    const row = this.db.sqlite
      .prepare('SELECT challenge_channel_id FROM guild_settings WHERE guild_id = ?')
      .get(guildId) as { challenge_channel_id: string | null } | undefined;
    return row?.challenge_channel_id ?? null;
  }

  setChallengeChannelId(guildId: string, channelId: string | null): void {
    this.db.sqlite
      .prepare(
        `INSERT INTO guild_settings (guild_id, challenge_channel_id) VALUES (?, ?)
         ON CONFLICT (guild_id) DO UPDATE SET challenge_channel_id = ?, updated_at = CURRENT_TIMESTAMP`
      )
      .run(guildId, channelId, channelId);
  }

  getDigestChannelId(guildId: string): string | null {
    const row = this.db.sqlite
      .prepare('SELECT digest_channel_id FROM guild_settings WHERE guild_id = ?')
      .get(guildId) as { digest_channel_id: string | null } | undefined;
    return row?.digest_channel_id ?? null;
  }

  setDigestChannelId(guildId: string, channelId: string | null): void {
    this.db.sqlite
      .prepare(
        `INSERT INTO guild_settings (guild_id, digest_channel_id) VALUES (?, ?)
         ON CONFLICT (guild_id) DO UPDATE SET digest_channel_id = ?, updated_at = CURRENT_TIMESTAMP`
      )
      .run(guildId, channelId, channelId);
  }

  listGuildsWithDigestChannel(): Array<{ guildId: string; channelId: string; lastPosted: string | null }> {
    const rows = this.db.sqlite
      .prepare(
        `SELECT guild_id, digest_channel_id, digest_last_posted FROM guild_settings
         WHERE digest_channel_id IS NOT NULL`
      )
      .all() as Array<{ guild_id: string; digest_channel_id: string; digest_last_posted: string | null }>;
    return rows.map((r) => ({
      guildId: r.guild_id,
      channelId: r.digest_channel_id,
      lastPosted: r.digest_last_posted
    }));
  }

  setDigestLastPosted(guildId: string, dateIso: string): void {
    this.db.sqlite
      .prepare('UPDATE guild_settings SET digest_last_posted = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?')
      .run(dateIso, guildId);
  }

  listGuildsWithChallengeChannel(): Array<{ guildId: string; channelId: string }> {
    const rows = this.db.sqlite
      .prepare(
        `SELECT guild_id, challenge_channel_id FROM guild_settings
         WHERE challenge_channel_id IS NOT NULL`
      )
      .all() as Array<{ guild_id: string; challenge_channel_id: string }>;
    return rows.map((r) => ({ guildId: r.guild_id, channelId: r.challenge_channel_id }));
  }
}
