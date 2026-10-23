import { Command, Declare, Options, createIntegerOption } from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { reply } from '../shared.js';

@Declare({
  name: 'clear',
  description: "Delete the bot's recent messages in this channel",
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: 8192n
})
@Options({
  count: createIntegerOption({
    description: 'Number of bot messages to delete (default 10, max 50)',
    required: false,
    min_value: 1,
    max_value: 50
  })
})
export default class ClearCommand extends Command {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId || !ctx.channelId) {
      await reply(ctx, 'This command can only be used in a server channel.');
      return;
    }

    const count = Number(ctx.options.count ?? 10);

    let messages: any[];
    try {
      messages = await ctx.client.messages.list(ctx.channelId, { limit: 100 });
    } catch {
      await reply(ctx, 'Failed to fetch messages.');
      return;
    }

    const botId = ctx.client.botId ?? ctx.client.applicationId;
    const botMessages = messages
      .filter((m: any) => m.author?.id === botId)
      .slice(0, count);

    if (botMessages.length === 0) {
      await reply(ctx, 'No recent bot messages found in this channel.');
      return;
    }

    let deleted = 0;
    for (const msg of botMessages) {
      try {
        await ctx.client.messages.delete(ctx.channelId, msg.id);
        deleted++;
      } catch {
        // Message may already be deleted or too old (>14 days)
      }
    }

    await reply(ctx, `Deleted ${deleted} bot message${deleted !== 1 ? 's' : ''}.`, {
      tone: 'success'
    });
  }
}
