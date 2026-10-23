import { createEvent } from 'seyfert';
import { logger } from '../infra/logging/logger.js';
import { formatCurrency } from '../infra/discord/formatting.js';
import type { AppContainer } from '../app/container.js';
import type { MessagePayload } from '../modules/trivia/types.js';

const IS_VOICE_MESSAGE = 1 << 13;

export default createEvent({
  data: {
    name: 'messageCreate',
    once: false
  },
  run: async (message, client) => {
    try {
      if (message.author.bot) return;
      if (!message.guildId) return;

      const ctxFn = (client as any).options?.context ?? (client as any).context;
      const ctx = typeof ctxFn === 'function' ? (ctxFn() as { app?: AppContainer }) : undefined;
      const app = ctx?.app;
      if (!app) return;

      // Track guild presence for leaderboard filtering
      try {
        app.identityRepo.trackGuildPresence(message.author.id, message.guildId);
      } catch {
        // non-critical
      }

      const channelId = message.channelId;
      const content = (message.content ?? '').trim();
      logger.debug({ channelId, contentLength: content.length }, 'messageCreate hit');

      const sendMessage = async (chId: string, payload: MessagePayload) => {
        await client.messages.write(chId, payload);
      };

      // Trivia answer handling
      if (app.triviaService.hasActiveSession(channelId)) {
        logger.debug({ channelId }, 'trivia active, checking answer');
        await app.triviaService.handleMessage(
          channelId,
          message.author.id,
          {
            discordUserId: message.author.id,
            username: message.author.username
          },
          content,
          sendMessage
        );
      }

      // Hangman guess handling (single letter or full word)
      if (app.hangmanService.hasActiveSession(channelId) && /^[A-Za-z]+$/.test(content)) {
        const send = async (chId: string, payload: any) => client.messages.write(chId, payload);
        const edit = async (chId: string, msgId: string, payload: any) =>
          (client as any).messages.edit(chId, msgId, payload);
        await app.hangmanService.handleMessage(channelId, content, send, edit);
      }

      // Connect 4 resign handling (.c4stop / .c4resign / .resign)
      if (
        app.connect4Service.hasActiveSession(channelId) &&
        /^\.?(c4stop|c4resign|resign)$/i.test(content)
      ) {
        const session = app.connect4Service.getSession(channelId);
        if (session) {
          const isPlayer =
            message.author.id === session.player1.id || message.author.id === session.player2.id;
          if (isPlayer) {
            const loser =
              message.author.id === session.player1.id ? session.player1 : session.player2;
            const winner =
              message.author.id === session.player1.id ? session.player2 : session.player1;
            app.connect4Service.forceEnd(channelId);
            const editFn = (session as any).__edit as
              | ((chId: string, msgId: string, payload: any) => Promise<void>)
              | undefined;
            if (editFn && session.messageId) {
              try {
                const embed = app.connect4Service.buildEmbed(session, 'resign', winner, loser);
                await editFn(channelId, session.messageId, embed);
              } catch {
                await client.messages.write(channelId, {
                  content: `🏳️ **${loser.username}** resigned! **${winner.username}** wins.`
                });
              }
            }
          }
        }
      }

      // Connect 4 column input handling (1–7)
      if (app.connect4Service.hasActiveSession(channelId) && /^[1-7]$/.test(content)) {
        const col = parseInt(content, 10) - 1;
        const session = app.connect4Service.getSession(channelId);
        if (!session) return;

        const result = app.connect4Service.playColumn(channelId, message.author.id, col);
        if (!result.ok) return;

        const edit = (session as any).__edit as
          | ((chId: string, msgId: string, payload: any) => Promise<void>)
          | undefined;

        let embed: { embeds: any[] };
        if (result.result === 'win') {
          const winner =
            result.session.currentTurn === 1 ? result.session.player1 : result.session.player2;
          embed = app.connect4Service.buildEmbed(result.session, 'win', winner);
        } else if (result.result === 'draw') {
          embed = app.connect4Service.buildEmbed(result.session, 'draw');
        } else {
          embed = app.connect4Service.buildEmbed(result.session, 'playing');
        }

        if (edit && result.session.messageId) {
          try {
            await edit(channelId, result.session.messageId, embed);
          } catch {
            const msg = await client.messages.write(channelId, embed as any);
            if ((msg as any)?.id) result.session.messageId = (msg as any).id;
          }
        } else {
          const msg = await client.messages.write(channelId, embed as any);
          if ((msg as any)?.id) result.session.messageId = (msg as any).id;
        }
      }
      // Daily challenge voice note detection
      const isVoiceNote = ((message as any).flags ?? 0) & IS_VOICE_MESSAGE;
      if (isVoiceNote) {
        const challengeResult = app.challengeService.completeChallenge(
          { discordUserId: message.author.id, username: message.author.username },
          channelId
        );
        if (challengeResult.ok) {
          try {
            await client.messages.write(channelId, {
              content: `✅ <@${message.author.id}> completed the daily challenge! **+${formatCurrency(challengeResult.rewardAmount)}** earned. (${challengeResult.completionCount} total completions)`
            });
          } catch (err) {
            logger.warn({ err, channelId }, 'Failed to send challenge completion message');
          }
        } else if (!challengeResult.ok && challengeResult.reason === 'banned') {
          try {
            await client.messages.write(channelId, {
              content: `🚫 <@${message.author.id}>, you are banned from participating in daily challenges.`
            });
          } catch (err) {
            logger.warn({ err, channelId }, 'Failed to send challenge ban message');
          }
        }
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          channelId: message.channelId,
          authorId: message.author?.id
        },
        'messageCreate handler failed'
      );
    }
  }
});
