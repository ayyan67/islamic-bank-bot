import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';
import { env } from '../config/env.js';

interface OutboxRow {
  id: number;
  guild_id: string | null;
  source_channel_id: string | null;
  recipient_user_id: string;
  actor_user_id: string | null;
  event_type: string;
  mode: string;
  payload_json: string;
  status: string;
  attempt_count: number;
  next_attempt_at: number;
  last_attempt_at: number | null;
  last_error: string | null;
  delivered_via: string | null;
}

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-notify-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
    }
  }
}

function getOutboxRows(container: AppContainer): OutboxRow[] {
  return container.db.sqlite
    .prepare(
      `
      SELECT id, guild_id, source_channel_id, recipient_user_id, actor_user_id,
             event_type, mode, payload_json, status, attempt_count,
             next_attempt_at, last_attempt_at, last_error, delivered_via
      FROM notification_outbox
      ORDER BY id ASC
    `
    )
    .all() as OutboxRow[];
}

describe('notifications', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];
  const originalOwnerIds = [...env.OWNER_IDS];

  afterEach(() => {
    env.OWNER_IDS.splice(0, env.OWNER_IDS.length, ...originalOwnerIds);
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  function openContainer(): AppContainer {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });
    return container;
  }

  it('resolves preference hierarchy correctly', () => {
    const container = openContainer();

    const initial = container.notificationsService.resolveMode('guild-1', 'user-1', 'transfer_received');
    expect(initial.guildDefaultMode).toBe('dm_fallback');
    expect(initial.userOverrideMode).toBe('inherit');
    expect(initial.effectiveMode).toBe('dm_fallback');

    container.notificationsService.setGuildDefault('guild-1', 'admin-1', 'transfer_received', 'off');
    const afterGuildDefault = container.notificationsService.resolveMode('guild-1', 'user-1', 'transfer_received');
    expect(afterGuildDefault.effectiveMode).toBe('off');

    container.notificationsService.setUserOverride('guild-1', 'user-1', 'transfer_received', 'dm_only');
    const afterUserOverride = container.notificationsService.resolveMode('guild-1', 'user-1', 'transfer_received');
    expect(afterUserOverride.effectiveMode).toBe('dm_only');
  });

  it('suppresses enqueue when effective mode is off', () => {
    const container = openContainer();
    container.notificationsService.setGuildDefault('guild-1', 'admin-1', 'transfer_received', 'off');

    const result = container.notificationsService.enqueue({
      guildId: 'guild-1',
      sourceChannelId: 'chan-1',
      recipientUserId: 'user-1',
      actorUserId: 'user-2',
      eventType: 'transfer_received',
      payload: {
        amount: 50,
        senderDiscordUserId: 'user-2',
        senderUsername: 'sender'
      },
      dedupeKey: 'off-test'
    });

    expect(result.enqueued).toBe(false);
    expect(result.skippedReason).toBe('off');
    expect(getOutboxRows(container)).toHaveLength(0);
  });

  it('dedupes enqueued rows by dedupe key', () => {
    const container = openContainer();

    const first = container.notificationsService.enqueue({
      guildId: 'guild-1',
      sourceChannelId: 'chan-1',
      recipientUserId: 'user-1',
      actorUserId: 'user-2',
      eventType: 'transfer_received',
      payload: {
        amount: 50,
        senderDiscordUserId: 'user-2',
        senderUsername: 'sender'
      },
      dedupeKey: 'dup-key-1'
    });

    const second = container.notificationsService.enqueue({
      guildId: 'guild-1',
      sourceChannelId: 'chan-1',
      recipientUserId: 'user-1',
      actorUserId: 'user-2',
      eventType: 'transfer_received',
      payload: {
        amount: 50,
        senderDiscordUserId: 'user-2',
        senderUsername: 'sender'
      },
      dedupeKey: 'dup-key-1'
    });

    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
    expect(second.skippedReason).toBe('duplicate');
    expect(getOutboxRows(container)).toHaveLength(1);
  });

  it('enqueues economy transfer and admin award events', () => {
    const container = openContainer();

    const sender = { discordUserId: 'n100', username: 'sender' };
    const recipient = { discordUserId: 'n101', username: 'recipient' };
    const admin = { discordUserId: 'n102', username: 'admin' };

    container.economyService.creditUser(sender, 1_000, 'claim_timely', 'seed');

    const transfer = container.economyService.transfer(sender, recipient, 300, {
      guildId: 'guild-1',
      sourceChannelId: 'chan-1'
    });
    expect(transfer.ok).toBe(true);

    const award = container.economyService.adminAward(admin, recipient, 200, 'bonus', {
      guildId: 'guild-1',
      sourceChannelId: 'chan-1'
    });
    expect(award.ok).toBe(true);

    const rows = getOutboxRows(container);
    expect(rows.some((row) => row.event_type === 'transfer_received' && row.recipient_user_id === recipient.discordUserId)).toBe(true);
    expect(rows.some((row) => row.event_type === 'admin_award_received' && row.recipient_user_id === recipient.discordUserId)).toBe(true);
  });

  it('enqueues bounty lifecycle notifications', () => {
    const container = openContainer();

    const owner = { discordUserId: 'n200', username: 'owner' };
    const worker = { discordUserId: 'n201', username: 'worker' };

    container.economyService.creditUser(owner, 5_000, 'claim_timely', 'seed');

    const posted = container.bountyService.post(owner, 'guild-1', 'chan-1', 'Bounty Flow Notify', 500);
    expect(posted.ok).toBe(true);
    if (!posted.ok) throw new Error('Expected posted bounty');

    expect(container.bountyService.take(worker, 'guild-1', posted.id).ok).toBe(true);
    expect(container.bountyService.pay(owner, 'guild-1', posted.id).ok).toBe(true);

    const rows = getOutboxRows(container);
    expect(rows.some((row) => row.event_type === 'bounty_taken' && row.recipient_user_id === owner.discordUserId)).toBe(true);
    expect(rows.some((row) => row.event_type === 'bounty_paid' && row.recipient_user_id === worker.discordUserId)).toBe(true);
  });

  it('dispatcher marks sent via dm on success', async () => {
    const container = openContainer();

    const enqueue = container.notificationsService.enqueue({
      guildId: 'guild-1',
      sourceChannelId: 'chan-1',
      recipientUserId: 'n301',
      actorUserId: 'n300',
      eventType: 'transfer_received',
      payload: {
        amount: 10,
        senderDiscordUserId: 'n300',
        senderUsername: 'sender'
      },
      dedupeKey: 'dispatch-dm-success'
    });
    expect(enqueue.enqueued).toBe(true);

    const writes: Array<{ channelId: string; payload: any }> = [];
    const client = {
      users: {
        createDM: async (userId: string) => {
          void userId;
          return { id: 'dm-chan-1' };
        }
      },
      messages: {
        write: async (channelId: string, payload: any) => {
          writes.push({ channelId, payload });
          return {};
        }
      }
    };

    const summary = await container.notificationsDispatcher.processDue(client);
    expect(summary.claimed).toBe(1);
    expect(summary.sent).toBe(1);

    const rows = getOutboxRows(container);
    expect(rows[0]?.status).toBe('sent');
    expect(rows[0]?.delivered_via).toBe('dm');
    expect(writes[0]?.channelId).toBe('dm-chan-1');
  });

  it('dispatcher falls back to channel when dm fails and mode allows fallback', async () => {
    const container = openContainer();

    const enqueue = container.notificationsService.enqueue({
      guildId: 'guild-1',
      sourceChannelId: 'chan-fallback',
      recipientUserId: 'n401',
      actorUserId: 'n400',
      eventType: 'bounty_taken',
      payload: {
        bountyId: 7,
        title: 'Fallback Bounty',
        takerDiscordUserId: 'n400',
        takerUsername: 'taker'
      },
      dedupeKey: 'dispatch-fallback-success'
    });
    expect(enqueue.enqueued).toBe(true);

    const writes: Array<{ channelId: string; payload: any }> = [];
    const client = {
      users: {
        createDM: async (userId: string) => {
          void userId;
          throw new Error('DM closed');
        }
      },
      messages: {
        write: async (channelId: string, payload: any) => {
          writes.push({ channelId, payload });
          return {};
        }
      }
    };

    const summary = await container.notificationsDispatcher.processDue(client);
    expect(summary.sent).toBe(1);

    const rows = getOutboxRows(container);
    expect(rows[0]?.status).toBe('sent');
    expect(rows[0]?.delivered_via).toBe('channel_fallback');
    expect(writes[0]?.channelId).toBe('chan-fallback');
  });

  it('dispatcher retries then marks dead after max attempts', async () => {
    const container = openContainer();

    const enqueue = container.notificationsService.enqueue({
      guildId: 'guild-1',
      sourceChannelId: null,
      recipientUserId: 'n501',
      actorUserId: 'n500',
      eventType: 'transfer_received',
      payload: {
        amount: 10,
        senderDiscordUserId: 'n500',
        senderUsername: 'sender'
      },
      dedupeKey: 'dispatch-retry-dead'
    });
    expect(enqueue.enqueued).toBe(true);

    const failingClient = {
      users: {
        createDM: async (userId: string) => {
          void userId;
          throw new Error('DM failed');
        }
      },
      messages: {
        write: async (channelId: string, payload: any) => {
          void channelId;
          void payload;
          throw new Error('fallback failed');
        }
      }
    };

    const first = await container.notificationsDispatcher.processDue(failingClient);
    expect(first.retried).toBe(1);

    const afterFirst = getOutboxRows(container)[0];
    expect(afterFirst?.status).toBe('pending');
    expect(afterFirst?.attempt_count).toBe(1);

    container.db.sqlite
      .prepare(
        `
        UPDATE notification_outbox
        SET attempt_count = 7, status = 'pending', next_attempt_at = ?, last_attempt_at = ?
        WHERE id = ?
      `
      )
      .run(Date.now() - 1, Date.now() - 60_000, afterFirst?.id);

    const second = await container.notificationsDispatcher.processDue(failingClient);
    expect(second.dead).toBe(1);

    const afterSecond = getOutboxRows(container)[0];
    expect(afterSecond?.status).toBe('dead');
    expect(afterSecond?.attempt_count).toBe(8);
  });
});
