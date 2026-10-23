import { Database } from '../../infra/db/database.js';
import type { DailyChallenge, ChallengeCompletion, ChallengeBan } from './types.js';

interface DailyChallengeRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  prompt_key: string;
  prompt_text: string;
  reward_amount: number;
  challenge_date: string;
  last_posted_at: string;
  status: string;
  created_at: string;
}

export class ChallengeRepository {
  constructor(private readonly db: Database) {}

  createChallenge(input: {
    guildId: string;
    channelId: string;
    messageId: string | null;
    promptKey: string;
    promptText: string;
    rewardAmount: number;
    challengeDate: string;
    lastPostedAt: string;
  }): number {
    const result = this.db.sqlite
      .prepare(
        `INSERT INTO daily_challenges
           (guild_id, channel_id, message_id, prompt_key, prompt_text, reward_amount, challenge_date, last_posted_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      )
      .run(
        input.guildId,
        input.channelId,
        input.messageId,
        input.promptKey,
        input.promptText,
        input.rewardAmount,
        input.challengeDate,
        input.lastPostedAt
      );
    return Number(result.lastInsertRowid);
  }

  getActiveChallenge(guildId: string): DailyChallenge | undefined {
    const row = this.db.sqlite
      .prepare(
        `SELECT id, guild_id, channel_id, message_id, prompt_key, prompt_text,
                reward_amount, challenge_date, last_posted_at, status, created_at
         FROM daily_challenges
         WHERE guild_id = ? AND status = 'active'
         ORDER BY id DESC LIMIT 1`
      )
      .get(guildId) as DailyChallengeRow | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  getActiveChallengeByChannel(channelId: string): DailyChallenge | undefined {
    const row = this.db.sqlite
      .prepare(
        `SELECT id, guild_id, channel_id, message_id, prompt_key, prompt_text,
                reward_amount, challenge_date, last_posted_at, status, created_at
         FROM daily_challenges
         WHERE channel_id = ? AND status = 'active'
         ORDER BY id DESC LIMIT 1`
      )
      .get(channelId) as DailyChallengeRow | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  updateMessageId(challengeId: number, messageId: string): void {
    this.db.sqlite
      .prepare('UPDATE daily_challenges SET message_id = ?, last_posted_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(messageId, challengeId);
  }

  updateLastPostedAt(challengeId: number, postedAt: string): void {
    this.db.sqlite
      .prepare('UPDATE daily_challenges SET last_posted_at = ? WHERE id = ?')
      .run(postedAt, challengeId);
  }

  expireChallenge(challengeId: number): void {
    this.db.sqlite
      .prepare("UPDATE daily_challenges SET status = 'expired' WHERE id = ?")
      .run(challengeId);
  }

  expireOldChallenges(guildId: string, exceptId: number): void {
    this.db.sqlite
      .prepare("UPDATE daily_challenges SET status = 'expired' WHERE guild_id = ? AND id != ? AND status = 'active'")
      .run(guildId, exceptId);
  }

  hasCompleted(challengeId: number, userId: number): boolean {
    const row = this.db.sqlite
      .prepare('SELECT 1 FROM daily_challenge_completions WHERE challenge_id = ? AND user_id = ? LIMIT 1')
      .get(challengeId, userId);
    return !!row;
  }

  createCompletion(challengeId: number, userId: number): ChallengeCompletion {
    const result = this.db.sqlite
      .prepare(
        `INSERT INTO daily_challenge_completions (challenge_id, user_id, completed_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`
      )
      .run(challengeId, userId);

    return {
      id: Number(result.lastInsertRowid),
      challengeId,
      userId,
      completedAt: new Date().toISOString()
    };
  }

  countCompletions(challengeId: number): number {
    const row = this.db.sqlite
      .prepare('SELECT COUNT(*) as cnt FROM daily_challenge_completions WHERE challenge_id = ?')
      .get(challengeId) as { cnt: number };
    return row.cnt;
  }

  // --- Ban methods ---

  banUser(guildId: string, userId: number, bannedByUserId: number, reason: string | null, expiresAt: string | null): void {
    this.db.sqlite
      .prepare(
        `INSERT INTO daily_challenge_bans (guild_id, user_id, banned_by_user_id, reason, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id) DO UPDATE SET
           banned_by_user_id = excluded.banned_by_user_id,
           reason = excluded.reason,
           expires_at = excluded.expires_at,
           created_at = CURRENT_TIMESTAMP`
      )
      .run(guildId, userId, bannedByUserId, reason, expiresAt);
  }

  unbanUser(guildId: string, userId: number): boolean {
    const result = this.db.sqlite
      .prepare('DELETE FROM daily_challenge_bans WHERE guild_id = ? AND user_id = ?')
      .run(guildId, userId);
    return result.changes > 0;
  }

  getActiveBan(guildId: string, userId: number): ChallengeBan | undefined {
    const row = this.db.sqlite
      .prepare(
        `SELECT id, guild_id, user_id, banned_by_user_id, reason, expires_at, created_at
         FROM daily_challenge_bans
         WHERE guild_id = ? AND user_id = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))
         LIMIT 1`
      )
      .get(guildId, userId) as any | undefined;
    return row ? this.mapBanRow(row) : undefined;
  }

  listBans(guildId: string): ChallengeBan[] {
    const rows = this.db.sqlite
      .prepare(
        `SELECT id, guild_id, user_id, banned_by_user_id, reason, expires_at, created_at
         FROM daily_challenge_bans
         WHERE guild_id = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))
         ORDER BY created_at DESC`
      )
      .all(guildId) as any[];
    return rows.map((r) => this.mapBanRow(r));
  }

  cleanExpiredBans(): number {
    const result = this.db.sqlite
      .prepare("DELETE FROM daily_challenge_bans WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')")
      .run();
    return result.changes;
  }

  private mapBanRow(row: any): ChallengeBan {
    return {
      id: row.id,
      guildId: row.guild_id,
      userId: row.user_id,
      bannedByUserId: row.banned_by_user_id,
      reason: row.reason,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    };
  }

  private mapRow(row: DailyChallengeRow): DailyChallenge {
    return {
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      messageId: row.message_id,
      promptKey: row.prompt_key,
      promptText: row.prompt_text,
      rewardAmount: row.reward_amount,
      challengeDate: row.challenge_date,
      lastPostedAt: row.last_posted_at,
      status: row.status as 'active' | 'expired',
      createdAt: row.created_at
    };
  }
}
