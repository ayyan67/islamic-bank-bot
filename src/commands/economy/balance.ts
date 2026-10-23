import { Command, Declare, Options, createUserOption } from 'seyfert';
import { avatarUrl, replyFields } from '../shared.js';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { profileFromContext, profileFromUnknown } from '../../infra/discord/profile.js';

@Declare({
  name: 'balance',
  description: 'Show your wallet balance, or another user\'s',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL],
  aliases: ['bal', 'b', '$']
})
@Options({
  user: createUserOption({
    description: 'User to look up (defaults to you)',
    required: false
  })
})
export default class BalanceCommand extends Command {
  override async run(ctx: any): Promise<void> {
    let userRaw: unknown = ctx.options.user;

    // Prefix fallback: `.$ @user` arrives as raw content, not a resolved option.
    if (!userRaw && ctx.message?.content) {
      const mentionMatch = String(ctx.message.content).match(/<@!?\d+>/);
      if (mentionMatch) userRaw = mentionMatch[0];
    }

    const target = userRaw ? profileFromUnknown(userRaw) : null;

    if (target && target.discordUserId !== ctx.author.id) {
      const balance = ctx.app.economyService.getBalance(target);
      const settings = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
      const fields = [{ name: 'Wallet', value: formatCurrency(balance), inline: true }];
      if (!settings.vaultPrivate) {
        const vault = ctx.app.vaultService.getBalance(target);
        fields.push({ name: 'Vault', value: formatCurrency(vault), inline: true });
      }
      await replyFields(ctx, {
        title: `${target.username ?? 'User'}'s Balance`,
        fields,
        compact: true,
        thumbnail: avatarUrl(ctx.options.user) ?? avatarUrl(target)
      });
      return;
    }

    const balance = ctx.app.economyService.getBalance(profileFromContext(ctx));
    await replyFields(ctx, {
      title: 'Wallet Balance',
      fields: [
        {
          name: 'Available',
          value: formatCurrency(balance),
          inline: true
        }
      ],
      compact: true,
      thumbnail: avatarUrl(ctx.author)
    });
  }
}
