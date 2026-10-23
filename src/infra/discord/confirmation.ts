import { ActionRow, Button } from 'seyfert';
import { ButtonStyle } from 'seyfert/lib/types/index.js';

const BUTTON_CONFIRM = 'confirm_yes';
const BUTTON_CANCEL = 'confirm_no';
const DEFAULT_TIMEOUT_MS = 60 * 1000;

export interface ConfirmationOptions {
  ctx: any;
  responseMessage: any;
  ownerUserId: string;
  onConfirm: (interaction: any) => Promise<void>;
  onCancel?: (interaction: any) => Promise<void>;
  timeoutMs?: number;
}

export function buildConfirmationComponents(): any[] {
  return [
    new ActionRow<Button>().addComponents(
      new Button()
        .setCustomId(BUTTON_CONFIRM)
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Success),
      new Button()
        .setCustomId(BUTTON_CANCEL)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    )
  ];
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

export function attachConfirmationCollector(options: ConfirmationOptions): void {
  const messageId = getResponseMessageId(options.responseMessage);
  if (!messageId) {
    return;
  }

  const channelId = getResponseChannelId(options.responseMessage, options.ctx.channelId);
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let handled = false;

  const collector = options.ctx.client.components.createComponentCollector(
    messageId,
    channelId,
    options.ctx.guildId,
    {
      timeout,
      idle: timeout,
      filter: (interaction: any) => interaction.user?.id === options.ownerUserId,
      onPass: async (interaction: any) => {
        await interaction.write({
          content: 'Only the user who ran this command can use these buttons.',
          flags: 64
        });
      },
      onError: async (interaction: any, error: unknown) => {
        options.ctx.app?.logger?.warn?.(
          {
            messageId,
            customId: interaction.customId,
            error: error instanceof Error ? error.message : String(error)
          },
          'Confirmation button callback failed'
        );

        try {
          await interaction.write({
            content: 'Something went wrong. Please run the command again.',
            flags: 64
          });
        } catch {
          // Ignore follow-up failure for expired interactions.
        }
      }
    }
  );

  collector.run(BUTTON_CONFIRM, async (interaction: any, stop: () => void) => {
    if (handled) return;
    handled = true;
    stop();
    await options.onConfirm(interaction);
  });

  collector.run(BUTTON_CANCEL, async (interaction: any, stop: () => void) => {
    if (handled) return;
    handled = true;
    stop();
    if (options.onCancel) {
      await options.onCancel(interaction);
    } else {
      await interaction.update({
        embeds: [
          {
            title: 'Cancelled',
            description: 'Action cancelled.',
            color: 0x4b5563
          }
        ],
        components: []
      });
    }
  });
}
