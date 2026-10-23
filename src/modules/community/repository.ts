import { Database } from '../../infra/db/database.js';

interface TagRewardClaimRow {
  id: number;
  claimed_at: string;
  status: string;
  reward_amount: number;
}

export class CommunityRepository {
  constructor(private readonly db: Database) {}

  /** Get the most recent claim row (pending or claimed) for a user+guild. */
  getLatestTagRewardClaim(userId: number, guildId: string): TagRewardClaimRow | null {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT id, claimed_at, status, reward_amount
        FROM tag_reward_claims
        WHERE user_id = ? AND guild_id = ?
        ORDER BY id DESC
        LIMIT 1
      `
      )
      .get(userId, guildId) as TagRewardClaimRow | undefined;

    return row ?? null;
  }

  creditWallet(userId: number, amount: number): void {
    this.db.sqlite
      .prepare('UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
      .run(amount, userId);
  }

  insertTagRewardClaim(
    userId: number,
    guildId: string,
    claimedAt: string,
    rewardAmount: number,
    status: 'pending' | 'claimed'
  ): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO tag_reward_claims (user_id, guild_id, claimed_at, reward_amount, status)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(userId, guildId, claimedAt, rewardAmount, status);
  }

  updateClaimStatus(claimId: number, status: 'claimed', claimedAt: string): void {
    this.db.sqlite
      .prepare('UPDATE tag_reward_claims SET status = ?, claimed_at = ? WHERE id = ?')
      .run(status, claimedAt, claimId);
  }

  deleteClaim(claimId: number): void {
    this.db.sqlite.prepare('DELETE FROM tag_reward_claims WHERE id = ?').run(claimId);
  }
}
