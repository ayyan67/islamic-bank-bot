import {
  Command,
  Declare,
  Group,
  Groups,
  Middlewares,
  Options,
  SubCommand,
  createIntegerOption,
  createStringOption,
  createUserOption
} from 'seyfert';
import {
  ADMIN_DEFAULT_MEMBER_PERMISSIONS,
  CONTEXTS_GUILD,
  INTEGRATION_TYPES_GLOBAL
} from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { profileFromContext, profileFromUnknown } from '../../infra/discord/profile.js';
import { mention, reply, replyFields, replyList } from '../shared.js';

@Declare({
  name: 'view',
  description: 'View the current daily recitation challenge',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
class DailyChallengeViewSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Daily challenges are only available in a server.');
      return;
    }

    const challenge = ctx.app.challengeService.getActiveChallenge(ctx.guildId);
    if (!challenge) {
      await reply(ctx, 'No active daily challenge right now. An admin can set one up with `/dailychallenge admin set-channel`.');
      return;
    }

    const completionCount = ctx.app.challengeService.getCompletionCount(challenge.id);
    const profile = profileFromContext(ctx);
    const hasCompleted = ctx.app.challengeService.hasUserCompleted(challenge.id, profile);

    const statusText = hasCompleted ? '**You have completed this challenge!**' : 'Send a **voice note** in the challenge channel to complete it.';

    await replyFields(ctx, {
      title: 'Daily Recitation Challenge',
      tone: hasCompleted ? 'success' : 'info',
      fields: [
        { name: 'Challenge', value: challenge.promptText, inline: false },
        { name: 'Reward', value: formatCurrency(challenge.rewardAmount), inline: true },
        { name: 'Completions', value: String(completionCount), inline: true },
        { name: 'Channel', value: `<#${challenge.channelId}>`, inline: true },
        { name: 'Status', value: statusText, inline: false }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'set-channel',
  description: 'Set this channel as the daily challenge channel',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
class DailyChallengeSetChannelSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Daily challenges are only available in a server.');
      return;
    }

    ctx.app.guildSettingsService.setChallengeChannelId(ctx.guildId, ctx.channelId);

    await replyFields(ctx, {
      title: 'Challenge Channel Set',
      tone: 'success',
      fields: [
        { name: 'Channel', value: `<#${ctx.channelId}>`, inline: true },
        { name: 'Info', value: 'Daily recitation challenges will be posted here automatically. The first challenge will appear shortly.', inline: false }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'disable',
  description: 'Disable daily challenges for this server',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
class DailyChallengeDisableSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Daily challenges are only available in a server.');
      return;
    }

    ctx.app.guildSettingsService.setChallengeChannelId(ctx.guildId, null);

    await reply(ctx, 'Daily challenges have been disabled for this server.', {
      title: 'Challenges Disabled',
      tone: 'success',
      compact: true
    });
  }
}

@Declare({
  name: 'ban',
  description: 'Ban a user from participating in daily challenges',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
@Options({
  user: createUserOption({
    description: 'User to ban',
    required: true
  }),
  duration: createIntegerOption({
    description: 'Ban duration in hours (leave empty for permanent)',
    required: false,
    min_value: 1
  }),
  reason: createStringOption({
    description: 'Reason for the ban',
    required: false,
    max_length: 250
  })
})
class DailyChallengeBanSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Daily challenges are only available in a server.');
      return;
    }

    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve target user.');
      return;
    }

    const durationHours = ctx.options.duration ? Number(ctx.options.duration) : null;
    const durationMinutes = durationHours ? durationHours * 60 : null;
    const reason = ctx.options.reason ?? null;

    const result = ctx.app.challengeService.banUser(
      ctx.guildId,
      target,
      profileFromContext(ctx),
      reason,
      durationMinutes
    );

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    const durationText = durationHours ? `${durationHours}h` : 'Permanent';
    const fields = [
      { name: 'User', value: mention(target.discordUserId), inline: true },
      { name: 'Duration', value: durationText, inline: true }
    ];
    if (reason) {
      fields.push({ name: 'Reason', value: reason, inline: false });
    }

    await replyFields(ctx, {
      title: 'Challenge Ban',
      tone: 'success',
      fields,
      compact: true
    });
  }
}

@Declare({
  name: 'unban',
  description: 'Unban a user from daily challenges',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
@Options({
  user: createUserOption({
    description: 'User to unban',
    required: true
  })
})
class DailyChallengeUnbanSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Daily challenges are only available in a server.');
      return;
    }

    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve target user.');
      return;
    }

    const result = ctx.app.challengeService.unbanUser(ctx.guildId, target);

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    await replyFields(ctx, {
      title: 'Challenge Unban',
      tone: 'success',
      fields: [
        { name: 'User', value: mention(target.discordUserId), inline: true }
      ],
      description: 'User can now participate in daily challenges again.',
      compact: true
    });
  }
}

@Declare({
  name: 'bans',
  description: 'List users banned from daily challenges',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Group('admin')
@Middlewares(['permissionPolicy'])
class DailyChallengeBansListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Daily challenges are only available in a server.');
      return;
    }

    const bans = ctx.app.challengeService.listBans(ctx.guildId);

    if (bans.length === 0) {
      await reply(ctx, 'No active challenge bans in this server.', {
        title: 'Challenge Bans',
        tone: 'info',
        compact: true
      });
      return;
    }

    const lines = bans.map((ban: any) => {
      const discordId = ctx.app.challengeService.resolveDiscordId(ban.userId);
      const userDisplay = discordId ? mention(discordId) : `User #${ban.userId}`;
      const expiry = ban.expiresAt
        ? `expires <t:${Math.floor(new Date(ban.expiresAt).getTime() / 1000)}:R>`
        : '**permanent**';
      const reasonText = ban.reason ? ` — ${ban.reason}` : '';
      return `${userDisplay} (${expiry})${reasonText}`;
    });

    await replyList(ctx, {
      title: 'Challenge Bans',
      lines,
      tone: 'info',
      compact: true
    });
  }
}

@Declare({
  name: 'dailychallenge',
  description: 'Daily Quran recitation challenges',
  aliases: ['dc', 'challenge'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Groups({
  admin: { defaultDescription: 'Daily challenge admin commands' }
})
@Options([
  DailyChallengeViewSubCommand,
  DailyChallengeSetChannelSubCommand,
  DailyChallengeDisableSubCommand,
  DailyChallengeBanSubCommand,
  DailyChallengeUnbanSubCommand,
  DailyChallengeBansListSubCommand
])
export default class DailyChallengeCommand extends Command {}
