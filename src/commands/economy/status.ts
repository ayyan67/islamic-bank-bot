import { ActionRow, Button, Command, Declare } from 'seyfert';
import { ButtonStyle } from 'seyfert/lib/types/index.js';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCooldown, formatCurrency, progressBar } from '../../infra/discord/formatting.js';
import { secondsUntilUtcDayReset } from '../../infra/utils/time.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { EID_MULTIPLIER, isEidEvent } from '../../infra/utils/time.js';
import { avatarUrl, buildReplyPayload } from '../shared.js';

const STANDARD_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const BUTTON_TIMELY = 'status_claim_timely';
const BUTTON_PRAYER_PREFIX = 'status_pray_';
const COLLECTOR_TIMEOUT_MS = 10 * 60 * 1000;

function buildStatusView(
  app: any,
  profile: any,
  guildId: string | null | undefined,
  requesterName: string,
  thumbnail?: string,
  notice?: string
) {
  const wallet = app.economyService.getBalance(profile);
  const vault = app.vaultService.getBalance(profile);

  const settings = app.guildSettingsService.getEffectiveSettings(guildId);
  const timely = app.worshipService.getTimelyStatus(profile, settings.timelyCooldownHours);
  const cooldownTotal = settings.timelyCooldownHours * 3600;
  const timelyLine = timely.available
    ? '✅ Available now'
    : `${progressBar(cooldownTotal - timely.remainingSeconds, cooldownTotal)} · ready in ${formatCooldown(timely.remainingSeconds)}`;

  const streaks = app.worshipService.getStreaks(profile, settings.timelyCooldownHours);
  const prayers = app.worshipService.getPrayerStatus(profile);
  const prayerLine = STANDARD_PRAYERS.map(
    (name) => `${prayers.claimed.includes(name) ? '✅' : '⬜'} ${name.charAt(0).toUpperCase() + name.slice(1)}`
  ).join('\n');
  const bonusLine = prayers.hasBonus ? '\n🎁 All-five bonus claimed' : '';

  const components: any[] = [];
  if (timely.available) {
    components.push(
      new ActionRow<Button>().addComponents(
        new Button().setCustomId(BUTTON_TIMELY).setLabel('⏰ Claim Timely').setStyle(ButtonStyle.Success)
      )
    );
  }
  const unclaimed = STANDARD_PRAYERS.filter((name) => !prayers.claimed.includes(name));
  if (unclaimed.length > 0) {
    components.push(
      new ActionRow<Button>().addComponents(
        ...unclaimed.map((name) =>
          new Button()
            .setCustomId(`${BUTTON_PRAYER_PREFIX}${name}`)
            .setLabel(`🕌 ${name.charAt(0).toUpperCase() + name.slice(1)}`)
            .setStyle(ButtonStyle.Secondary)
        )
      )
    );
  }

  const payload = buildReplyPayload({
    fullCommandName: 'status',
    requesterName,
    content: notice ?? '',
    options: {
      tone: notice ? 'success' : undefined,
      title: 'Your Status',
      fields: [
        { name: 'Wallet', value: formatCurrency(wallet), inline: true },
        { name: 'Vault', value: formatCurrency(vault), inline: true },
        { name: 'Timely', value: timelyLine, inline: false },
        {
          name: '🔥 Streaks',
          value: `Timely: ${streaks.timely} in a row · Prayer: ${streaks.prayer} day${streaks.prayer === 1 ? '' : 's'}`,
          inline: false
        },
        { name: `Prayers · resets in ${formatCooldown(secondsUntilUtcDayReset())}`, value: prayerLine + bonusLine, inline: false }
      ],
      compact: true,
      components: components.length > 0 ? components : undefined,
      thumbnail
    }
  });
  if (components.length === 0) {
    payload.components = [];
  }
  return payload;
}

