import { Command, Declare, Options, createStringOption } from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { deleteInvokingMessage, parseAmount, reply, replyDetached, replyFields } from '../shared.js';

@Declare({
  name: 'drop',
  description: 'Drop currency in the chat for someone to pick up',
  aliases: ['d'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  amount: createStringOption({
    description: 'Amount to drop (number or "all")',
    required: true
  })
})
export default class DropCommand extends Command {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const profile = profileFromContext(ctx);
    const parsed = parseAmount(ctx.options.amount);
    if (parsed === null) {
      await reply(ctx, 'Invalid amount. Provide a positive number or "all".');
      return;
    }

    const amount = parsed === 'all' ? ctx.app.economyService.getBalance(profile) : parsed;
    if (amount <= 0) {
      await reply(ctx, 'You have no funds to drop.');
      return;
    }
    const result = ctx.app.dropService.drop(profile, ctx.guildId, ctx.channelId, amount);

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    const embed = {
      title: 'Currency Dropped!',
      description: `${formatCurrency(result.amount)} has been dropped in this channel!\nType \`.pick\` to claim it!`,
      tone: 'success' as const,
      fields: [
        { name: 'Dropped by', value: `<@${profile.discordUserId}>`, inline: true },
        { name: 'Amount', value: formatCurrency(result.amount), inline: true }
      ],
      compact: true
    };

    // Prefix invocations: the embed already names the dropper and amount, so the
    // `.drop X` message is redundant. Post the embed detached (no reply reference)
    // and then remove the invoking message. Requires Manage Messages; silently
    // skipped when the bot lacks it or the guild has turned the setting off.
    const settings = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
    const tidy = Boolean(ctx.message) && settings.dropDeleteCommand;
    if (!tidy) {
      await replyFields(ctx, embed);
      return;
    }

    const { title, description, ...rest } = embed;
    await replyDetached(ctx, description, { title, ...rest });
    await deleteInvokingMessage(ctx);
  }
}
