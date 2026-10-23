import { Database } from '../../infra/db/database.js';

interface WalletBalanceRow {
  balance: number;
}

interface LeaderboardRow {
  discord_user_id: string;
  username: string | null;
  avatar_id: string | null;
  balance: number;
}

export class EconomyRepository {
  constructor(private readonly db: Database) {}

  getWalletBalance(userId: number): number {
    const row = this.db.sqlite
      .prepare('SELECT balance FROM wallets WHERE user_id = ? LIMIT 1')
      .get(userId) as WalletBalanceRow | undefined;

    return row?.balance ?? 0;
  }

  addWalletBalance(userId: number, amount: number): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO wallets (user_id, balance, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id)
        DO UPDATE SET
          balance = wallets.balance + excluded.balance,
          updated_at = CURRENT_TIMESTAMP
      `
      )
      .run(userId, amount);
  }

  setWalletBalance(userId: number, amount: number): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO wallets (user_id, balance, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id)
        DO UPDATE SET
          balance = excluded.balance,
          updated_at = CURRENT_TIMESTAMP
      `
      )
      .run(userId, amount);
  }

  subtractWalletBalance(userId: number, amount: number): boolean {
    const result = this.db.sqlite
      .prepare(
        `
        UPDATE wallets
        SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND balance >= ?
      `
      )
      .run(amount, userId, amount);

    return result.changes > 0;
  }

  transferBalance(fromUserId: number, toUserId: number, amount: number): boolean {
    return this.db.transaction(() => {
      const debit = this.db.sqlite
        .prepare(
          `
          UPDATE wallets
          SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
            AND balance >= ?
        `
        )
        .run(amount, fromUserId, amount);

      if (debit.changes === 0) {
        return false;
      }

      this.db.sqlite
        .prepare(
          `
          INSERT INTO wallets (user_id, balance, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id)
          DO UPDATE SET
            balance = wallets.balance + excluded.balance,
            updated_at = CURRENT_TIMESTAMP
        `
        )
        .run(toUserId, amount);

      return true;
    });
  }

  getLeaderboard(
    page: number,
    pageSize: number,
    guildId?: string,
    excludeDiscordUserId?: string
  ): LeaderboardRow[] {
    const offset = Math.max(0, (page - 1) * pageSize);
    const exclude = excludeDiscordUserId ?? '';

    if (guildId) {
      return this.db.sqlite
        .prepare(
          `
          SELECT u.discord_user_id, u.username, u.avatar_id, w.balance
          FROM wallets w
          INNER JOIN users u ON u.id = w.user_id
          INNER JOIN user_guilds ug ON ug.discord_user_id = u.discord_user_id AND ug.guild_id = ?
          WHERE u.discord_user_id <> ?
          ORDER BY w.balance DESC, u.id ASC
          LIMIT ? OFFSET ?
        `
        )
        .all(guildId, exclude, pageSize, offset) as LeaderboardRow[];
    }

    return this.db.sqlite
      .prepare(
        `
        SELECT u.discord_user_id, u.username, u.avatar_id, w.balance
        FROM wallets w
        INNER JOIN users u ON u.id = w.user_id
        WHERE u.discord_user_id <> ?
        ORDER BY w.balance DESC, u.id ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(exclude, pageSize, offset) as LeaderboardRow[];
  }

  getUserIdByDiscordId(discordUserId: string): number | undefined {
    const row = this.db.sqlite
      .prepare('SELECT id FROM users WHERE discord_user_id = ? LIMIT 1')
      .get(discordUserId) as { id: number } | undefined;

    return row?.id;
  }
}
