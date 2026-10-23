import { Command, Declare } from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { replyFields } from '../shared.js';

@Declare({
  name: 'games',
  description: 'List available games',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
export default class GamesCommand extends Command {
  override async run(ctx: any): Promise<void> {
    await replyFields(ctx, {
      title: 'Available Games',
      tone: 'info',
      fields: [
        {
          name: '🎴 Hangman',
          value: '`.hangman` / `.hm` — Guess letters to reveal the word. Type single letters in chat to guess.',
          inline: false
        },
        {
          name: '🏁 Race',
          value: '`.race` — Start an animal race. Others join with `.joinrace` / `.jr`. Race begins after 30s.',
          inline: false
        },
        {
          name: '🔵 Connect 4',
          value: '`.connect4 @user` / `.c4 @user` — Challenge someone. Type 1–7 in chat to drop a piece.',
          inline: false
        }
      ],
      compact: true
    });
  }
}
