import { Command, Declare } from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { reply } from '../shared.js';

@Declare({
  name: 'race',
  description: 'Start an animal race — others can join with /joinrace',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
export default class RaceCommand extends Command {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId || !ctx.channelId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const profile = profileFromContext(ctx);
    const result = ctx.app.raceService.startRace(
      ctx.channelId,
      ctx.guildId,
      profile.discordUserId,
      profile.username ?? ctx.author.username
    );

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    const { session } = result;
    const hostRacer = session.racers.get(profile.discordUserId)!;

    await ctx.editOrReply({
      content: `🏁 **Race starting!** ${hostRacer.animal} **${profile.username ?? ctx.author.username}** has entered the race!\n\nType \`.joinrace\` to join. Race begins in **30 seconds** or when full!`
    });

    // Wait for join window then run the race
    setTimeout(async () => {
      try {
        if (!ctx.app.raceService.hasOpenSession(ctx.channelId)) return;

        const send = async (channelId: string, payload: { content: string }) =>
          ctx.client.messages.write(channelId, payload);
        const edit = async (channelId: string, messageId: string, payload: { content: string }) =>
          ctx.client.messages.edit(channelId, messageId, payload);

        await ctx.app.raceService.runRace(ctx.channelId, send, edit);
      } catch (err) {
        ctx.app.logger.warn({ err }, 'Race run failed');
      }
    }, result.session.joinWindowMs);
  }
}
