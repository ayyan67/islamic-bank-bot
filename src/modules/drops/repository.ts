import { Database } from '../../infra/db/database.js';
import { DropRow } from './types.js';

export class DropRepository {
  constructor(private readonly db: Database) {}

  createDrop(guildId: string, channelId: string, dropperUserId: number, amount: number): number {
    const result = this.db.sqlite
      .prepare(
        `INSERT INTO drops (guild_id, channel_id, dropper_user_id, amount)
         VALUES (?, ?, ?, ?)`
      )
      .run(guildId, channelId, dropperUserId, amount);

    return Number(result.lastInsertRowid);
  }

  pickDrop(channelId: string, pickerUserId: number): DropRow | undefined {
    return this.db.transaction(() => {
      const drop = this.db.sqlite
        .prepare(
          `SELECT * FROM drops
           WHERE channel_id = ? AND picked_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(channelId) as DropRow | undefined;

      if (!drop) {
        return undefined;
      }

      const updateResult = this.db.sqlite
        .prepare(
          `UPDATE drops
           SET picker_user_id = ?, picked_at = CURRENT_TIMESTAMP
           WHERE id = ? AND picked_at IS NULL`
        )
        .run(pickerUserId, drop.id);

      if (updateResult.changes === 0) {
        return undefined;
      }

      return drop;
    });
  }

  getActiveDrop(channelId: string): DropRow | undefined {
    return this.db.sqlite
      .prepare(
        `SELECT * FROM drops
         WHERE channel_id = ? AND picked_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(channelId) as DropRow | undefined;
  }
}
