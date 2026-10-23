import {
  Command,
  Declare,
  Options,
  SubCommand,
  createStringOption
} from 'seyfert';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCooldown, formatCurrency } from '../../infra/discord/formatting.js';
import { secondsUntilUtcDayReset } from '../../infra/utils/time.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { EID_GREETING, EID_MULTIPLIER, isEidEvent, isRamadan } from '../../infra/utils/time.js';
import { streakBonusPercent } from '../../modules/worship/service.js';
import { reply, replyFields, replyList } from '../shared.js';

const PRAYER_CHOICES = [
  { name: 'fajr', value: 'fajr' },
  { name: 'dhuhr', value: 'dhuhr' },
  { name: 'asr', value: 'asr' },
  { name: 'maghrib', value: 'maghrib' },
  { name: 'isha', value: 'isha' },
  { name: 'taraweeh', value: 'taraweeh' }
] as const;

@Declare({
  name: 'checkin',
  description: 'Check in a prayer for reward',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  prayer: createStringOption({
    description: 'Prayer to check in',
    required: true,
    choices: [...PRAYER_CHOICES]
  })
})
class PrayerCheckinSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const gate = ctx.app.economyScope.canEarn({ guildId: ctx.guildId ?? null, discordUserId: ctx.author.id });
    if (!gate.ok) {
      await reply(ctx, gate.reason);
      return;
    }
    const prayer = String(ctx.options.prayer ?? '').toLowerCase();

    const settings = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
    const eid = isEidEvent();
    const effectiveReward = eid ? settings.prayerReward * EID_MULTIPLIER : settings.prayerReward;
    const effectiveBonus = eid ? settings.prayerAllFiveBonus * EID_MULTIPLIER : settings.prayerAllFiveBonus;
    const result = ctx.app.worshipService.claimPrayer(
      profileFromContext(ctx),
      prayer,
      effectiveReward,
      settings.prayerCooldownHours,
      effectiveBonus
    );

    if (!result.ok) {
      const cooldown =
        typeof result.remainingSeconds === 'number'
          ? ` Cooldown remaining: ${formatCooldown(result.remainingSeconds)}.`
          : '';
      const reset =
        typeof result.resetInSeconds === 'number'
          ? ` Checklist resets in ${formatCooldown(result.resetInSeconds)} (midnight UTC).`
          : '';
      await reply(ctx, `${result.reason ?? 'Unable to check in prayer.'}${cooldown}${reset}`);
      return;
    }

    const streakPct = streakBonusPercent(result.streak);
    const fields = [
      { name: 'Prayer', value: prayer, inline: true },
      { name: 'Base Reward', value: formatCurrency(effectiveReward), inline: true },
      {
        name: '🔥 Streak',
        value: `${result.streak} day${result.streak === 1 ? '' : 's'}${streakPct > 0 ? ` (+${streakPct}%)` : ''}`,
        inline: true
      },
      ...(result.streakBonus > 0
        ? [{ name: 'Streak Bonus', value: `+${formatCurrency(result.streakBonus)}`, inline: true }]
        : []),
      ...(result.bonusAwarded > 0
        ? [{ name: 'All-Five Bonus', value: formatCurrency(result.bonusAwarded), inline: true }]
        : [])
    ];
    if (eid) {
      fields.push({ name: 'Event', value: `${EID_MULTIPLIER}x Eid Bonus!`, inline: true });
    }

    const bonusText =
      result.bonusAwarded > 0
        ? `Bonus awarded: ${formatCurrency(result.bonusAwarded)}.`
        : '';
    const eidText = eid ? EID_GREETING : '';
    const description = [bonusText, eidText].filter(Boolean).join('\n') || undefined;

    await replyFields(ctx, {
      title: 'Prayer Check-In Complete',
      tone: 'success',
      fields,
      description,
      compact: true
    });
  }
}

@Declare({
  name: 'status',
  description: 'Show your prayer checklist and when it resets',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
class PrayerStatusSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const status = ctx.app.worshipService.getPrayerStatus(profileFromContext(ctx));
    const ramadan = isRamadan();
    const standard = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

    const lines = standard.map((name) => {
      const claimed = status.claimed.includes(name);
      return `${claimed ? '✅' : '⬜'} ${name.toUpperCase()}`;
    });

    const bonusLine = status.hasBonus ? '✅ all five bonus claimed' : '⬜ all five bonus not claimed';
    lines.push(bonusLine);

    if (ramadan) {
      const taraweehClaimed = status.claimed.includes('taraweeh');
      lines.push(`${taraweehClaimed ? '✅' : '⬜'} TARAWEEH`);
    }

    lines.push(`🕛 Resets in ${formatCooldown(secondsUntilUtcDayReset())} (midnight UTC)`);
    lines.push('Streaks only need one check-in per day, so your time zone never breaks them.');

    await replyList(ctx, {
      title: 'Prayer Checklist',
      lines,
      compact: true
    });
  }
}

@Declare({
  name: 'prayer',
  description: 'Prayer reward commands',
  aliases: ['pray'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options([PrayerCheckinSubCommand, PrayerStatusSubCommand])
export default class PrayerCommand extends Command {}
