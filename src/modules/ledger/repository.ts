import { Database } from '../../infra/db/database.js';
import { TxKind } from '../../infra/db/types.js';
import { getCommandScope } from '../../infra/discord/commandScope.js';

export interface InsertTransactionInput {
  id?: number;
  userId: number;
  amount: number;
  kind: TxKind;
  subtype?: string | null;
  note?: string | null;
  otherUserId?: number | null;
  legacyType?: string | null;
  legacyExtra?: string | null;
  createdAt?: string;
  /** Defaults to the active command scope (see infra/discord/commandScope). */
  guildId?: string | null;
  channelId?: string | null;
}

export interface LedgerTransaction {
  id: number;
  userId: number;
  amount: number;
  kind: TxKind;
  subtype: string | null;
  note: string | null;
  otherUserId: number | null;
  legacyType: string | null;
  legacyExtra: string | null;
  createdAt: string;
}

interface TransactionRow {
  id: number;
  user_id: number;
  amount: number;
  kind: TxKind;
  subtype: string | null;
  note: string | null;
  other_user_id: number | null;
  legacy_type: string | null;
  legacy_extra: string | null;
  created_at: string;
}

export class LedgerRepository {
  constructor(private readonly db: Database) {}

  insertTransaction(input: InsertTransactionInput): number {
    const scope = getCommandScope();
    const result = this.db.sqlite
      .prepare(
        `
        INSERT INTO transactions (
          id,
          user_id,
          amount,
          kind,
          subtype,
          note,
          other_user_id,
          legacy_type,
          legacy_extra,
          created_at,
          guild_id,
          channel_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        input.id ?? null,
        input.userId,
        input.amount,
        input.kind,
        input.subtype ?? null,
        input.note ?? null,
        input.otherUserId ?? null,
        input.legacyType ?? null,
        input.legacyExtra ?? null,
        input.createdAt ?? new Date().toISOString(),
        input.guildId !== undefined ? input.guildId : (scope?.guildId ?? null),
        input.channelId !== undefined ? input.channelId : (scope?.channelId ?? null)
      );

    return Number(result.lastInsertRowid);
  }

  getRecentTransactionsByUserId(userId: number, page: number, pageSize: number): LedgerTransaction[] {
    const offset = Math.max(0, (page - 1) * pageSize);
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT id, user_id, amount, kind, subtype, note, other_user_id, legacy_type, legacy_extra, created_at
        FROM transactions
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(userId, pageSize, offset) as TransactionRow[];

    return rows.map((row) => this.mapRow(row));
  }

  getTransactionForUser(userId: number, transactionId: number): LedgerTransaction | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT id, user_id, amount, kind, subtype, note, other_user_id, legacy_type, legacy_extra, created_at
        FROM transactions
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `
      )
      .get(transactionId, userId) as TransactionRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  getLatestTransactionByKind(userId: number, kind: TxKind): LedgerTransaction | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT id, user_id, amount, kind, subtype, note, other_user_id, legacy_type, legacy_extra, created_at
        FROM transactions
        WHERE user_id = ? AND kind = ?
        ORDER BY id DESC
        LIMIT 1
      `
      )
      .get(userId, kind) as TransactionRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  getLatestTransactionByKindAndSubtype(
    userId: number,
    kind: TxKind,
    subtype: string
  ): LedgerTransaction | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT id, user_id, amount, kind, subtype, note, other_user_id, legacy_type, legacy_extra, created_at
        FROM transactions
        WHERE user_id = ? AND kind = ? AND subtype = ?
        ORDER BY id DESC
        LIMIT 1
      `
      )
      .get(userId, kind, subtype) as TransactionRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  deleteLatestTransactionByKind(userId: number, kind: TxKind): boolean {
    const row = this.db.sqlite
      .prepare(
        `SELECT id FROM transactions WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT 1`
      )
      .get(userId, kind) as { id: number } | undefined;

    if (!row) return false;

    this.db.sqlite.prepare(`DELETE FROM transactions WHERE id = ?`).run(row.id);
    return true;
  }

  deleteLatestTransactionByKindAndSubtype(userId: number, kind: TxKind, subtype: string): boolean {
    const row = this.db.sqlite
      .prepare(
        `SELECT id FROM transactions WHERE user_id = ? AND kind = ? AND subtype = ? ORDER BY id DESC LIMIT 1`
      )
      .get(userId, kind, subtype) as { id: number } | undefined;

    if (!row) return false;

    this.db.sqlite.prepare(`DELETE FROM transactions WHERE id = ?`).run(row.id);
    return true;
  }

  deleteAllTransactionsByKind(userId: number, kind: TxKind): number {
    const result = this.db.sqlite
      .prepare(`DELETE FROM transactions WHERE user_id = ? AND kind = ?`)
      .run(userId, kind);
    return result.changes;
  }

  deleteLatestTransactionByKindForAllUsers(kind: TxKind): number {
    const result = this.db.sqlite
      .prepare(
        `
        DELETE FROM transactions
        WHERE id IN (
          SELECT t.id FROM transactions t
          INNER JOIN (
            SELECT user_id, MAX(id) AS max_id
            FROM transactions
            WHERE kind = ?
            GROUP BY user_id
          ) latest ON t.id = latest.max_id
        )
      `
      )
      .run(kind);
    return result.changes;
  }

  private mapRow(row: TransactionRow): LedgerTransaction {
    return {
      id: row.id,
      userId: row.user_id,
      amount: row.amount,
      kind: row.kind,
      subtype: row.subtype,
      note: row.note,
      otherUserId: row.other_user_id,
      legacyType: row.legacy_type,
      legacyExtra: row.legacy_extra,
      createdAt: row.created_at
    };
  }
}
