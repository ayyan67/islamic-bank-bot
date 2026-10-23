import { ActionRow, Button } from 'seyfert';
import { ButtonStyle } from 'seyfert/lib/types/index.js';

const BUTTON_PREVIOUS = 'pagination_prev';
const BUTTON_NEXT = 'pagination_next';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

interface PaginationCollectorOptions {
  ctx: any;
  responseMessage: any;
  ownerUserId: string;
  getCurrentPage: () => number;
  onPageRequested: (page: number, interaction: any) => Promise<void>;
  timeoutMs?: number;
}

function parsePositionalPage(ctx: any): number | null {
  const raw = typeof ctx.message?.content === 'string' ? ctx.message.content.trim() : '';
  if (raw.length === 0) {
    return null;
  }

  const match = raw.match(/(?:^|\s)(\d+)\s*$/);
  const pageRaw = match?.[1];
  if (!pageRaw) {
    return null;
  }

  const page = Number(pageRaw);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

function getResponseMessageId(responseMessage: any): string | null {
  const id = responseMessage?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function getResponseChannelId(responseMessage: any, fallbackChannelId: string): string {
  if (typeof responseMessage?.channelId === 'string' && responseMessage.channelId.length > 0) {
    return responseMessage.channelId;
  }

  if (typeof responseMessage?.channel_id === 'string' && responseMessage.channel_id.length > 0) {
    return responseMessage.channel_id;
  }

  return fallbackChannelId;
}

export function resolveRequestedPage(ctx: any, pageOption: unknown): number {
  const optionPage = Number(pageOption ?? NaN);
  if (Number.isInteger(optionPage) && optionPage >= 1) {
    return optionPage;
  }

  return parsePositionalPage(ctx) ?? 1;
}

export function buildPaginationComponents(hasPrevious: boolean, hasNext: boolean): any[] {
  return [
    new ActionRow<Button>().addComponents(
      new Button()
        .setCustomId(BUTTON_PREVIOUS)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasPrevious),
      new Button()
        .setCustomId(BUTTON_NEXT)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!hasNext)
    )
  ];
}

export function attachPaginationCollector(options: PaginationCollectorOptions): void {
  const messageId = getResponseMessageId(options.responseMessage);
  if (!messageId) {
    return;
  }

  const channelId = getResponseChannelId(options.responseMessage, options.ctx.channelId);
  const collector = options.ctx.client.components.createComponentCollector(
    messageId,
    channelId,
    options.ctx.guildId,
    {
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      idle: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      filter: (interaction: any) => interaction.user?.id === options.ownerUserId,
      onPass: async (interaction: any) => {
        await interaction.write({
          content: 'Only the user who ran this command can use these buttons.',
          flags: 64
        });
      },
      onError: async (interaction: any, error: unknown) => {
        options.ctx.app.logger.warn(
          {
            messageId,
            customId: interaction.customId,
            error: error instanceof Error ? error.message : String(error)
          },
          'Pagination button callback failed'
        );

        try {
          await interaction.write({
            content: 'Pagination failed. Please run the command again.',
            flags: 64
          });
        } catch {
          // Ignore follow-up failure for expired interactions.
        }
      }
    }
  );

  collector.run(BUTTON_PREVIOUS, async (interaction: any, _stop: any, refresh: () => void) => {
    const currentPage = options.getCurrentPage();
    if (currentPage <= 1) {
      await interaction.deferUpdate();
      return;
    }

    await options.onPageRequested(currentPage - 1, interaction);
    refresh();
  });

  collector.run(BUTTON_NEXT, async (interaction: any, _stop: any, refresh: () => void) => {
    const currentPage = options.getCurrentPage();
    await options.onPageRequested(currentPage + 1, interaction);
    refresh();
  });
}
