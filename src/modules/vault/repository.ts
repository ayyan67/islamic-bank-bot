import { Database } from '../../infra/db/database.js';

interface BalanceRow {
  balance: number;
}

export class VaultRepository {
  constructor(private readonly db: Database) {}

  getVaultBalance(userId: number): number {
    const row = this.db.sqlite
      .prepare('SELECT balance FROM vault_accounts WHERE user_id = ? LIMIT 1')
      .get(userId) as BalanceRow | undefined;

    return row?.balance ?? 0;
  }

  setVaultBalance(userId: number, amount: number): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO vault_accounts (user_id, balance, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id)
        DO UPDATE SET
          balance = excluded.balance,
          updated_at = CURRENT_TIMESTAMP
      `
      )
      .run(userId, amount);
  }

  deposit(userId: number, amount: number): { ok: boolean; reason?: string } {
    if (amount <= 0) {
      return { ok: false, reason: 'Deposit amount must be greater than zero.' };
    }

    return this.db.transaction(() => {
      const wallet = this.db.sqlite
        .prepare('SELECT balance FROM wallets WHERE user_id = ? LIMIT 1')
        .get(userId) as BalanceRow | undefined;

      if (!wallet || wallet.balance < amount) {
        return { ok: false, reason: 'Insufficient wallet balance.' };
      }

      this.db.sqlite
        .prepare('UPDATE wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(amount, userId);

      this.db.sqlite
        .prepare(
          `
          INSERT INTO vault_accounts (user_id, balance, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id)
          DO UPDATE SET
            balance = vault_accounts.balance + excluded.balance,
            updated_at = CURRENT_TIMESTAMP
        `
        )
        .run(userId, amount);

      return { ok: true };
    });
  }

  withdraw(userId: number, amount: number): { ok: boolean; reason?: string } {
    if (amount <= 0) {
      return { ok: false, reason: 'Withdraw amount must be greater than zero.' };
    }

    return this.db.transaction(() => {
      const vault = this.db.sqlite
        .prepare('SELECT balance FROM vault_accounts WHERE user_id = ? LIMIT 1')
        .get(userId) as BalanceRow | undefined;

      if (!vault || vault.balance < amount) {
        return { ok: false, reason: 'Insufficient vault balance.' };
      }

      this.db.sqlite
        .prepare('UPDATE vault_accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(amount, userId);

      this.db.sqlite
        .prepare('UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(amount, userId);

      return { ok: true };
    });
  }
}
