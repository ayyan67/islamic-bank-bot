import { Command, Declare, Options, SubCommand, createIntegerOption, createStringOption } from 'seyfert';
import { avatarUrl, reply, buildReplyPayload, replyFields } from '../shared.js';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import {
  attachPaginationCollector,
  buildPaginationComponents,
  resolveRequestedPage
} from '../../infra/discord/pagination.js';

const LEADERBOARD_PAGE_SIZE = 10;

function buildLeaderboardFields(rows: any[], page: number): Array<{ name: string; value: string; inline: boolean }> {
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return rows.map((row: any, index: number) => {
    const rank = (page - 1) * LEADERBOARD_PAGE_SIZE + index + 1;
    const medal = medals[rank] ? `${medals[rank]} ` : '';
    return {
      name: `${medal}#${rank} · ${row.username}`,
      value: formatCurrency(row.balance),
      inline: true
    };
  });
}

@Declare({
  name: 'wealth',
  description: 'Show wallet leaderboard',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  page: createIntegerOption({
    description: 'Leaderboard page',
    required: false,
    min_value: 1
  })
})
class WealthSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const guildId = ctx.guildId ?? undefined;
    const fetchPage = (page: number) => {
      const rows = ctx.app.economyService.getLeaderboard(page, LEADERBOARD_PAGE_SIZE, guildId);
      const nextRows = ctx.app.economyService.getLeaderboard(page + 1, LEADERBOARD_PAGE_SIZE, guildId);
      return { rows, hasNext: nextRows.length > 0 };
    };

    let currentPage = resolveRequestedPage(ctx, ctx.options.page);
    let current = fetchPage(currentPage);
    if (current.rows.length === 0) {
      await reply(ctx, 'No leaderboard data yet.');
      return;
    }

    const renderPayload = (rows: any[], page: number, hasNext: boolean) =>
      buildReplyPayload({
        fullCommandName: 'leaderboard wealth',
        requesterName: ctx.author.username ?? 'user',
        content: '',
        options: {
          title: 'Wealth Leaderboard',
          fields: buildLeaderboardFields(rows, page),
          footer: `Page ${page}`,
          compact: true,
          // Crown the current #1 with their avatar
          thumbnail: page === 1 && rows[0] ? avatarUrl(rows[0]) : undefined,
          components:
            page > 1 || hasNext ? buildPaginationComponents(page > 1, hasNext) : undefined
        }
      });

    const response = await ctx.editOrReply(
      renderPayload(current.rows, currentPage, current.hasNext),
      currentPage > 1 || current.hasNext ? true : undefined
    );

    if (!(currentPage > 1 || current.hasNext) || !response) {
      return;
    }

    attachPaginationCollector({
      ctx,
      responseMessage: response,
      ownerUserId: ctx.author.id,
      getCurrentPage: () => currentPage,
      onPageRequested: async (requestedPage, interaction) => {
        if (requestedPage < 1) {
          await interaction.deferUpdate();
          return;
        }

        const nextPage = fetchPage(requestedPage);
        if (nextPage.rows.length === 0) {
          await interaction.deferUpdate();
          return;
        }

        currentPage = requestedPage;
        current = nextPage;
        await interaction.update(renderPayload(current.rows, currentPage, current.hasNext));
      }
    });
  }
}

@Declare({
  name: 'streaks',
  description: 'Top active claim streaks',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  type: createStringOption({
    description: 'Which streak to rank',
    required: false,
    choices: [
      { name: 'Timely', value: 'timely' },
      { name: 'Prayer', value: 'prayer' }
    ]
  })
})
class StreaksSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const kind = ctx.options.type === 'prayer' ? 'prayer' : 'timely';
    const rows = ctx.app.worshipService.getStreakLeaderboard(kind, 10, ctx.guildId ?? null);

    if (rows.length === 0) {
      await reply(ctx, 'No active streaks yet — claim daily to start one!');
      return;
    }

    const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const fields = rows.map((row: any, index: number) => {
      const rank = index + 1;
      const medal = medals[rank] ? `${medals[rank]} ` : '';
      return {
        name: `${medal}#${rank} · ${row.username}`,
        value: kind === 'timely'
          ? `🔥 ${row.count} in a row (best: ${row.best})`
          : `🔥 ${row.count} day${row.count === 1 ? '' : 's'} (best: ${row.best})`,
        inline: true
      };
    });

    await replyFields(ctx, {
      title: `${kind === 'timely' ? 'Timely' : 'Prayer'} Streak Leaderboard`,
      fields,
      footer:
        kind === 'timely'
          ? 'Consecutive claims without missing a window · +5% per claim, up to +50%'
          : 'Consecutive UTC days · +5%/day bonus, up to +50%',
      compact: true
    });
  }
}

@Declare({
  name: 'leaderboard',
  description: 'View leaderboards',
  aliases: ['lb', 'top'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options([WealthSubCommand, StreaksSubCommand])
export default class LeaderboardCommand extends Command {}
