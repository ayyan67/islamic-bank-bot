import {
  Command,
  Declare,
  Options,
  SubCommand,
  createIntegerOption,
  createStringOption,
  createUserOption
} from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { progressBar } from '../../infra/discord/formatting.js';
import {
  attachPaginationCollector,
  buildPaginationComponents,
  resolveRequestedPage
} from '../../infra/discord/pagination.js';
import { profileFromContext, profileFromUnknown } from '../../infra/discord/profile.js';
import { buildReplyPayload, mention, reply, replyFields } from '../shared.js';

const CLUB_LEADERBOARD_PAGE_SIZE = 10;
const CLUB_LEVEL_XP = 1000;

function getClubLevel(xp: number): { level: number; currentXp: number; nextLevelXp: number } {
  const level = Math.floor(xp / CLUB_LEVEL_XP);
  const currentXp = xp % CLUB_LEVEL_XP;
  return { level, currentXp, nextLevelXp: CLUB_LEVEL_XP };
}

function clubInfoFields(payload: any): Array<{ name: string; value: string; inline?: boolean }> {
  const club = payload.club;
  const members = payload.members ?? [];
  const applications = payload.applications ?? [];

  const memberLines = members
    .slice(0, 12)
    .map((member: any) => `${member.isAdmin ? '⭐' : '•'} ${mention(member.discordUserId)}`)
    .join('\n') || 'No members listed';

  const { level, currentXp, nextLevelXp } = getClubLevel(club.xp);
  const xpBar = progressBar(currentXp, nextLevelXp, 10);

  return [
    {
      name: 'Club',
      value: `${club.name} (#${club.id})`,
      inline: true
    },
    {
      name: 'Owner',
      value: club.ownerDiscordUserId ? mention(club.ownerDiscordUserId) : 'Unknown',
      inline: true
    },
    {
      name: 'Members',
      value: `${club.memberCount}`,
      inline: true
    },
    {
      name: 'Level',
      value: `${level}`,
      inline: true
    },
    {
      name: 'XP',
      value: `${club.xp} (${currentXp}/${nextLevelXp})\n${xpBar}`,
      inline: true
    },
    {
      name: 'Pending Applications',
      value: `${applications.length}`,
      inline: true
    },
    {
      name: 'Description',
      value: club.description ?? 'n/a',
      inline: false
    },
    {
      name: 'Icon',
      value: club.imageUrl ?? 'n/a',
      inline: false
    },
    {
      name: 'Member List',
      value: memberLines,
      inline: false
    }
  ];
}

@Declare({
  name: 'create',
  description: 'Create a new club',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  name: createStringOption({
    description: 'Club name',
    required: true,
    min_length: 3,
    max_length: 40
  }),
  description: createStringOption({
    description: 'Club description',
    required: false,
    max_length: 300
  })
})
class ClubCreateSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.clubsService.createClub(
      profileFromContext(ctx),
      String(ctx.options.name ?? ''),
      ctx.options.description ? String(ctx.options.description) : undefined
    );

    if (!result.ok) {
      await reply(ctx, result.reason ?? 'Unable to create club.');
      return;
    }

    await replyFields(ctx, {
      title: 'Club Created',
      tone: 'success',
      fields: clubInfoFields(result),
      compact: true
    });
  }
}

@Declare({
  name: 'info',
  description: 'Show club information',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  name: createStringOption({
    description: 'Club name (optional)',
    required: false,
    min_length: 3,
    max_length: 40
  })
})
class ClubInfoSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.clubsService.getClubInfo(
      profileFromContext(ctx),
      ctx.options.name ? String(ctx.options.name) : undefined
    );

    if (!result.ok) {
      await reply(ctx, result.reason ?? 'Club not found.');
      return;
    }

    await replyFields(ctx, {
      title: 'Club Overview',
      fields: clubInfoFields(result),
      compact: true
    });
  }
}

