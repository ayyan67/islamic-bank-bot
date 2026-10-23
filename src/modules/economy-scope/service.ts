import type { Database } from '../../infra/db/database.js';
import { EARN_DENIED_REASON, economyGuildIds, isEconomyGuild } from './scope.js';

export interface EarnContext {
  guildId: string | null | undefined;
  discordUserId: string;
}

/**
 * Decides whether a user may earn currency right now.
 * - In an allowlisted guild: yes.
 * - In DMs: yes only if the user is a known member of an allowlisted guild
 *   (user_guilds is refreshed on startup and on every command they run there).
 * - Anywhere else: no.
 */
export class EconomyScopeService {
  constructor(private readonly db: Database) {}

  isEconomyGuild(guildId: string | null | undefined): boolean {
    return isEconomyGuild(guildId);
  }

  canEarn(ctx: EarnContext): { ok: true } | { ok: false; reason: string } {
    if (isEconomyGuild(ctx.guildId)) return { ok: true };
    if (ctx.guildId == null && this.isMemberOfEconomyGuild(ctx.discordUserId)) return { ok: true };
    return { ok: false, reason: EARN_DENIED_REASON };
  }

  isMemberOfEconomyGuild(discordUserId: string): boolean {
    const ids = economyGuildIds();
    if (ids.length === 0) return false;
    const placeholders = ids.map(() => '?').join(',');
    const row = this.db.sqlite
      .prepare(`SELECT 1 AS x FROM user_guilds WHERE discord_user_id = ? AND guild_id IN (${placeholders}) LIMIT 1`)
      .get(discordUserId, ...ids) as { x: number } | undefined;
    return Boolean(row);
  }
}
