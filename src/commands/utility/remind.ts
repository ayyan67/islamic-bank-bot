import { Command, Declare, Options, SubCommand, createIntegerOption, createStringOption } from 'seyfert';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { reply, replyFields, replyList } from '../shared.js';

@Declare({
  name: 'set',
  description: 'Set a reminder',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  time: createStringOption({
    description: 'When to remind you (e.g. 30m, 2h, 1d, 1d6h30m)',
    required: true
  }),
  message: createStringOption({
    description: 'What to remind you about',
    required: true,
    max_length: 200
  })
})
class RemindSetSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    const timeInput = String(ctx.options.time ?? '');
    const message = String(ctx.options.message ?? '');

    const result = ctx.app.reminderService.set(
      profile,
      ctx.channelId,
      ctx.guildId ?? null,
      timeInput,
      message
    );

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    const remindAt = new Date(result.remindAt);
    await replyFields(ctx, {
      title: 'Reminder Set',
      tone: 'success',
      fields: [
        { name: 'In', value: result.label, inline: true },
        { name: 'ID', value: `#${result.id}`, inline: true },
        { name: 'Message', value: message, inline: false }
      ],
      description: `I'll remind you at <t:${Math.floor(remindAt.getTime() / 1000)}:f>`,
      compact: true
    });
  }
}

@Declare({
  name: 'list',
  description: 'List your pending reminders',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
class RemindListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    const reminders = ctx.app.reminderService.list(profile);

    if (reminders.length === 0) {
      await reply(ctx, 'You have no pending reminders.');
      return;
    }

    const lines = reminders.map(
      (r: any) =>
        `**#${r.id}** — <t:${Math.floor(r.remind_at / 1000)}:R>\n${r.message}`
    );

    await replyList(ctx, {
      title: 'Your Reminders',
      lines,
      compact: true
    });
  }
}

@Declare({
  name: 'delete',
  description: 'Cancel a reminder',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  id: createIntegerOption({
    description: 'Reminder ID (from /remind list)',
    required: true,
    min_value: 1
  })
})
class RemindDeleteSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    const id = Number(ctx.options.id ?? 0);

    const result = ctx.app.reminderService.cancel(profile, id);

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    await reply(ctx, `Reminder #${id} cancelled.`, { tone: 'success' });
  }
}

@Declare({
  name: 'remind',
  description: 'Set and manage reminders',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options([RemindSetSubCommand, RemindListSubCommand, RemindDeleteSubCommand])
export default class RemindCommand extends Command {}
