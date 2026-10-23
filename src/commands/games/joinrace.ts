import { Command, Declare } from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { reply } from '../shared.js';

@Declare({
  name: 'joinrace',
  description: 'Join the current race in this channel',
  aliases: ['jr'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
export default class JoinRaceCommand extends Command {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId || !ctx.channelId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const profile = profileFromContext(ctx);
    const result = ctx.app.raceService.joinRace(
      ctx.channelId,
      profile.discordUserId,
      profile.username ?? ctx.author.username
    );

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    await ctx.editOrReply({
      content: `${result.animal} **${profile.username ?? ctx.author.username}** has joined the race! 🏁`
    });
  }
}
