import { Declare, ContextMenuCommand } from 'seyfert';
import { ApplicationCommandType } from 'seyfert/lib/types/index.js';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency, progressBar } from '../../infra/discord/formatting.js';
import { profileFromUnknown } from '../../infra/discord/profile.js';
import { avatarUrl, buildReplyPayload } from '../shared.js';

@Declare({
  name: 'View Balance',
  type: ApplicationCommandType.User,
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
export default class ViewBalanceContextMenu extends ContextMenuCommand {
  override async run(ctx: any): Promise<void> {
    const targetUser = ctx.target?.user ?? ctx.target;
    const profile = profileFromUnknown(targetUser);

    if (!profile) {
      await ctx.editOrReply({
        content: 'Unable to resolve user.',
        flags: 64
      });
      return;
    }

    const walletBalance = ctx.app.economyService.getBalance(profile);
    const displayName = profile.username ?? 'Unknown User';

    // Vault balances of other users are hidden when the guild enables privacy.
    const settings = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
    const hideVault = settings.vaultPrivate && profile.discordUserId !== ctx.author?.id;

    const fields = [{ name: 'Wallet', value: formatCurrency(walletBalance), inline: true }];
    let content = '';
    if (!hideVault) {
      const vaultBalance = ctx.app.vaultService.getBalance(profile);
      const totalWealth = walletBalance + vaultBalance;
      const vaultBar = totalWealth > 0 ? progressBar(vaultBalance, totalWealth, 10) : null;
      content = vaultBar ? `Vault share: ${vaultBar}` : '';
      fields.push(
        { name: 'Vault', value: formatCurrency(vaultBalance), inline: true },
        { name: 'Total Wealth', value: formatCurrency(totalWealth), inline: true }
      );
    }

    const payload = buildReplyPayload({
      fullCommandName: 'balance',
      requesterName: ctx.author?.username ?? 'user',
      content,
      options: {
        title: `${displayName}'s Balance`,
        fields,
        compact: true,
        thumbnail: avatarUrl(targetUser)
      }
    });

    await ctx.editOrReply(payload);
  }
}
