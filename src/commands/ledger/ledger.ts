import {
  Command,
  Declare,
  Options,
  SubCommand,
  createIntegerOption
} from 'seyfert';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import {
  attachPaginationCollector,
  buildPaginationComponents,
  resolveRequestedPage
} from '../../infra/discord/pagination.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { buildReplyPayload, mention, reply } from '../shared.js';

const LEDGER_PAGE_SIZE = 10;

function buildLedgerFields(rows: any[]): Array<{ name: string; value: string; inline: boolean }> {
  return rows.map((tx: any) => {
    const direction = tx.amount >= 0 ? '+' : '-';
    const amount = formatCurrency(Math.abs(tx.amount));
    const subtype = tx.subtype ? `/${tx.subtype}` : '';
    return {
      name: `#${tx.id} • ${tx.kind}${subtype}`,
      value: `${direction}${amount}\n${tx.createdAt}`,
      inline: true
    };
  });
}

@Declare({
  name: 'recent',
  description: 'Show recent ledger transactions',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  page: createIntegerOption({
    description: 'Ledger page',
    required: false,
    min_value: 1
  })
})
class LedgerRecentSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    const fetchPage = (page: number) => {
      const rows = ctx.app.ledgerService.getRecentTransactionsByDiscordId(profile.discordUserId, page, LEDGER_PAGE_SIZE);
      const nextRows = ctx.app.ledgerService.getRecentTransactionsByDiscordId(
        profile.discordUserId,
        page + 1,
        LEDGER_PAGE_SIZE
      );
      return { rows, hasNext: nextRows.length > 0 };
    };

    let currentPage = resolveRequestedPage(ctx, ctx.options.page);
    let current = fetchPage(currentPage);
    if (current.rows.length === 0) {
      await reply(ctx, 'No transactions found.');
      return;
    }

    const renderPayload = (rows: any[], page: number, hasNext: boolean) =>
      buildReplyPayload({
        fullCommandName: 'ledger recent',
        requesterName: ctx.author.username ?? 'user',
        content: '',
        options: {
          title: 'Recent Ledger Entries',
          fields: buildLedgerFields(rows),
          footer: `Page ${page}`,
          compact: true,
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
  name: 'detail',
  description: 'Show details for a single ledger transaction',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  id: createIntegerOption({
    description: 'Transaction id',
    required: true,
    min_value: 1
  })
})
class LedgerDetailSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const txId = Number(ctx.options.id ?? 0);
    const profile = profileFromContext(ctx);
    const tx = ctx.app.ledgerService.getTransactionByDiscordIdAndTxId(profile.discordUserId, txId);

    if (!tx) {
      await reply(ctx, 'Transaction not found.');
      return;
    }

    const other = tx.otherUserId ? ctx.app.identityRepo.getUserById(tx.otherUserId) : undefined;
    const otherLine = other ? `\nCounterparty: ${mention(other.discordUserId)}` : '';

    await reply(
      ctx,
      [
        `**Transaction #${tx.id}**`,
        `Amount: ${tx.amount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(tx.amount))}`,
        `Type: ${tx.kind}${tx.subtype ? `/${tx.subtype}` : ''}`,
        `Note: ${tx.note ?? 'n/a'}`,
        `Legacy: ${tx.legacyType ?? 'n/a'}`,
        `Created: ${tx.createdAt}`,
        otherLine.trim()
      ]
        .filter(Boolean)
        .join('\n'),
      { title: 'Ledger Transaction Details', compact: true }
    );
  }
}

@Declare({
  name: 'ledger',
  description: 'Inspect wallet transaction ledger',
  aliases: ['tx'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options([LedgerRecentSubCommand, LedgerDetailSubCommand])
export default class LedgerCommand extends Command {}
