import { formatCurrency } from '../../infra/discord/formatting.js';
import { NotificationsRepository } from './repository.js';
import { NotificationOutboxRow, NotificationPayloadMap } from './types.js';

export interface NotificationsDispatcherSummary {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
}

export interface NotificationDispatcherClient {
  users: {
    createDM(userId: string): Promise<{ id: string }>;
  };
  messages: {
    write(channelId: string, payload: any): Promise<unknown>;
  };
}

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_STALE_PROCESSING_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const BASE_BACKOFF_MS = 15 * 1000;

function truncate(value: string, maxLength = 120): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const trimmed = message.trim();
  return trimmed.length > 0 ? truncate(trimmed, 300) : 'unknown notification delivery error';
}

function computeBackoffMs(attemptCount: number): number {
  const factor = Math.max(0, attemptCount - 1);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** factor);
}

function bountyIdFromPayload(payload: NotificationOutboxRow['payload']): number | null {
  if (typeof payload !== 'object' || payload === null || !('bountyId' in payload)) {
    return null;
  }

  const value = (payload as { bountyId?: unknown }).bountyId;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function buildEmbed(base: {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}): { embeds: any[] } {
  return {
    embeds: [
      {
        title: base.title,
        description: base.description,
        color: base.color,
        fields: base.fields ?? [],
        footer: { text: 'Islamic Bank • Notifications' },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function renderDmPayload(row: NotificationOutboxRow): { embeds: any[] } {
  if (row.eventType === 'timely_ready') {
    const payload = row.payload as NotificationPayloadMap['timely_ready'];
    return buildEmbed({
      title: '⏰ Timely Ready',
      description: 'Your timely reward can be claimed again — use `/claim timely` or `.timely`.',
      color: 0x0d9488,
      fields: payload.lastAmount
        ? [{ name: 'Last Claim', value: formatCurrency(payload.lastAmount), inline: true }]
        : []
    });
  }

  if (row.eventType === 'bounty_taken') {
    const payload = row.payload as NotificationPayloadMap['bounty_taken'];
    return buildEmbed({
      title: '🎯 Bounty Taken',
      description: `**${payload.takerUsername}** took your bounty #${payload.bountyId}: ${truncate(payload.title, 200)}`,
      color: 0x0d9488,
      fields: [{ name: 'Next Step', value: `When the work is done, release payment with \`/bounty pay id:${payload.bountyId}\`.`, inline: false }]
    });
  }

  if (row.eventType === 'bounty_paid') {
    const payload = row.payload as NotificationPayloadMap['bounty_paid'];
    return buildEmbed({
      title: '🎯 Bounty Paid',
      description: `You were paid ${formatCurrency(payload.amount)} for bounty #${payload.bountyId}: ${truncate(payload.title, 200)}`,
      color: 0x16a34a,
      fields: []
    });
  }

  if (row.eventType === 'transfer_received') {
    const payload = row.payload as NotificationPayloadMap['transfer_received'];
    return buildEmbed({
      title: '💸 Transfer Received',
      description: `You received ${formatCurrency(payload.amount)} from <@${payload.senderDiscordUserId}>.`,
      color: 0x16a34a,
      fields: [{ name: 'Quick Action', value: 'Use `/ledger recent` to review activity.', inline: false }]
    });
  }

  if (row.eventType === 'admin_award_received') {
    const payload = row.payload as NotificationPayloadMap['admin_award_received'];
    return buildEmbed({
      title: '🛡️ Admin Award',
      description: `An admin added ${formatCurrency(payload.amount)} to your wallet.`,
      color: 0x16a34a,
      fields: [
        { name: 'By', value: `<@${payload.actorDiscordUserId}>`, inline: true },
        { name: 'Balance', value: `${formatCurrency(payload.before)} → ${formatCurrency(payload.after)}`, inline: true },
        { name: 'Note', value: payload.note ? truncate(payload.note, 240) : 'n/a', inline: false }
      ]
    });
  }

  if (row.eventType === 'admin_take_received') {
    const payload = row.payload as NotificationPayloadMap['admin_take_received'];
    return buildEmbed({
      title: '🛡️ Admin Take',
      description: `An admin removed ${formatCurrency(payload.amount)} from your wallet.`,
      color: 0xf59e0b,
      fields: [
        { name: 'By', value: `<@${payload.actorDiscordUserId}>`, inline: true },
        { name: 'Balance', value: `${formatCurrency(payload.before)} → ${formatCurrency(payload.after)}`, inline: true },
        { name: 'Note', value: payload.note ? truncate(payload.note, 240) : 'n/a', inline: false }
      ]
    });
  }

  if (row.eventType === 'admin_set_balance_changed') {
    const payload = row.payload as NotificationPayloadMap['admin_set_balance_changed'];
    const deltaText = payload.delta >= 0 ? `+${payload.delta.toLocaleString('en-US')}` : payload.delta.toLocaleString('en-US');
    return buildEmbed({
      title: '🛡️ Admin Balance Update',
      description: `An admin updated your wallet balance (${deltaText}).`,
      color: 0x0ea5e9,
      fields: [
        { name: 'By', value: `<@${payload.actorDiscordUserId}>`, inline: true },
        { name: 'Balance', value: `${formatCurrency(payload.before)} → ${formatCurrency(payload.after)}`, inline: true },
        { name: 'Note', value: payload.note ? truncate(payload.note, 240) : 'n/a', inline: false }
      ]
    });
  }

  return buildEmbed({
    title: '🔔 Notification',
    description: `You have a new ${String(row.eventType).replace(/_/g, ' ')} notification.`,
    color: 0x0ea5e9,
    fields: []
  });
}

function renderFallbackMessage(row: NotificationOutboxRow): string {
  const bountyId = bountyIdFromPayload(row.payload);

  if (bountyId) {
    return `<@${row.recipientUserId}> Bounty #${bountyId} has an update. I couldn't DM you. Use /bounty view id:${bountyId}.`;
  }

  return `<@${row.recipientUserId}> You have a wallet update. I couldn't DM you. Use /ledger recent.`;
}

export class NotificationsDispatcher {
  constructor(private readonly notificationsRepo: NotificationsRepository) {}

  async processDue(
    client: NotificationDispatcherClient,
    options?: {
      nowMs?: number;
      batchSize?: number;
      staleProcessingMs?: number;
    }
  ): Promise<NotificationsDispatcherSummary> {
    const nowMs = options?.nowMs ?? Date.now();
    const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    const staleProcessingMs = options?.staleProcessingMs ?? DEFAULT_STALE_PROCESSING_MS;

    const due = this.notificationsRepo.claimDue(nowMs, batchSize, staleProcessingMs);
    const summary: NotificationsDispatcherSummary = {
      claimed: due.length,
      sent: 0,
      retried: 0,
      dead: 0
    };

    for (const row of due) {
      const attemptedAt = Date.now();
      try {
        const dmChannel = await client.users.createDM(row.recipientUserId);
        await client.messages.write(dmChannel.id, renderDmPayload(row));
        this.notificationsRepo.markSent(row.id, 'dm', attemptedAt);
        summary.sent += 1;
        continue;
      } catch (dmError) {
        const dmMessage = normalizeError(dmError);

        if (row.mode === 'dm_fallback' && row.sourceChannelId) {
          try {
            await client.messages.write(row.sourceChannelId, { content: renderFallbackMessage(row) });
            this.notificationsRepo.markSent(row.id, 'channel_fallback', attemptedAt);
            summary.sent += 1;
            continue;
          } catch (fallbackError) {
            const fallbackMessage = normalizeError(fallbackError);
            const mergedError = truncate(`dm:${dmMessage}; fallback:${fallbackMessage}`, 300);
            this.retryOrDead(row, attemptedAt, mergedError, summary);
            continue;
          }
        }

        this.retryOrDead(row, attemptedAt, dmMessage, summary);
      }
    }

    return summary;
  }

  private retryOrDead(
    row: NotificationOutboxRow,
    attemptedAt: number,
    errorMessage: string,
    summary: NotificationsDispatcherSummary
  ): void {
    if (row.attemptCount >= MAX_ATTEMPTS) {
      this.notificationsRepo.markDead(row.id, errorMessage, attemptedAt);
      summary.dead += 1;
      return;
    }

    const nextAttemptAt = attemptedAt + computeBackoffMs(row.attemptCount);
    this.notificationsRepo.markRetry(row.id, nextAttemptAt, errorMessage, attemptedAt);
    summary.retried += 1;
  }
}
