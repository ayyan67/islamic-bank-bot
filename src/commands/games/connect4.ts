import { Command, Declare, Options, createUserOption } from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { reply } from '../shared.js';

@Declare({
  name: 'connect4',
  description: 'Challenge someone to Connect 4',
  aliases: ['c4'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  opponent: createUserOption({
    description: 'The user to challenge',
    required: true
  })
})
export default class Connect4Command extends Command {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId || !ctx.channelId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const profile = profileFromContext(ctx);
    const opponent = ctx.options.opponent;
    if (!opponent?.id) {
      await reply(ctx, 'Could not resolve opponent.');
      return;
    }
    if (opponent.bot) {
      await reply(ctx, "You can't challenge a bot to Connect 4.");
      return;
    }

    const p1 = { id: profile.discordUserId, username: profile.username ?? ctx.author.username };
    const p2 = { id: opponent.id, username: opponent.username ?? 'Opponent' };

    const edit = async (channelId: string, messageId: string, payload: any) =>
      ctx.client.messages.edit(channelId, messageId, payload);

    const onTimeout = async (session: any) => {
      const timedOut = session.currentTurn === 1 ? session.player1 : session.player2;
      const winner = session.currentTurn === 1 ? session.player2 : session.player1;
      ctx.app.connect4Service.forceEnd(session.channelId);
      const editFn: typeof edit = (session as any).__edit ?? edit;
      if (session.messageId) {
        try {
          const embed = ctx.app.connect4Service.buildEmbed(session, 'timeout', winner, timedOut);
          await editFn(session.channelId, session.messageId, embed);
        } catch {
          // Channel may be unavailable
        }
      }
    };

    const result = ctx.app.connect4Service.startGame(ctx.channelId, ctx.guildId, p1, p2, onTimeout);
    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    const { session } = result;
    const embed = ctx.app.connect4Service.buildEmbed(session, 'playing');

    // Send initial embed as the slash command reply and capture its message ID
    const msg = await ctx.editOrReply(embed, true);
    if (msg?.id) session.messageId = msg.id;

    // Store edit function for use in messageCreate handler
    (session as any).__edit = edit;
  }
}
