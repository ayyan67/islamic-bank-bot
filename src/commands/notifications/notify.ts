import {
  Command,
  Declare,
  Options,
  SubCommand,
  createStringOption
} from 'seyfert';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import {
  NotificationEventType,
  NotificationOverrideMode,
  NotificationPreferenceView,
  NOTIFICATION_EVENT_DEFINITIONS,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENT_TYPES
} from '../../modules/notifications/types.js';
import { reply, replyFields } from '../shared.js';

const EVENT_CHOICES = NOTIFICATION_EVENT_DEFINITIONS.map((entry) => ({
  name: entry.label,
  value: entry.type
}));

const USER_MODE_CHOICES = [
  { name: 'Inherit Guild Default', value: 'inherit' },
  { name: 'Off', value: 'off' },
  { name: 'DM Only', value: 'dm_only' },
  { name: 'DM + Channel Fallback', value: 'dm_fallback' }
] as const;

function parseEventType(raw: unknown): NotificationEventType | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType)) {
    return value as NotificationEventType;
  }

  return null;
}

function parseUserMode(raw: unknown): NotificationOverrideMode | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === 'inherit' || value === 'off' || value === 'dm_only' || value === 'dm_fallback') {
    return value;
  }

  return null;
}

@Declare({
  name: 'view',
  description: 'View your notification settings',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  event: createStringOption({
    description: 'Optional single event to inspect',
    required: false,
    choices: EVENT_CHOICES
  })
})
class NotifyViewSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Notification preferences are managed per server. Use this command inside a server.');
      return;
    }

    const eventType = parseEventType(ctx.options.event);
    if (ctx.options.event && !eventType) {
      await reply(ctx, 'Invalid notification event type.');
      return;
    }

    const rows = ctx.app.notificationsService.listUserPreferences(
      ctx.guildId,
      ctx.author.id,
      eventType ?? undefined
    ) as NotificationPreferenceView[];
    const fields = rows.map((row) => ({
      name: row.eventLabel,
      value: [
        `Category: ${row.category}`,
        `Guild default: \`${row.guildDefaultMode}\``,
        `Your override: \`${row.userOverrideMode}\``,
        `Effective: \`${row.effectiveMode}\``
      ].join('\n'),
      inline: false
    }));

    await replyFields(ctx, {
      title: 'Notification Preferences',
      fields,
      footer: 'Use /notify set to change per-event behavior.',
      compact: true
    });
  }
}

@Declare({
  name: 'set',
  description: 'Set your notification mode for an event',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  event: createStringOption({
    description: 'Notification event',
    required: true,
    choices: EVENT_CHOICES
  }),
  mode: createStringOption({
    description: 'Delivery mode for this event',
    required: true,
    choices: [...USER_MODE_CHOICES]
  })
})
class NotifySetSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Notification preferences are managed per server. Use this command inside a server.');
      return;
    }

    const eventType = parseEventType(ctx.options.event);
    const mode = parseUserMode(ctx.options.mode);
    if (!eventType || !mode) {
      await reply(ctx, 'Invalid event or mode.');
      return;
    }

    const updated = ctx.app.notificationsService.setUserOverride(ctx.guildId, ctx.author.id, eventType, mode);
    await replyFields(ctx, {
      title: 'Preference Updated',
      tone: 'success',
      fields: [
        { name: 'Event', value: updated.eventLabel, inline: false },
        { name: 'Override', value: `\`${updated.userOverrideMode}\``, inline: true },
        { name: 'Effective', value: `\`${updated.effectiveMode}\``, inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'reset',
  description: 'Reset one or all of your notification overrides',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  event: createStringOption({
    description: 'Optional event to reset',
    required: false,
    choices: EVENT_CHOICES
  })
})
class NotifyResetSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Notification preferences are managed per server. Use this command inside a server.');
      return;
    }

    const eventType = parseEventType(ctx.options.event);
    if (ctx.options.event && !eventType) {
      await reply(ctx, 'Invalid event type.');
      return;
    }

    const removed = ctx.app.notificationsService.resetUserOverrides(ctx.guildId, ctx.author.id, eventType ?? undefined);
    await replyFields(ctx, {
      title: 'Preferences Reset',
      tone: 'success',
      fields: [
        {
          name: 'Scope',
          value: eventType ? NOTIFICATION_EVENT_LABELS[eventType] : 'All events',
          inline: true
        },
        { name: 'Removed Overrides', value: String(removed), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'test',
  description: 'Send a test notification through the outbox',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  event: createStringOption({
    description: 'Event type to test (default: transfer_received)',
    required: false,
    choices: EVENT_CHOICES
  })
})
class NotifyTestSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const eventType = parseEventType(ctx.options.event) ?? 'transfer_received';

    const result = ctx.app.notificationsService.enqueueTestNotification(
      ctx.guildId ?? null,
      ctx.channelId ?? null,
      ctx.author.id,
      eventType,
      ctx.author.id
    );

    if (!result.enqueued) {
      const reason =
        result.skippedReason === 'off'
          ? 'Test notification was skipped because this event is turned off for you.'
          : 'Test notification deduped and not re-enqueued.';
      await reply(ctx, reason);
      return;
    }

    await reply(ctx, `Queued test notification for **${NOTIFICATION_EVENT_LABELS[eventType]}**. Check your DMs.`);
  }
}

@Declare({
  name: 'notify',
  description: 'Manage notification delivery preferences',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options([NotifyViewSubCommand, NotifySetSubCommand, NotifyResetSubCommand, NotifyTestSubCommand])
export default class NotifyCommand extends Command {}
