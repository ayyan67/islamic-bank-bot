export const NOTIFICATION_EVENT_TYPES = [
  'timely_ready',
  'transfer_received',
  'admin_award_received',
  'admin_take_received',
  'admin_set_balance_changed',
  'bounty_taken',
  'bounty_paid'
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type NotificationDefaultMode = 'off' | 'dm_only' | 'dm_fallback';
export type NotificationOverrideMode = 'inherit' | NotificationDefaultMode;
export type NotificationDeliveryMode = Exclude<NotificationDefaultMode, 'off'>;

export type NotificationOutboxStatus = 'pending' | 'processing' | 'sent' | 'dead';

export type NotificationDeliveredVia = 'dm' | 'channel_fallback';

export interface NotificationContext {
  guildId?: string | null;
  sourceChannelId?: string | null;
}

export interface TimelyReadyPayload {
  lastAmount: number | null;
}

export interface TransferReceivedPayload {
  amount: number;
  senderDiscordUserId: string;
  senderUsername: string | null;
}

export interface AdminAwardReceivedPayload {
  amount: number;
  before: number;
  after: number;
  actorDiscordUserId: string;
  actorUsername: string | null;
  note: string | null;
}

export interface AdminTakeReceivedPayload {
  amount: number;
  before: number;
  after: number;
  actorDiscordUserId: string;
  actorUsername: string | null;
  note: string | null;
}

export interface AdminSetBalanceChangedPayload {
  delta: number;
  before: number;
  after: number;
  actorDiscordUserId: string;
  actorUsername: string | null;
  note: string | null;
}

export interface BountyTakenPayload {
  bountyId: number;
  title: string;
  takerDiscordUserId: string;
  takerUsername: string;
}

export interface BountyPaidPayload {
  bountyId: number;
  title: string;
  amount: number;
}

export interface NotificationPayloadMap {
  timely_ready: TimelyReadyPayload;
  transfer_received: TransferReceivedPayload;
  admin_award_received: AdminAwardReceivedPayload;
  admin_take_received: AdminTakeReceivedPayload;
  admin_set_balance_changed: AdminSetBalanceChangedPayload;
  bounty_taken: BountyTakenPayload;
  bounty_paid: BountyPaidPayload;
}

export interface NotificationEventDefinition {
  type: NotificationEventType;
  label: string;
  category: 'economy' | 'tasks';
}

export const NOTIFICATION_EVENT_DEFINITIONS: readonly NotificationEventDefinition[] = [
  { type: 'timely_ready', label: 'Timely Ready Reminder', category: 'economy' },
  { type: 'transfer_received', label: 'Transfer Received', category: 'economy' },
  { type: 'admin_award_received', label: 'Admin Award Received', category: 'economy' },
  { type: 'admin_take_received', label: 'Admin Take Applied', category: 'economy' },
  { type: 'admin_set_balance_changed', label: 'Admin Balance Set Changed', category: 'economy' },
  { type: 'bounty_taken', label: 'Bounty Taken', category: 'tasks' },
  { type: 'bounty_paid', label: 'Bounty Paid', category: 'tasks' }
] as const;

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  timely_ready: 'Timely Ready Reminder',
  transfer_received: 'Transfer Received',
  admin_award_received: 'Admin Award Received',
  admin_take_received: 'Admin Take Applied',
  admin_set_balance_changed: 'Admin Balance Set Changed',
  bounty_taken: 'Bounty Taken',
  bounty_paid: 'Bounty Paid'
};

/**
 * Events that are strictly opt-in: they never fire from the implicit
 * dm_fallback default — only an explicit user override or guild default
 * enables them.
 */
export const OPT_IN_NOTIFICATION_EVENTS = new Set<NotificationEventType>(['timely_ready']);

export const TASK_NOTIFICATION_EVENTS = new Set<NotificationEventType>(['bounty_taken', 'bounty_paid']);

export interface NotificationOutboxRow<TEvent extends NotificationEventType = NotificationEventType> {
  id: number;
  guildId: string | null;
  sourceChannelId: string | null;
  recipientUserId: string;
  actorUserId: string | null;
  eventType: TEvent;
  mode: NotificationDeliveryMode;
  payload: NotificationPayloadMap[TEvent];
  dedupeKey: string | null;
  status: NotificationOutboxStatus;
  attemptCount: number;
  nextAttemptAt: number;
  lastAttemptAt: number | null;
  lastError: string | null;
  deliveredVia: NotificationDeliveredVia | null;
  createdAt: number;
  sentAt: number | null;
}

export interface NotificationEnqueueInput<TEvent extends NotificationEventType = NotificationEventType> {
  guildId: string | null;
  sourceChannelId: string | null;
  recipientUserId: string;
  actorUserId?: string | null;
  eventType: TEvent;
  payload: NotificationPayloadMap[TEvent];
  dedupeKey?: string | null;
  /** Epoch ms timestamp for delayed delivery; defaults to now. */
  deliverAt?: number | null;
}

export interface GuildNotificationDefault {
  guildId: string;
  eventType: NotificationEventType;
  mode: NotificationDefaultMode;
  updatedByUserId: string;
  updatedAt: number;
}

export interface UserNotificationOverride {
  guildId: string;
  userId: string;
  eventType: NotificationEventType;
  mode: NotificationOverrideMode;
  updatedAt: number;
}

export interface NotificationPreferenceView {
  eventType: NotificationEventType;
  eventLabel: string;
  category: 'economy' | 'tasks';
  guildDefaultMode: NotificationDefaultMode;
  userOverrideMode: NotificationOverrideMode;
  effectiveMode: NotificationDefaultMode;
}

export interface NotificationHealthSummary {
  pending: number;
  processing: number;
  dead: number;
  sentLast24h: number;
  recentFailures: number;
}
