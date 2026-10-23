import {
  Command,
  Declare,
  Options,
  SubCommand,
  createStringOption
} from 'seyfert';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency, progressBar } from '../../infra/discord/formatting.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { replyEphemeral, replyFields, parseAmount } from '../shared.js';

@Declare({
  name: 'deposit',
  description: 'Deposit funds into vault',
  aliases: ['d'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  amount: createStringOption({
    description: 'Amount to deposit (number or "all")',
    required: true
  })
})
class VaultDepositSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    const parsed = parseAmount(ctx.options.amount);
    if (parsed === null) {
      await replyEphemeral(ctx, 'Invalid amount. Provide a positive number or "all".');
      return;
    }

    const amount = parsed === 'all' ? ctx.app.economyService.getBalance(profile) : parsed;
    if (amount <= 0) {
      await replyEphemeral(ctx, 'You have no funds to deposit.');
      return;
    }

    const result = ctx.app.vaultService.deposit(profile, amount);

    if (!result.ok) {
      await replyEphemeral(ctx, result.reason ?? 'Deposit failed.');
      return;
    }

    const newVault = ctx.app.vaultService.getBalance(profile);
    const newWallet = ctx.app.economyService.getBalance(profile);
    const total = newVault + newWallet;

    await replyFields(ctx, {
      title: 'Vault Deposit',
      tone: 'success',
      description: total > 0 ? `Vault share: ${progressBar(newVault, total, 12)}` : undefined,
      fields: [
        { name: 'Deposited', value: formatCurrency(amount), inline: true },
        { name: 'Vault', value: formatCurrency(newVault), inline: true },
        { name: 'Wallet', value: formatCurrency(newWallet), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'withdraw',
  description: 'Withdraw funds from vault',
  aliases: ['w'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  amount: createStringOption({
    description: 'Amount to withdraw (number or "all")',
    required: true
  })
})
class VaultWithdrawSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    const parsed = parseAmount(ctx.options.amount);
    if (parsed === null) {
      await replyEphemeral(ctx, 'Invalid amount. Provide a positive number or "all".');
      return;
    }

    const amount = parsed === 'all' ? ctx.app.vaultService.getBalance(profile) : parsed;
    if (amount <= 0) {
      await replyEphemeral(ctx, 'Your vault is empty.');
      return;
    }

    const result = ctx.app.vaultService.withdraw(profile, amount);

    if (!result.ok) {
      await replyEphemeral(ctx, result.reason ?? 'Withdraw failed.');
      return;
    }

    const newVault = ctx.app.vaultService.getBalance(profile);
    const newWallet = ctx.app.economyService.getBalance(profile);
    const total = newVault + newWallet;

    await replyFields(ctx, {
      title: 'Vault Withdrawal',
      tone: 'success',
      description: total > 0 ? `Vault share: ${progressBar(newVault, total, 12)}` : undefined,
      fields: [
        { name: 'Withdrawn', value: formatCurrency(amount), inline: true },
        { name: 'Vault', value: formatCurrency(newVault), inline: true },
        { name: 'Wallet', value: formatCurrency(newWallet), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'balance',
  description: 'Show vault balance',
  aliases: ['b', 'bal'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
class VaultBalanceSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    const vaultBalance = ctx.app.vaultService.getBalance(profile);
    const walletBalance = ctx.app.economyService.getBalance(profile);
    const totalWealth = walletBalance + vaultBalance;

    const vaultBar = progressBar(vaultBalance, totalWealth, 12);

    await replyFields(ctx, {
      title: 'Vault Balance',
      description: totalWealth > 0 ? `Vault share: ${vaultBar}` : undefined,
      fields: [
        { name: 'Vault', value: formatCurrency(vaultBalance), inline: true },
        { name: 'Wallet', value: formatCurrency(walletBalance), inline: true },
        { name: 'Total Wealth', value: formatCurrency(totalWealth), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'vault',
  description: 'Vault account commands',
  aliases: ['v', 'bank'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options([VaultDepositSubCommand, VaultWithdrawSubCommand, VaultBalanceSubCommand])
export default class VaultCommand extends Command {}
