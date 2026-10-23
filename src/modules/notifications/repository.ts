import { Database } from '../../infra/db/database.js';
import {
  GuildNotificationDefault,
  NotificationDefaultMode,
  NotificationDeliveredVia,
  NotificationDeliveryMode,
  NotificationEnqueueInput,
  NotificationEventType,
  NotificationHealthSummary,
  NotificationOutboxRow,
  NotificationOverrideMode,
  NotificationPayloadMap,
  NotificationOutboxStatus,
  UserNotificationOverride
} from './types.js';

interface NotificationOutboxDbRow {
  id: number;
  guild_id: string | null;
  source_channel_id: string | null;
  recipient_user_id: string;
  actor_user_id: string | null;
  event_type: NotificationEventType;
  mode: NotificationDeliveryMode;
  payload_json: string;
  dedupe_key: string | null;
  status: NotificationOutboxStatus;
  attempt_count: number;
  next_attempt_at: number;
  last_attempt_at: number | null;
  last_error: string | null;
  delivered_via: NotificationDeliveredVia | null;
  created_at: number;
  sent_at: number | null;
}

interface GuildDefaultDbRow {
  guild_id: string;
  event_type: NotificationEventType;
  mode: NotificationDefaultMode;
  updated_by_user_id: string;
  updated_at: number;
}

interface UserOverrideDbRow {
  guild_id: string;
  user_id: string;
  event_type: NotificationEventType;
  mode: NotificationOverrideMode;
  updated_at: number;
}

interface StatusCountRow {
  status: NotificationOutboxStatus;
  total: number;
}

interface CountRow {
  total: number;
}

const SQLITE_CONSTRAINT = 'SQLITE_CONSTRAINT';

export class NotificationsRepository {
  constructor(private readonly db: Database) {}