@Declare({
  name: 'status',
  description: 'Your balance, timely cooldown, and prayer checklist at a glance',
  aliases: ['st'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
export default class StatusCommand extends Command {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    const requesterName = ctx.author?.username ?? 'user';
    const thumbnail = avatarUrl(ctx.author);

    const payload = buildStatusView(ctx.app, profile, ctx.guildId, requesterName, thumbnail);
    const response = await ctx.editOrReply(payload, true);
    if (!response?.id) return;

    const channelId = response.channelId ?? response.channel_id ?? ctx.channelId;
    const collector = ctx.client.components.createComponentCollector(response.id, channelId, ctx.guildId, {
      timeout: COLLECTOR_TIMEOUT_MS,
      idle: COLLECTOR_TIMEOUT_MS,
      filter: (interaction: any) => interaction.user?.id === ctx.author.id,
      onPass: async (interaction: any) => {
        await interaction.write({
          content: 'Only the user who ran this command can use these buttons — run `/status` yourself!',
          flags: 64
        });
      },
      onError: async (interaction: any, error: unknown) => {
        ctx.app?.logger?.warn?.(
          { error: error instanceof Error ? error.message : String(error) },
          'Status button callback failed'
        );
        try {
          await interaction.write({ content: 'Something went wrong — try again.', flags: 64 });
        } catch {
          // expired interaction
        }
      }
    });

    const refreshView = async (interaction: any, notice?: string) => {
      await interaction.update(buildStatusView(ctx.app, profile, ctx.guildId, requesterName, thumbnail, notice));
    };

    collector.run(BUTTON_TIMELY, async (interaction: any) => {
      const gate = ctx.app.economyScope.canEarn({ guildId: ctx.guildId ?? null, discordUserId: profile.discordUserId });
      if (!gate.ok) {
        await interaction.write({ content: gate.reason, flags: 64 });
        return;
      }
      const settings = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
      const eid = isEidEvent();
      const amount = eid ? settings.timelyAmount * EID_MULTIPLIER : settings.timelyAmount;
      const result = ctx.app.worshipService.claimTimely(profile, amount, settings.timelyCooldownHours, {
        guildId: ctx.guildId ?? null,
        sourceChannelId: ctx.channelId ?? null
      });
      if (!result.ok) {
        await interaction.write({ content: result.reason ?? 'Unable to claim timely.', flags: 64 });
        return;
      }
      const streakNote =
        result.streakBonus > 0
          ? ` (🔥 ${result.streak} in a row, +${formatCurrency(result.streakBonus)} bonus)`
          : ` (🔥 ${result.streak} in a row)`;
      await refreshView(interaction, `✅ Timely claimed: +${formatCurrency(result.totalAmount)}${streakNote}`);
    });

    for (const prayer of STANDARD_PRAYERS) {
      collector.run(`${BUTTON_PRAYER_PREFIX}${prayer}`, async (interaction: any) => {
        const gate = ctx.app.economyScope.canEarn({ guildId: ctx.guildId ?? null, discordUserId: profile.discordUserId });
        if (!gate.ok) {
          await interaction.write({ content: gate.reason, flags: 64 });
          return;
        }
        const settings = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
        const eid = isEidEvent();
        const reward = eid ? settings.prayerReward * EID_MULTIPLIER : settings.prayerReward;
        const bonus = eid ? settings.prayerAllFiveBonus * EID_MULTIPLIER : settings.prayerAllFiveBonus;
        const result = ctx.app.worshipService.claimPrayer(profile, prayer, reward, settings.prayerCooldownHours, bonus);
        if (!result.ok) {
          const cooldown =
            typeof result.remainingSeconds === 'number'
              ? ` Cooldown remaining: ${formatCooldown(result.remainingSeconds)}.`
              : '';
          const reset =
            typeof result.resetInSeconds === 'number'
              ? ` Checklist resets in ${formatCooldown(result.resetInSeconds)} (midnight UTC).`
              : '';
          await interaction.write({ content: `${result.reason ?? 'Unable to check in.'}${cooldown}${reset}`, flags: 64 });
          return;
        }
        const prayerName = prayer.charAt(0).toUpperCase() + prayer.slice(1);
        const extras = [
          `+${formatCurrency(reward + result.streakBonus)}`,
          `🔥 ${result.streak}-day streak`,
          ...(result.bonusAwarded > 0 ? [`🎁 all-five bonus +${formatCurrency(result.bonusAwarded)}`] : [])
        ];
        await refreshView(interaction, `✅ ${prayerName} checked in: ${extras.join(' · ')}`);
      });
    }
  }
}