@Declare({
  name: 'apply',
  description: 'Apply to join a club',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  name: createStringOption({
    description: 'Club name',
    required: true,
    min_length: 3,
    max_length: 40
  })
})
class ClubApplySubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.clubsService.applyToClub(profileFromContext(ctx), String(ctx.options.name ?? ''));
    await reply(
      ctx,
      result.ok ? 'Application submitted.' : result.reason ?? 'Application failed.',
      { title: 'Club Application', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'accept',
  description: 'Accept a club applicant',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  user: createUserOption({
    description: 'Applicant user',
    required: true
  })
})
class ClubAcceptSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve user.');
      return;
    }

    const result = ctx.app.clubsService.acceptApplicant(profileFromContext(ctx), target);
    await reply(
      ctx,
      result.ok ? `Accepted ${mention(target.discordUserId)}.` : result.reason ?? 'Accept failed.',
      { title: 'Applicant Decision', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'reject',
  description: 'Reject a club applicant',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  user: createUserOption({
    description: 'Applicant user',
    required: true
  })
})
class ClubRejectSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve user.');
      return;
    }

    const result = ctx.app.clubsService.rejectApplicant(profileFromContext(ctx), target);
    await reply(
      ctx,
      result.ok ? `Rejected ${mention(target.discordUserId)}.` : result.reason ?? 'Reject failed.',
      { title: 'Applicant Decision', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'leave',
  description: 'Leave your current club',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
class ClubLeaveSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.clubsService.leaveClub(profileFromContext(ctx));
    await reply(
      ctx,
      result.ok ? 'You left your club.' : result.reason ?? 'Unable to leave club.',
      { title: 'Club Membership', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'kick',
  description: 'Kick a member from your club',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  user: createUserOption({
    description: 'Member to kick',
    required: true
  })
})
class ClubKickSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve user.');
      return;
    }

    const result = ctx.app.clubsService.kickMember(profileFromContext(ctx), target);
    await reply(
      ctx,
      result.ok ? `Kicked ${mention(target.discordUserId)}.` : result.reason ?? 'Kick failed.',
      { title: 'Club Moderation', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'ban',
  description: 'Ban a user from your club',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  user: createUserOption({
    description: 'User to ban',
    required: true
  })
})
class ClubBanSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve user.');
      return;
    }

    const result = ctx.app.clubsService.banMember(profileFromContext(ctx), target);
    await reply(
      ctx,
      result.ok ? `Banned ${mention(target.discordUserId)}.` : result.reason ?? 'Ban failed.',
      { title: 'Club Moderation', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'unban',
  description: 'Unban a user from your club',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  user: createUserOption({
    description: 'User to unban',
    required: true
  })
})
class ClubUnbanSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve user.');
      return;
    }

    const result = ctx.app.clubsService.unbanMember(profileFromContext(ctx), target);
    await reply(
      ctx,
      result.ok ? `Unbanned ${mention(target.discordUserId)}.` : result.reason ?? 'Unban failed.',
      { title: 'Club Moderation', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'transfer',
  description: 'Transfer club ownership',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  user: createUserOption({
    description: 'New owner',
    required: true
  })
})
class ClubTransferSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve user.');
      return;
    }

    const result = ctx.app.clubsService.transferOwnership(profileFromContext(ctx), target);
    await reply(
      ctx,
      result.ok ? `Ownership transferred to ${mention(target.discordUserId)}.` : result.reason ?? 'Transfer failed.',
      { title: 'Club Ownership', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'admin',
  description: 'Grant or revoke club admin role',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  user: createUserOption({
    description: 'Target user',
    required: true
  }),
  mode: createStringOption({
    description: 'Admin action',
    required: true,
    choices: [
      { name: 'grant', value: 'grant' },
      { name: 'revoke', value: 'revoke' }
    ]
  })
})
class ClubAdminSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = profileFromUnknown(ctx.options.user);
    const mode = String(ctx.options.mode ?? 'grant').toLowerCase();

    if (!target) {
      await reply(ctx, 'Unable to resolve user.');
      return;
    }

    const makeAdmin = mode === 'grant';
    const result = ctx.app.clubsService.setAdmin(profileFromContext(ctx), target, makeAdmin);
    await reply(
      ctx,
      result.ok
        ? `${makeAdmin ? 'Granted' : 'Revoked'} admin for ${mention(target.discordUserId)}.`
        : result.reason ?? 'Admin update failed.',
      { title: 'Club Admin Update', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'description',
  description: 'Update club description',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  text: createStringOption({
    description: 'New description',
    required: true,
    max_length: 300
  })
})
class ClubDescriptionSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.clubsService.updateDescription(profileFromContext(ctx), String(ctx.options.text ?? ''));
    await reply(
      ctx,
      result.ok ? 'Club description updated.' : result.reason ?? 'Description update failed.',
      { title: 'Club Settings', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'icon',
  description: 'Update club icon URL',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  url: createStringOption({
    description: 'Icon URL',
    required: true,
    max_length: 500
  })
})
class ClubIconSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.clubsService.updateIcon(profileFromContext(ctx), String(ctx.options.url ?? ''));
    await reply(
      ctx,
      result.ok ? 'Club icon updated.' : result.reason ?? 'Icon update failed.',
      { title: 'Club Settings', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'disband',
  description: 'Disband your club',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
class ClubDisbandSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.clubsService.disbandClub(profileFromContext(ctx));
    await reply(
      ctx,
      result.ok ? 'Club disbanded.' : result.reason ?? 'Disband failed.',
      { title: 'Club Lifecycle', tone: result.ok ? 'success' : 'error', compact: true }
    );
  }
}

