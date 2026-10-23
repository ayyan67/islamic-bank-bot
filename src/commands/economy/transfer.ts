import {
  Command,
  Declare,
  Options,
  createStringOption,
  createUserOption
} from 'seyfert';
import { replyEphemeral, mention, buildReplyPayload, parseAmount, TRAILING_AMOUNT_RE } from '../shared.js';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { profileFromContext, profileFromUnknown } from '../../infra/discord/profile.js';
import {
  buildConfirmationComponents,
  attachConfirmationCollector
} from '../../infra/discord/confirmation.js';

const TRANSFER_CONFIRM_THRESHOLD = 1000;

@Declare({
  name: 'transfer',
  description: 'Transfer wallet funds to another user',
  aliases: ['pay', 'send', 'give'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  user: createUserOption({
    description: 'User to transfer funds to',
    required: true
  }),
  amount: createStringOption({
    description: 'Transfer amount (number, 500k, 1.5m, or "all")',
    required: false
  })
})
export default class TransferCommand extends Command {
  override async run(ctx: any): Promise<void> {
    let userRaw: unknown = ctx.options.user;
    let amountRaw: unknown = ctx.options.amount;

    // Prefix fallback: Seyfert resolves the mention to a GuildMember but
    // drops any trailing tokens (e.g. "500" in ".give @Rio 500").
    // Read the amount from the raw message content when it's missing.
    if (!amountRaw && ctx.message?.content) {
      const raw = String(ctx.message.content).trim();
      const match = raw.match(TRAILING_AMOUNT_RE);
      if (match?.[1]) amountRaw = match[1];
    }

    // Also handle the case where Seyfert didn't resolve the mention and
    // passed a raw string like "<@123> 500" as the user value.
    if (typeof userRaw === 'string' && !amountRaw) {
      const parts = userRaw.trim().split(/\s+/);
      if (parts.length >= 2) {
        const last = parts[parts.length - 1] ?? '';
        if (parseAmount(last) !== null) {
          amountRaw = last;
          userRaw = parts.slice(0, -1).join(' ');
        }
      }
    }

    const target = profileFromUnknown(userRaw);
    if (!target) {
      await replyEphemeral(ctx, 'Unable to resolve the target user.');
      return;
    }

    const profile = profileFromContext(ctx);
    const parsed = parseAmount(amountRaw);
    if (parsed === null) {
      await replyEphemeral(ctx, 'Invalid amount. Provide a positive number or "all".');
      return;
    }

    const amount = parsed === 'all' ? ctx.app.economyService.getBalance(profile) : parsed;
    if (amount <= 0) {
      await replyEphemeral(ctx, 'You have no funds to transfer.');
      return;
    }

    // Small transfers execute immediately
    if (amount < TRANSFER_CONFIRM_THRESHOLD) {
      await this.executeTransfer(ctx, profile, target, amount);
      return;
    }

    // Large transfers require confirmation
    const confirmPayload = buildReplyPayload({
      fullCommandName: 'transfer',
      requesterName: ctx.author.username ?? 'user',
      content: `Are you sure you want to transfer **${formatCurrency(amount)}** to ${mention(target.discordUserId)}?`,
      options: {
        title: 'Confirm Transfer',
        tone: 'warning',
        compact: true,
        components: buildConfirmationComponents()
      }
    });

    const response = await ctx.editOrReply(confirmPayload, true);
    if (!response) return;

    attachConfirmationCollector({
      ctx,
      responseMessage: response,
      ownerUserId: ctx.author.id,
      onConfirm: async (interaction) => {
        await this.executeTransfer(ctx, profile, target, amount, interaction);
      }
    });
  }

  private async executeTransfer(
    ctx: any,
    profile: any,
    target: any,
    amount: number,
    interaction?: any
  ): Promise<void> {
    const result = ctx.app.economyService.transfer(profile, target, amount, {
      guildId: ctx.guildId ?? null,
      sourceChannelId: ctx.channelId ?? null
    });
    if (!result.ok) {
      const errorPayload = buildReplyPayload({
        fullCommandName: 'transfer',
        requesterName: ctx.author.username ?? 'user',
        content: result.reason ?? 'Transfer failed.',
        options: { tone: 'error', compact: true }
      });
      errorPayload.components = [];

      if (interaction) {
        await interaction.update(errorPayload);
      } else {
        await ctx.editOrReply(errorPayload);
      }
      return;
    }

    const successPayload = buildReplyPayload({
      fullCommandName: 'transfer',
      requesterName: ctx.author.username ?? 'user',
      content: '',
      options: {
        title: 'Transfer Complete',
        tone: 'success',
        fields: [
          { name: 'Recipient', value: mention(target.discordUserId), inline: true },
          { name: 'Amount', value: formatCurrency(amount), inline: true }
        ],
        compact: true
      }
    });
    successPayload.components = [];

    if (interaction) {
      await interaction.update(successPayload);
    } else {
      await ctx.editOrReply(successPayload);
    }
  }
}
