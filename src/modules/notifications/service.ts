import {
  NotificationDefaultMode,
  NotificationDeliveryMode,
  NotificationEnqueueInput,
  NotificationEventType,
  NotificationHealthSummary,
  NotificationOverrideMode,
  NotificationPreferenceView,
  NOTIFICATION_EVENT_DEFINITIONS,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENT_TYPES,
  OPT_IN_NOTIFICATION_EVENTS,
  TASK_NOTIFICATION_EVENTS
} from './types.js';
import { NotificationsRepository } from './repository.js';

const IMPLICIT_GUILD_DEFAULT_MODE: NotificationDefaultMode = 'dm_fallback';
const IMPLICIT_DM_DEFAULT_MODE: NotificationDefaultMode = 'dm_only';

export interface NotificationEnqueueResult {
  enqueued: boolean;
  skippedReason?: 'off' | 'duplicate';
}

export interface NotificationModeResolution {
  guildDefaultMode: NotificationDefaultMode;
  userOverrideMode: NotificationOverrideMode;
  effectiveMode: NotificationDefaultMode;
}

export class NotificationsService {
  constructor(private readonly notificationsRepo: NotificationsRepository) {}

  getEventTypes(): readonly NotificationEventType[] {
    return NOTIFICATION_EVENT_TYPES;
  }

  getEventDefinitions() {
    return NOTIFICATION_EVENT_DEFINITIONS;
  }

  isTaskEvent(eventType: NotificationEventType): boolean {
    return TASK_NOTIFICATION_EVENTS.has(eventType);
  }

  resolveMode(guildId: string | null, userId: string, eventType: NotificationEventType): NotificationModeResolution {
    const guildDefaultMode = this.getGuildDefaultMode(guildId, eventType);
    const userOverrideMode = this.getUserOverrideMode(guildId, userId, eventType);

    const effectiveMode =
      userOverrideMode === 'inherit'
        ? guildDefaultMode
        : userOverrideMode;

    return {
      guildDefaultMode,
      userOverrideMode,
      effectiveMode
    };
  }

  enqueue<TEvent extends NotificationEventType>(input: NotificationEnqueueInput<TEvent>): NotificationEnqueueResult {
    const modeResolution = this.resolveMode(input.guildId, input.recipientUserId, input.eventType);
    if (modeResolution.effectiveMode === 'off') {
      return { enqueued: false, skippedReason: 'off' };
    }

    const createdAt = Date.now();
    const inserted = this.notificationsRepo.insertOutbox({
      ...input,
      mode: this.toDeliveryMode(modeResolution.effectiveMode),
      createdAt,
      nextAttemptAt: input.deliverAt ?? createdAt
    });

    if (!inserted) {
      return { enqueued: false, skippedReason: 'duplicate' };
    }

    return { enqueued: true };
  }

  listUserPreferences(guildId: string, userId: string, eventType?: NotificationEventType): NotificationPreferenceView[] {
    const defaults = this.notificationsRepo.listGuildDefaults(guildId);
    const overrides = this.notificationsRepo.listUserOverrides(guildId, userId);

    const defaultMap = new Map(defaults.map((entry) => [entry.eventType, entry.mode]));
    const overrideMap = new Map(overrides.map((entry) => [entry.eventType, entry.mode]));

    const targetEvents = eventType ? [eventType] : [...NOTIFICATION_EVENT_TYPES];

    return targetEvents.map((event) => {
      const definition = NOTIFICATION_EVENT_DEFINITIONS.find((entry) => entry.type === event);
      const guildDefaultMode = defaultMap.get(event) ?? this.getGuildDefaultMode(guildId, event);
      const userOverrideMode = overrideMap.get(event) ?? 'inherit';
      const effectiveMode = userOverrideMode === 'inherit' ? guildDefaultMode : userOverrideMode;

      return {
        eventType: event,
        eventLabel: NOTIFICATION_EVENT_LABELS[event],
        category: definition?.category ?? 'economy',
        guildDefaultMode,
        userOverrideMode,
        effectiveMode
      };
    });
  }

  setUserOverride(
    guildId: string,
    userId: string,
    eventType: NotificationEventType,
    mode: NotificationOverrideMode
  ): NotificationPreferenceView {
    const now = Date.now();
    this.notificationsRepo.upsertUserOverride(guildId, userId, eventType, mode, now);
    return this.listUserPreferences(guildId, userId, eventType)[0]!;
  }

  resetUserOverrides(guildId: string, userId: string, eventType?: NotificationEventType): number {
    return this.notificationsRepo.resetUserOverrides(guildId, userId, eventType);
  }

