import { Database } from '../database.js';

export class InteractionDedupRepository {
  constructor(private readonly db: Database) {}

  tryClaim(interactionId: string, ttlMs: number, nowMs = Date.now()): boolean {
    if (!interactionId) {
      return false;
    }

    const expiresAt = nowMs + ttlMs;

    return this.db.transaction(() => {
      this.db.sqlite
        .prepare('DELETE FROM interaction_dedup WHERE expires_at <= ?')
        .run(nowMs);

      const result = this.db.sqlite
        .prepare(
          `
          INSERT INTO interaction_dedup (interaction_id, expires_at, created_at)
          VALUES (?, ?, ?)
          ON CONFLICT(interaction_id) DO NOTHING
        `
        )
        .run(interactionId, expiresAt, nowMs);

      return result.changes > 0;
    });
  }
}
