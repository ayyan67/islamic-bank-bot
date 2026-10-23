import { Database } from '../../infra/db/database.js';
import { ReminderRow } from './types.js';

export class ReminderRepository {
  constructor(private readonly db: Database) {}

  create(
    userId: number,
    discordUserId: string,
    channelId: string,
    guildId: string | null,
    remindAt: number,
    message: string
  ): number {
    const result = this.db.sqlite
      .prepare(
        `INSERT INTO reminders (user_id, discord_user_id, channel_id, guild_id, remind_at, message)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(userId, discordUserId, channelId, guildId, remindAt, message);
    return Number(result.lastInsertRowid);
  }

  getDue(nowMs: number): ReminderRow[] {
    return this.db.sqlite
      .prepare(`SELECT * FROM reminders WHERE remind_at <= ? ORDER BY remind_at ASC`)
      .all(nowMs) as ReminderRow[];
  }

  claimDue(nowMs: number, limit: number, staleProcessingMs: number): ReminderRow[] {
    return this.db.transaction(() => {
      const staleCutoff = nowMs - staleProcessingMs;

      const due = this.db.sqlite
        .prepare(
          `
          SELECT *
          FROM reminders
          WHERE remind_at <= ?
            AND (
              status = 'pending'
              OR (status = 'processing' AND COALESCE(last_attempt_at, 0) <= ?)
            )
          ORDER BY remind_at ASC, id ASC
          LIMIT ?
        `
        )
        .all(nowMs, staleCutoff, Math.max(1, limit)) as ReminderRow[];

      if (due.length === 0) {
        return due;
      }

      const markProcessing = this.db.sqlite.prepare(
        `
        UPDATE reminders
        SET
          status = 'processing',
          attempt_count = attempt_count + 1,
          last_attempt_at = ?,
          last_error = NULL
        WHERE id = ?
      `
      );

      for (const reminder of due) {
        markProcessing.run(nowMs, reminder.id);
      }

      return due;
    });
  }

  getByUser(userId: number): ReminderRow[] {
    return this.db.sqlite
      .prepare(`SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_at ASC`)
      .all(userId) as ReminderRow[];
  }

  delete(id: number, userId: number): boolean {
    const result = this.db.sqlite
      .prepare(`DELETE FROM reminders WHERE id = ? AND user_id = ?`)
      .run(id, userId);
    return result.changes > 0;
  }

  deleteById(id: number): void {
    this.db.sqlite.prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
  }

  markFailed(id: number, errorMessage: string): void {
    this.db.sqlite
      .prepare(
        `
        UPDATE reminders
        SET
          status = 'pending',
          last_error = ?,
          last_attempt_at = ?
        WHERE id = ?
      `
      )
      .run(errorMessage, Date.now(), id);
  }
}