  insertOutbox<TEvent extends NotificationEventType>(
    input: NotificationEnqueueInput<TEvent> & {
      mode: NotificationDeliveryMode;
      createdAt: number;
      nextAttemptAt: number;
    }
  ): boolean {
    const payloadJson = JSON.stringify(input.payload);

    try {
      const result = this.db.sqlite
        .prepare(
          `
          INSERT INTO notification_outbox (
            guild_id,
            source_channel_id,
            recipient_user_id,
            actor_user_id,
            event_type,
            mode,
            payload_json,
            dedupe_key,
            status,
            attempt_count,
            next_attempt_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
        `
        )
        .run(
          input.guildId,
          input.sourceChannelId,
          input.recipientUserId,
          input.actorUserId ?? null,
          input.eventType,
          input.mode,
          payloadJson,
          input.dedupeKey ?? null,
          input.nextAttemptAt,
          input.createdAt
        );

      return result.changes > 0;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string' &&
        (error as { code: string }).code.startsWith(SQLITE_CONSTRAINT)
      ) {
        return false;
      }

      throw error;
    }
  }

  claimDue(nowMs: number, limit: number, staleProcessingMs: number): NotificationOutboxRow[] {
    return this.db.transaction(() => {
      const staleCutoff = nowMs - staleProcessingMs;
      const rows = this.db.sqlite
        .prepare(
          `
          SELECT
            id,
            guild_id,
            source_channel_id,
            recipient_user_id,
            actor_user_id,
            event_type,
            mode,
            payload_json,
            dedupe_key,
            status,
            attempt_count,
            next_attempt_at,
            last_attempt_at,
            last_error,
            delivered_via,
            created_at,
            sent_at
          FROM notification_outbox
          WHERE next_attempt_at <= ?
            AND (
              status = 'pending'
              OR (status = 'processing' AND COALESCE(last_attempt_at, 0) <= ?)
            )
          ORDER BY next_attempt_at ASC, id ASC
          LIMIT ?
        `
        )
        .all(nowMs, staleCutoff, Math.max(1, limit)) as NotificationOutboxDbRow[];

      if (rows.length === 0) {
        return [];
      }

      const markProcessing = this.db.sqlite.prepare(
        `
        UPDATE notification_outbox
        SET
          status = 'processing',
          attempt_count = attempt_count + 1,
          last_attempt_at = ?,
          last_error = NULL
        WHERE id = ?
      `
      );

      for (const row of rows) {
        markProcessing.run(nowMs, row.id);
        row.status = 'processing';
        row.attempt_count += 1;
        row.last_attempt_at = nowMs;
        row.last_error = null;
      }

      return rows.map((row) => this.mapOutboxRow(row));
    });
  }

  markSent(id: number, deliveredVia: NotificationDeliveredVia, sentAt: number): void {
    this.db.sqlite
      .prepare(
        `
        UPDATE notification_outbox
        SET
          status = 'sent',
          delivered_via = ?,
          sent_at = ?,
          last_error = NULL
        WHERE id = ?
      `
      )
      .run(deliveredVia, sentAt, id);
  }

  markRetry(id: number, nextAttemptAt: number, errorMessage: string, attemptedAt: number): void {
    this.db.sqlite
      .prepare(
        `
        UPDATE notification_outbox
        SET
          status = 'pending',
          next_attempt_at = ?,
          last_error = ?,
          last_attempt_at = ?
        WHERE id = ?
      `
      )
      .run(nextAttemptAt, errorMessage, attemptedAt, id);
  }

  markDead(id: number, errorMessage: string, attemptedAt: number): void {
    this.db.sqlite
      .prepare(
        `
        UPDATE notification_outbox
        SET
          status = 'dead',
          last_error = ?,
          last_attempt_at = ?
        WHERE id = ?
      `
      )
      .run(errorMessage, attemptedAt, id);
  }

  getOutboxHealth(nowMs: number): NotificationHealthSummary {
    const statusRows = this.db.sqlite
      .prepare(
        `
        SELECT status, COUNT(1) AS total
        FROM notification_outbox
        GROUP BY status
      `
      )
      .all() as StatusCountRow[];

    const countByStatus = new Map<NotificationOutboxStatus, number>([
      ['pending', 0],
      ['processing', 0],
      ['sent', 0],
      ['dead', 0]
    ]);

    for (const row of statusRows) {
      countByStatus.set(row.status, row.total);
    }

    const sentLast24h = (this.db.sqlite
      .prepare(
        `
        SELECT COUNT(1) AS total
        FROM notification_outbox
        WHERE status = 'sent'
          AND sent_at IS NOT NULL
          AND sent_at >= ?
      `
      )
      .get(nowMs - 24 * 60 * 60 * 1000) as CountRow | undefined)?.total ?? 0;

    const recentFailures = (this.db.sqlite
      .prepare(
        `
        SELECT COUNT(1) AS total
        FROM notification_outbox
        WHERE last_error IS NOT NULL
          AND last_attempt_at IS NOT NULL
          AND last_attempt_at >= ?
      `
      )
      .get(nowMs - 60 * 60 * 1000) as CountRow | undefined)?.total ?? 0;

    return {
      pending: countByStatus.get('pending') ?? 0,
      processing: countByStatus.get('processing') ?? 0,
      dead: countByStatus.get('dead') ?? 0,
      sentLast24h,
      recentFailures
    };
  }

  listGuildDefaults(guildId: string): GuildNotificationDefault[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT guild_id, event_type, mode, updated_by_user_id, updated_at
        FROM guild_notification_defaults
        WHERE guild_id = ?
      `
      )
      .all(guildId) as GuildDefaultDbRow[];

    return rows.map((row) => ({
      guildId: row.guild_id,
      eventType: row.event_type,
      mode: row.mode,
      updatedByUserId: row.updated_by_user_id,
      updatedAt: row.updated_at
    }));
  }

  getGuildDefault(guildId: string, eventType: NotificationEventType): GuildNotificationDefault | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT guild_id, event_type, mode, updated_by_user_id, updated_at
        FROM guild_notification_defaults
        WHERE guild_id = ?
          AND event_type = ?
        LIMIT 1
      `
      )
      .get(guildId, eventType) as GuildDefaultDbRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      guildId: row.guild_id,
      eventType: row.event_type,
      mode: row.mode,
      updatedByUserId: row.updated_by_user_id,
      updatedAt: row.updated_at
    };
  }

  upsertGuildDefault(
    guildId: string,
    eventType: NotificationEventType,
    mode: NotificationDefaultMode,
    updatedByUserId: string,
    updatedAt: number
  ): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO guild_notification_defaults (guild_id, event_type, mode, updated_by_user_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, event_type)
        DO UPDATE SET
          mode = excluded.mode,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_at = excluded.updated_at
      `
      )
      .run(guildId, eventType, mode, updatedByUserId, updatedAt);
  }

  resetGuildDefaults(guildId: string, eventType?: NotificationEventType): number {
    if (eventType) {
      return this.db.sqlite
        .prepare('DELETE FROM guild_notification_defaults WHERE guild_id = ? AND event_type = ?')
        .run(guildId, eventType).changes;
    }

    return this.db.sqlite
      .prepare('DELETE FROM guild_notification_defaults WHERE guild_id = ?')
      .run(guildId).changes;
  }

  listUserOverrides(guildId: string, userId: string): UserNotificationOverride[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT guild_id, user_id, event_type, mode, updated_at
        FROM user_notification_overrides
        WHERE guild_id = ?
          AND user_id = ?
      `
      )
      .all(guildId, userId) as UserOverrideDbRow[];

    return rows.map((row) => ({
      guildId: row.guild_id,
      userId: row.user_id,
      eventType: row.event_type,
      mode: row.mode,
      updatedAt: row.updated_at
    }));
  }

  getUserOverride(guildId: string, userId: string, eventType: NotificationEventType): UserNotificationOverride | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT guild_id, user_id, event_type, mode, updated_at
        FROM user_notification_overrides
        WHERE guild_id = ?
          AND user_id = ?
          AND event_type = ?
        LIMIT 1
      `
      )
      .get(guildId, userId, eventType) as UserOverrideDbRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      guildId: row.guild_id,
      userId: row.user_id,
      eventType: row.event_type,
      mode: row.mode,
      updatedAt: row.updated_at
    };
  }

  upsertUserOverride(
    guildId: string,
    userId: string,
    eventType: NotificationEventType,
    mode: NotificationOverrideMode,
    updatedAt: number
  ): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO user_notification_overrides (guild_id, user_id, event_type, mode, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, user_id, event_type)
        DO UPDATE SET
          mode = excluded.mode,
          updated_at = excluded.updated_at
      `
      )
      .run(guildId, userId, eventType, mode, updatedAt);
  }

  resetUserOverrides(guildId: string, userId: string, eventType?: NotificationEventType): number {
    if (eventType) {
      return this.db.sqlite
        .prepare(
          'DELETE FROM user_notification_overrides WHERE guild_id = ? AND user_id = ? AND event_type = ?'
        )
        .run(guildId, userId, eventType).changes;
    }

    return this.db.sqlite
      .prepare('DELETE FROM user_notification_overrides WHERE guild_id = ? AND user_id = ?')
      .run(guildId, userId).changes;
  }

  private mapOutboxRow(row: NotificationOutboxDbRow): NotificationOutboxRow {
    return {
      id: row.id,
      guildId: row.guild_id,
      sourceChannelId: row.source_channel_id,
      recipientUserId: row.recipient_user_id,
      actorUserId: row.actor_user_id,
      eventType: row.event_type,
      mode: row.mode,
      payload: this.parsePayload(row.payload_json),
      dedupeKey: row.dedupe_key,
      status: row.status,
      attemptCount: row.attempt_count,
      nextAttemptAt: row.next_attempt_at,
      lastAttemptAt: row.last_attempt_at,
      lastError: row.last_error,
      deliveredVia: row.delivered_via,
      createdAt: row.created_at,
      sentAt: row.sent_at
    };
  }

  private parsePayload(payloadJson: string): NotificationPayloadMap[NotificationEventType] {
    try {
      return JSON.parse(payloadJson) as NotificationPayloadMap[NotificationEventType];
    } catch {
      return {} as NotificationPayloadMap[NotificationEventType];
    }
  }
}