  listGuildDefaults(guildId: string, eventType?: NotificationEventType): NotificationPreferenceView[] {
    const defaults = this.notificationsRepo.listGuildDefaults(guildId);
    const defaultMap = new Map(defaults.map((entry) => [entry.eventType, entry.mode]));
    const targetEvents = eventType ? [eventType] : [...NOTIFICATION_EVENT_TYPES];

    return targetEvents.map((event) => {
      const definition = NOTIFICATION_EVENT_DEFINITIONS.find((entry) => entry.type === event);
      const guildDefaultMode = defaultMap.get(event) ?? this.getGuildDefaultMode(guildId, event);

      return {
        eventType: event,
        eventLabel: NOTIFICATION_EVENT_LABELS[event],
        category: definition?.category ?? 'economy',
        guildDefaultMode,
        userOverrideMode: 'inherit',
        effectiveMode: guildDefaultMode
      };
    });
  }

  setGuildDefault(
    guildId: string,
    actorUserId: string,
    eventType: NotificationEventType,
    mode: NotificationDefaultMode
  ): NotificationPreferenceView {
    const now = Date.now();
    this.notificationsRepo.upsertGuildDefault(guildId, eventType, mode, actorUserId, now);
    return this.listGuildDefaults(guildId, eventType)[0]!;
  }

  resetGuildDefaults(guildId: string, eventType?: NotificationEventType): number {
    return this.notificationsRepo.resetGuildDefaults(guildId, eventType);
  }

  getOutboxHealth(): NotificationHealthSummary {
    return this.notificationsRepo.getOutboxHealth(Date.now());
  }

  enqueueTestNotification(
    guildId: string | null,
    sourceChannelId: string | null,
    recipientUserId: string,
    eventType: NotificationEventType,
    actorUserId?: string
  ): NotificationEnqueueResult {
    const payload = this.buildTestPayload(eventType);

    return this.enqueue({
      guildId,
      sourceChannelId,
      recipientUserId,
      actorUserId: actorUserId ?? null,
      eventType,
      payload,
      dedupeKey: null
    });
  }

  private getGuildDefaultMode(guildId: string | null, eventType: NotificationEventType): NotificationDefaultMode {
    // Opt-in events never inherit the implicit default — without an explicit
    // guild default (or user override, applied above) they stay off.
    const implicitDefault = OPT_IN_NOTIFICATION_EVENTS.has(eventType)
      ? 'off'
      : null;

    if (!guildId) {
      return implicitDefault ?? IMPLICIT_DM_DEFAULT_MODE;
    }

    const row = this.notificationsRepo.getGuildDefault(guildId, eventType);
    return row?.mode ?? implicitDefault ?? IMPLICIT_GUILD_DEFAULT_MODE;
  }

  private getUserOverrideMode(guildId: string | null, userId: string, eventType: NotificationEventType): NotificationOverrideMode {
    if (!guildId) {
      return 'inherit';
    }

    const row = this.notificationsRepo.getUserOverride(guildId, userId, eventType);
    return row?.mode ?? 'inherit';
  }

  private toDeliveryMode(mode: NotificationDefaultMode): NotificationDeliveryMode {
    return mode === 'dm_only' ? 'dm_only' : 'dm_fallback';
  }

  private buildTestPayload(eventType: NotificationEventType): NotificationEnqueueInput['payload'] {
    if (eventType === 'timely_ready') {
      return { lastAmount: 123 };
    }

    if (eventType === 'bounty_taken') {
      return { bountyId: 1, title: 'Test bounty', takerDiscordUserId: '0', takerUsername: 'System Test' };
    }

    if (eventType === 'bounty_paid') {
      return { bountyId: 1, title: 'Test bounty', amount: 500 };
    }

    if (eventType === 'transfer_received') {
      return {
        amount: 123,
        senderDiscordUserId: '0',
        senderUsername: 'System Test'
      };
    }

    if (eventType === 'admin_award_received') {
      return {
        amount: 250,
        before: 1000,
        after: 1250,
        actorDiscordUserId: '0',
        actorUsername: 'System Test',
        note: 'Test admin award'
      };
    }

    if (eventType === 'admin_take_received') {
      return {
        amount: 200,
        before: 1200,
        after: 1000,
        actorDiscordUserId: '0',
        actorUsername: 'System Test',
        note: 'Test admin take'
      };
    }

    if (eventType === 'admin_set_balance_changed') {
      return {
        delta: 400,
        before: 800,
        after: 1200,
        actorDiscordUserId: '0',
        actorUsername: 'System Test',
        note: 'Test balance set'
      };
    }

    return { lastAmount: null };
  }
}
