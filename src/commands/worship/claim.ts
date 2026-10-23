import { Command, Declare, Options, SubCommand } from 'seyfert';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCooldown, formatCurrency } from '../../infra/discord/formatting.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import {
  EID_BONUS_AMOUNT,
  EID_BONUS_GREETING,
  EID_BONUS_SUBTYPE,
  EID_GREETING,
  EID_MULTIPLIER,
  isEidEvent
} from '../../infra/utils/time.js';
import { streakBonusPercent } from '../../modules/worship/service.js';
import { reply, replyFields } from '../shared.js';

@Declare({
  name: 'timely',
  description: 'Claim timely reward',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
class TimelySubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const gate = ctx.app.economyScope.canEarn({ guildId: ctx.guildId ?? null, discordUserId: ctx.author.id });
    if (!gate.ok) {
      await reply(ctx, gate.reason);
      return;
    }
    const settings = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
    const eid = isEidEvent();
    const effectiveAmount = eid ? settings.timelyAmount * EID_MULTIPLIER : settings.timelyAmount;
    const result = ctx.app.worshipService.claimTimely(
      profileFromContext(ctx),
      effectiveAmount,
      settings.timelyCooldownHours,
      { guildId: ctx.guildId ?? null, sourceChannelId: ctx.channelId ?? null }
    );

    if (!result.ok) {
      const cooldown =
        typeof result.remainingSeconds === 'number'
          ? ` Cooldown remaining: ${formatCooldown(result.remainingSeconds)}.`
          : '';
      await reply(ctx, `${result.reason ?? 'Unable to claim timely.'}${cooldown}`);
      return;
    }

    const streakPct = streakBonusPercent(result.streak);
    const fields = [
      { name: 'Reward', value: formatCurrency(effectiveAmount), inline: true },
      {
        name: '🔥 Streak',
        value: `${result.streak} in a row${streakPct > 0 ? ` (+${streakPct}%)` : ''}`,
        inline: true
      },
      { name: 'Cooldown', value: `${settings.timelyCooldownHours} hour(s)`, inline: true }
    ];
    if (result.streakBonus > 0) {
      fields.push({ name: 'Streak Bonus', value: `+${formatCurrency(result.streakBonus)}`, inline: true });
      fields.push({ name: 'Total', value: formatCurrency(result.totalAmount), inline: true });
    }
    if (eid) {
      fields.push({ name: 'Event', value: `${EID_MULTIPLIER}x Eid Bonus!`, inline: true });
    }

    const streakHint =
      result.streak === 1
        ? 'Keep claiming every time it\'s ready to build a streak — +5% per claim, up to +50%!'
        : undefined;

    await replyFields(ctx, {
      title: 'Timely Claimed',
      tone: 'success',
      fields,
      description: eid ? EID_GREETING : streakHint,
      compact: true
    });
  }
}

@Declare({
  name: 'eid',
  description: 'Claim one-time Eid al-Fitr bonus',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
class EidSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const gate = ctx.app.economyScope.canEarn({ guildId: ctx.guildId ?? null, discordUserId: ctx.author.id });
    if (!gate.ok) {
      await reply(ctx, gate.reason);
      return;
    }
    if (!isEidEvent()) {
      await reply(ctx, 'The Eid al-Adha event has ended.');
      return;
    }

    const result = ctx.app.worshipService.claimEid(
      profileFromContext(ctx),
      EID_BONUS_AMOUNT,
      EID_BONUS_SUBTYPE
    );

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    await replyFields(ctx, {
      title: 'Eid al-Adha Bonus Claimed!',
      tone: 'success',
      fields: [
        { name: 'Reward', value: formatCurrency(EID_BONUS_AMOUNT), inline: true }
      ],
      description: EID_BONUS_GREETING,
      compact: true
    });
  }
}

@Declare({
  name: 'claim',
  description: 'Claim available rewards',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options([TimelySubCommand, EidSubCommand])
export default class ClaimCommand extends Command {}
