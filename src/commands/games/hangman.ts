import { Command, Declare, Options, createStringOption } from 'seyfert';
import type { AutocompleteInteraction } from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { reply } from '../shared.js';
import type { AppContainer } from '../../app/container.js';

@Declare({
  name: 'hangman',
  description: 'Play hangman in this channel',
  aliases: ['hm'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  category: createStringOption({
    description: 'Word category (random if not specified)',
    required: false,
    autocomplete(interaction: AutocompleteInteraction) {
      const app: AppContainer = (interaction.client as any).__app;
      const focused = (interaction as any).getInput?.() ?? '';
      const categories = app.hangmanService.getAvailableCategories();
      const choices = categories
        .filter((c) => c.name.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25)
        .map((c) => ({ name: `${c.name} (${c.wordCount} words)`, value: c.name }));
      return interaction.respond(choices);
    }
  }),
  stop: createStringOption({
    description: 'Type "stop" to end the current game',
    required: false
  })
})
export default class HangmanCommand extends Command {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId || !ctx.channelId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const stop = String(ctx.options.stop ?? '').toLowerCase();

    if (stop === 'stop') {
      const isAdmin: boolean = ctx.app.accessService.isAdmin(
        ctx.author.id,
        ctx.guildId,
        Array.isArray(ctx.member?.roles) ? ctx.member.roles : []
      );
      const result = ctx.app.hangmanService.stopGame(ctx.channelId, ctx.author.id, isAdmin);
      if (!result.ok) {
        await reply(ctx, result.reason);
        return;
      }
      await reply(ctx, `Game stopped. The word was **${result.word}**.`, { tone: 'warning' });
      return;
    }

    const category = ctx.options.category ? String(ctx.options.category).toLowerCase() : undefined;

    const result = ctx.app.hangmanService.startGame(ctx.channelId, ctx.guildId, ctx.author.id, category);
    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    const { session } = result;
    const embed = ctx.app.hangmanService.getInitialEmbed(session);

    const send = async (channelId: string, payload: any) => {
      return ctx.client.messages.write(channelId, payload);
    };

    const categoryLabel = session.category.charAt(0).toUpperCase() + session.category.slice(1);
    await ctx.editOrReply({
      content: `\uD83C\uDFB4 **Hangman started!** Category: **${categoryLabel}**\nType one letter at a time to guess.`
    });

    const msg = await send(ctx.channelId, embed);
    if (msg?.id) session.messageId = msg.id;
  }
}