@Declare({
  name: 'leaderboard',
  description: 'Show club leaderboard',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  page: createIntegerOption({
    description: 'Leaderboard page',
    required: false,
    min_value: 1
  })
})
class ClubLeaderboardSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const fetchPage = (page: number) => {
      const rows = ctx.app.clubsService.leaderboard(page, CLUB_LEADERBOARD_PAGE_SIZE).clubs;
      const nextRows = ctx.app.clubsService.leaderboard(page + 1, CLUB_LEADERBOARD_PAGE_SIZE).clubs;
      return { rows, hasNext: nextRows.length > 0 };
    };

    let currentPage = resolveRequestedPage(ctx, ctx.options.page);
    let current = fetchPage(currentPage);
    if (current.rows.length === 0) {
      await reply(ctx, 'No clubs found.');
      return;
    }

    const toLines = (rows: any[], page: number): string[] => rows.map((club: any, index: number) => {
      const rank = (page - 1) * 10 + index + 1;
      const owner = club.ownerDiscordUserId ? mention(club.ownerDiscordUserId) : 'Unknown';
      return `**#${rank} ${club.name}** • XP: ${club.xp} • Members: ${club.memberCount} • Owner: ${owner}`;
    });

    const renderPayload = (rows: any[], page: number, hasNext: boolean) =>
      buildReplyPayload({
        fullCommandName: 'club leaderboard',
        requesterName: ctx.author.username ?? 'user',
        content: toLines(rows, page).join('\n'),
        options: {
          title: 'Club Leaderboard',
          footer: `Page ${page}`,
          compact: true,
          components:
            page > 1 || hasNext ? buildPaginationComponents(page > 1, hasNext) : undefined
        }
      });

    const response = await ctx.editOrReply(
      renderPayload(current.rows, currentPage, current.hasNext),
      currentPage > 1 || current.hasNext ? true : undefined
    );

    if (!(currentPage > 1 || current.hasNext) || !response) {
      return;
    }

    attachPaginationCollector({
      ctx,
      responseMessage: response,
      ownerUserId: ctx.author.id,
      getCurrentPage: () => currentPage,
      onPageRequested: async (requestedPage, interaction) => {
        if (requestedPage < 1) {
          await interaction.deferUpdate();
          return;
        }

        const nextPage = fetchPage(requestedPage);
        if (nextPage.rows.length === 0) {
          await interaction.deferUpdate();
          return;
        }

        currentPage = requestedPage;
        current = nextPage;
        await interaction.update(renderPayload(current.rows, currentPage, current.hasNext));
      }
    });
  }
}

@Declare({
  name: 'club',
  description: 'Manage and interact with clubs',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options([
  ClubCreateSubCommand,
  ClubInfoSubCommand,
  ClubApplySubCommand,
  ClubAcceptSubCommand,
  ClubRejectSubCommand,
  ClubLeaveSubCommand,
  ClubKickSubCommand,
  ClubBanSubCommand,
  ClubUnbanSubCommand,
  ClubTransferSubCommand,
  ClubAdminSubCommand,
  ClubDescriptionSubCommand,
  ClubIconSubCommand,
  ClubDisbandSubCommand,
  ClubLeaderboardSubCommand
])
export default class ClubCommand extends Command {}
