import { Command, Declare, Options, SubCommand, createStringOption } from 'seyfert';
import type { AutocompleteInteraction } from 'seyfert';
import { PermissionFlagsBits } from 'seyfert/lib/types/index.js';
import { env } from '../../config/env.js';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { reply, replyFields, replyList, mention } from '../shared.js';
import type { AppContainer } from '../../app/container.js';
import type { MessagePayload } from '../../modules/trivia/types.js';

@Declare({
  name: 'start',
  description: 'Start a trivia game in this channel',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  list: createStringOption({
    description: 'Name of the trivia list to play',
    required: true,
    autocomplete(interaction: AutocompleteInteraction) {
      const app: AppContainer = (interaction.client as any).__app;
      const focused = (interaction as any).getInput?.() ?? '';
      const lists = app.triviaService.getAvailableLists();
      const choices = lists
        .filter((l) => l.name.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25)
        .map((l) => ({ name: `${l.name} (${l.questionCount}q)`, value: l.name }));
      return interaction.respond(choices);
    }
  })
})
class TriviaStartSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Trivia can only be played in a server.');
      return;
    }

    const listName = String(ctx.options.list ?? '').toLowerCase();
    const app: AppContainer = ctx.app;

    const sendMessage = async (channelId: string, payload: MessagePayload) => {
      await ctx.client.messages.write(channelId, payload);
    };

    const settings = app.guildSettingsService.getEffectiveSettings(ctx.guildId);

    const result = app.triviaService.startGame(
      ctx.channelId,
      ctx.guildId,
      ctx.author.id,
      listName,
      {
        maxScore: settings.triviaMaxScore,
        delaySeconds: settings.triviaDelaySeconds,
        timeoutSeconds: env.TRIVIA_TIMEOUT_SECONDS,
        revealAnswer: settings.triviaRevealAnswer,
        botPlays: env.TRIVIA_BOT_PLAYS
      },
      sendMessage
    );

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    let rewardNote = settings.triviaRequireMultiplePlayers
      ? 'Rewards require 2+ players. Earnings are paid at game end.'
      : 'Earnings are paid at game end.';

    if (result.isIslamic) {
      rewardNote += `\n\n\uD83D\uDD4C **Islamic Knowledge Bonus:** All rewards are multiplied by **${result.bonusMultiplier}x** for this list!`;
    }

    const perCorrectDisplay = result.isIslamic
      ? `${formatCurrency(Math.floor(settings.triviaRewardPerCorrect * result.bonusMultiplier))} (${result.bonusMultiplier}x)`
      : formatCurrency(settings.triviaRewardPerCorrect);
    const winBonusDisplay = result.isIslamic
      ? `${formatCurrency(Math.floor(settings.triviaWinBonus * result.bonusMultiplier))} (${result.bonusMultiplier}x)`
      : formatCurrency(settings.triviaWinBonus);

    await replyFields(ctx, {
      title: 'Trivia Started',
      tone: 'success',
      fields: [
        { name: 'List', value: listName, inline: true },
        { name: 'Questions', value: `${result.questionCount}`, inline: true },
        { name: 'Win Score', value: `${settings.triviaMaxScore}`, inline: true },
        { name: 'Answer Time', value: `${settings.triviaDelaySeconds}s`, inline: true },
        { name: 'Per Correct', value: perCorrectDisplay, inline: true },
        { name: 'Win Bonus', value: winBonusDisplay, inline: true }
      ],
      description: rewardNote,
      compact: true
    });
  }
}

@Declare({
  name: 'stop',
  description: 'Stop the current trivia game',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
class TriviaStopSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const app: AppContainer = ctx.app;

    const memberRoles: string[] = Array.isArray(ctx.member?.roles)
      ? ctx.member.roles
      : [];
    const isAdmin = app.accessService.isAdmin(ctx.author.id, ctx.guildId, memberRoles);

    let hasManageGuild = false;
    if (ctx.member?.permissions && typeof ctx.member.permissions.has === 'function') {
      hasManageGuild =
        ctx.member.permissions.has([PermissionFlagsBits.Administrator]) ||
        ctx.member.permissions.has([PermissionFlagsBits.ManageGuild]);
    }

    const isPrivileged = isAdmin || hasManageGuild;
    const result = app.triviaService.stopGame(ctx.channelId, ctx.author.id, isPrivileged);

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    await reply(
      ctx,
      `Game stopped.\n\n${result.scoreboard}`,
      { title: 'Trivia Stopped', tone: 'warning', compact: true }
    );
  }
}

@Declare({
  name: 'list',
  description: 'Show available trivia lists',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
class TriviaListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const app: AppContainer = ctx.app;
    const lists = app.triviaService.getAvailableLists();

    if (lists.length === 0) {
      await reply(ctx, 'No trivia lists available.');
      return;
    }

    const lines = lists.map((l) => `**${l.name}** • ${l.questionCount} questions`);
    await replyList(ctx, {
      title: 'Trivia Lists',
      lines,
      compact: true
    });
  }
}

const RANK_MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

@Declare({
  name: 'leaderboard',
  description: 'Show trivia leaderboard for this server',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  list: createStringOption({
    description: 'Filter by trivia list name (optional)',
    required: false
  })
})
class TriviaLeaderboardSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Trivia leaderboard is only available in a server.');
      return;
    }

    const app: AppContainer = ctx.app;
    const listName = ctx.options.list ? String(ctx.options.list).toLowerCase() : undefined;
    const rows = app.triviaService.getLeaderboard(ctx.guildId, listName);

    if (rows.length === 0) {
      await reply(ctx, 'No trivia stats recorded yet for this server.');
      return;
    }

    const lines = rows.map((r, i) => {
      const medal = RANK_MEDALS[i] ?? `#${i + 1}`;
      const winRate = r.total_games > 0 ? Math.round((r.total_wins / r.total_games) * 100) : 0;
      return `${medal} ${mention(r.discord_user_id)}\nWins: ${r.total_wins} • Correct: ${r.total_correct} • Games: ${r.total_games} • Win Rate: ${winRate}%`;
    });

    const title = listName
      ? `Trivia Leaderboard \u2014 ${listName}`
      : 'Trivia Leaderboard \u2014 All Lists';

    await replyList(ctx, {
      title,
      lines,
      footer: `Top ${rows.length} players`,
      compact: true
    });
  }
}

@Declare({
  name: 'trivia',
  description: 'Trivia game commands',
  aliases: ['t'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options([TriviaStartSubCommand, TriviaStopSubCommand, TriviaListSubCommand, TriviaLeaderboardSubCommand])
export default class TriviaCommand extends Command {}
