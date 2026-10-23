import { Command, Declare } from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { reply, replyFields } from '../shared.js';

@Declare({
  name: 'pick',
  description: 'Pick up dropped currency in the chat',
  aliases: ['p', 'grab', 'claim-drop'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
export default class PickCommand extends Command {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const profile = profileFromContext(ctx);
    const result = ctx.app.dropService.pick(profile, ctx.channelId);

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    await replyFields(ctx, {
      title: 'Currency Picked Up!',
      description: `<@${profile.discordUserId}> picked up ${formatCurrency(result.amount)} dropped by <@${result.dropperDiscordUserId}>!`,
      tone: 'success',
      fields: [
        { name: 'Picked by', value: `<@${profile.discordUserId}>`, inline: true },
        { name: 'Amount', value: formatCurrency(result.amount), inline: true }
      ],
      compact: true
    });
  }
}
