import { env } from '../../config/env.js';

const ALLOWED = new Set(env.ECONOMY_GUILD_IDS.map((id) => id.trim()).filter(Boolean));

/** True when currency may be earned in this guild. DMs (null) are decided by EconomyScopeService. */
export function isEconomyGuild(guildId: string | null | undefined): boolean {
  return typeof guildId === 'string' && ALLOWED.has(guildId);
}

export function economyGuildIds(): string[] {
  return [...ALLOWED];
}

export const EARN_DENIED_REASON = `Earning rewards is only available in ${env.HOME_GUILD_NAME}. Run this there (or in my DMs if you are a member) to claim.`;
