import { Database } from '../../infra/db/database.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { WorshipRepository } from '../worship/repository.js';
import type { GuildSettingsService } from '../guild-settings/service.js';

/** Ledger kinds that represent genuinely earned currency (not moves/spends). */
const EARN_KINDS = [
  'claim_timely',
  'claim_prayer',
  'claim_tag_reward',
  'claim_trivia',
  'claim_eid',
  'drop_pick',
  'task_bounty_payout',
  'challenge_reward'
] as const;

export interface WeeklyDigest {
  weekStartIso: string;
  topEarners: Array<{ discordUserId: string; username: string; earned: number }>;
  biggestTransfer: { fromUsername: string; toUsername: string; amount: number } | null;
  prayerCheckins: number;
  activeUsers: number;
  totalEarned: number;
  topTimelyStreaks: Array<{ username: string; count: number }>;
  topPrayerStreaks: Array<{ username: string; count: number }>;
  /** Guild timely cooldown, used to express claim streaks as approximate days. */
  timelyCooldownHours: number;
}

/** "893 in a row" means little on its own; add the span it represents (count × cooldown). */
export function describeTimelyStreak(count: number, cooldownHours: number): string {
  const hours = count * Math.max(cooldownHours, 0);
  if (hours < 48) return `${count} in a row`;
  return `${count} in a row (~${Math.round(hours / 24)} days)`;
}

const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

export function buildDigestEmbed(digest: WeeklyDigest): { embeds: any[] } {
  const earnerLines =
    digest.topEarners.length > 0
      ? digest.topEarners
          .map((e, i) => `${RANK_EMOJIS[i] ?? '•'} **${e.username}** — ${formatCurrency(e.earned)}`)
          .join('\n')
      : '_No activity this week_';

  const streakLines = [
    ...digest.topTimelyStreaks
      .slice(0, 3)
      .map((s) => `🔥 **${s.username}** — timely streak: ${describeTimelyStreak(s.count, digest.timelyCooldownHours)}`),
    ...digest.topPrayerStreaks.slice(0, 3).map((s) => `🕌 **${s.username}** — ${s.count}-day prayer streak`)
  ];

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: '💰 Top Earners', value: earnerLines, inline: false }
  ];

  if (digest.biggestTransfer) {
    fields.push({
      name: '💸 Biggest Transfer',
      value: `**${digest.biggestTransfer.fromUsername}** → **${digest.biggestTransfer.toUsername}** (${formatCurrency(digest.biggestTransfer.amount)})`,
      inline: false
    });
  }

  if (streakLines.length > 0) {
    fields.push({ name: '🔥 Streak Leaders', value: streakLines.join('\n'), inline: false });
  }

  fields.push({
    name: '📊 This Week',
    value: `${digest.activeUsers} active member${digest.activeUsers === 1 ? '' : 's'} · ${formatCurrency(digest.totalEarned)} earned · ${digest.prayerCheckins} prayer check-in${digest.prayerCheckins === 1 ? '' : 's'}`,
    inline: false
  });

  return {
    embeds: [
      {
        title: '📰 Weekly Community Digest',
        color: 0x0d9488,
        fields,
        footer: { text: 'Every Friday · configure with /digest set-channel' },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

export class DigestService {
  constructor(
    private readonly db: Database,
    private readonly worshipRepo: WorshipRepository,
    private readonly guildSettings: GuildSettingsService
  ) {}

  computeWeeklyDigest(guildId: string, now = new Date()): WeeklyDigest {
    const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const earnPlaceholders = EARN_KINDS.map(() => '?').join(', ');

    const topEarners = this.db.sqlite
      .prepare(
        `SELECT u.discord_user_id, u.username, SUM(t.amount) AS earned
         FROM transactions t
         INNER JOIN users u ON u.id = t.user_id
         INNER JOIN user_guilds ug ON ug.discord_user_id = u.discord_user_id AND ug.guild_id = ?
         WHERE t.created_at >= ? AND t.amount > 0 AND t.kind IN (${earnPlaceholders})
         GROUP BY t.user_id
         ORDER BY earned DESC
         LIMIT 3`
      )
      .all(guildId, weekStart, ...EARN_KINDS) as Array<{
      discord_user_id: string;
      username: string | null;
      earned: number;
    }>;

    const transferRow = this.db.sqlite
      .prepare(
        `SELECT t.amount, u.username AS to_username, ou.username AS from_username
         FROM transactions t
         INNER JOIN users u ON u.id = t.user_id
         LEFT JOIN users ou ON ou.id = t.other_user_id
         INNER JOIN user_guilds ug ON ug.discord_user_id = u.discord_user_id AND ug.guild_id = ?
         WHERE t.created_at >= ? AND t.kind = 'transfer' AND t.subtype = 'received'
         ORDER BY t.amount DESC
         LIMIT 1`
      )
      .get(guildId, weekStart) as
      | { amount: number; to_username: string | null; from_username: string | null }
      | undefined;

    const prayerCheckins = (
      this.db.sqlite
        .prepare(
          `SELECT COUNT(*) AS n
           FROM prayer_checkins pc
           INNER JOIN users u ON u.id = pc.user_id
           INNER JOIN user_guilds ug ON ug.discord_user_id = u.discord_user_id AND ug.guild_id = ?
           WHERE pc.checked_in_at >= ?`
        )
        .get(guildId, weekStart) as { n: number }
    ).n;

    const activity = this.db.sqlite
      .prepare(
        `SELECT COUNT(DISTINCT t.user_id) AS users, COALESCE(SUM(CASE WHEN t.amount > 0 AND t.kind IN (${earnPlaceholders}) THEN t.amount ELSE 0 END), 0) AS earned
         FROM transactions t
         INNER JOIN users u ON u.id = t.user_id
         INNER JOIN user_guilds ug ON ug.discord_user_id = u.discord_user_id AND ug.guild_id = ?
         WHERE t.created_at >= ?`
      )
      .get(...EARN_KINDS, guildId, weekStart) as { users: number; earned: number };

    const topTimely = this.worshipRepo.topStreaks('timely', 3, now, guildId);
    const topPrayer = this.worshipRepo.topStreaks('prayer', 3, now, guildId);
    const timelyCooldownHours = this.guildSettings.getEffectiveSettings(guildId).timelyCooldownHours;

    return {
      weekStartIso: weekStart,
      topEarners: topEarners.map((r) => ({
        discordUserId: r.discord_user_id,
        username: r.username ?? 'Unknown',
        earned: r.earned
      })),
      biggestTransfer: transferRow
        ? {
            fromUsername: transferRow.from_username ?? 'Unknown',
            toUsername: transferRow.to_username ?? 'Unknown',
            amount: transferRow.amount
          }
        : null,
      prayerCheckins,
      activeUsers: activity.users,
      totalEarned: activity.earned,
      topTimelyStreaks: topTimely.map((r) => ({ username: r.username ?? 'Unknown', count: r.count })),
      topPrayerStreaks: topPrayer.map((r) => ({ username: r.username ?? 'Unknown', count: r.count })),
      timelyCooldownHours
    };
  }
}
