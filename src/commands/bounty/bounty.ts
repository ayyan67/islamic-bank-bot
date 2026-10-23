import {
  Command,
  Declare,
  Group,
  Groups,
  Middlewares,
  Options,
  SubCommand,
  createIntegerOption,
  createStringOption
} from 'seyfert';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import type { BountyRow } from '../../modules/bounty/repository.js';
import { mention, parseAmount, reply, replyFields } from '../shared.js';

function bountyLine(b: BountyRow): string {
  const status = b.status === 'open' ? '🟢 open' : `🔧 taken by ${b.assignee_username ?? 'someone'}`;
  return `${formatCurrency(b.bounty_amount)} · ${status}`;
}

@Declare({
  name: 'post',
  description: 'Post a bounty — the amount is escrowed from your wallet',
  aliases: ['p'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  amount: createStringOption({ description: 'Bounty amount (number, 5k, 1m)', required: true }),
  title: createStringOption({ description: 'What needs to be done', required: true, max_length: 200 })
})
class BountyPostSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'Bounties can only be posted in a server.');
      return;
    }
    const parsed = parseAmount(ctx.options.amount);
    if (parsed === null || parsed === 'all') {
      await reply(ctx, 'Invalid amount. Provide a positive number (500, 5k, 1.5m).');
      return;
    }

    const result = ctx.app.bountyService.post(
      profileFromContext(ctx),
      ctx.guildId,
      ctx.channelId,
      String(ctx.options.title ?? ''),
      parsed
    );
    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    await replyFields(ctx, {
      title: 'Bounty Posted',
      tone: 'success',
      fields: [
        { name: 'ID', value: `#${result.id}`, inline: true },
        { name: 'Reward', value: formatCurrency(parsed), inline: true },
        { name: 'Task', value: String(ctx.options.title), inline: false },
        { name: 'How to take it', value: `First come, first served: \`/bounty take id:${result.id}\` or \`.bounty take ${result.id}\``, inline: false }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'take',
  description: 'Take an open bounty (first come, first served)',
  aliases: ['t', 'claim'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  id: createIntegerOption({ description: 'Bounty ID', required: true, min_value: 1 })
})
class BountyTakeSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.bountyService.take(profileFromContext(ctx), ctx.guildId, Number(ctx.options.id));
    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }
    await replyFields(ctx, {
      title: 'Bounty Taken',
      tone: 'success',
      fields: [
        { name: 'ID', value: `#${result.bounty.id}`, inline: true },
        { name: 'Reward', value: formatCurrency(result.bounty.bounty_amount), inline: true },
        { name: 'Task', value: result.bounty.title, inline: false },
        { name: 'Next', value: `Do the work, then ${mention(result.bounty.owner_discord_user_id)} pays out with \`/bounty pay id:${result.bounty.id}\``, inline: false }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'pay',
  description: 'Release the bounty reward to the worker',
  aliases: ['release', 'approve'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  id: createIntegerOption({ description: 'Bounty ID', required: true, min_value: 1 })
})
class BountyPaySubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.bountyService.pay(profileFromContext(ctx), ctx.guildId, Number(ctx.options.id));
    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }
    await replyFields(ctx, {
      title: 'Bounty Paid',
      tone: 'success',
      fields: [
        { name: 'ID', value: `#${result.bounty.id}`, inline: true },
        { name: 'Paid To', value: mention(result.bounty.assignee_discord_user_id!), inline: true },
        { name: 'Amount', value: formatCurrency(result.bounty.bounty_amount), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'cancel',
  description: 'Cancel your bounty and get the escrow back',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  id: createIntegerOption({ description: 'Bounty ID', required: true, min_value: 1 })
})
class BountyCancelSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.bountyService.cancel(profileFromContext(ctx), ctx.guildId, Number(ctx.options.id));
    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }
    await reply(ctx, `Success — bounty #${result.bounty.id} cancelled and ${formatCurrency(result.bounty.bounty_amount)} refunded.`);
  }
}

@Declare({
  name: 'view',
  description: 'View a bounty',
  aliases: ['v'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  id: createIntegerOption({ description: 'Bounty ID', required: true, min_value: 1 })
})
class BountyViewSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const bounty = ctx.app.bountyService.get(ctx.guildId, Number(ctx.options.id));
    if (!bounty) {
      await reply(ctx, `No bounty #${ctx.options.id} in this server.`);
      return;
    }
    await replyFields(ctx, {
      title: `Bounty #${bounty.id}`,
      fields: [
        { name: 'Task', value: bounty.title, inline: false },
        { name: 'Reward', value: formatCurrency(bounty.bounty_amount), inline: true },
        { name: 'Status', value: bounty.status.replace('_', ' '), inline: true },
        { name: 'Posted By', value: bounty.owner_username ?? 'Unknown', inline: true },
        ...(bounty.assignee_username
          ? [{ name: 'Worker', value: bounty.assignee_username, inline: true }]
          : [])
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'list',
  description: 'List open and in-progress bounties',
  aliases: ['l'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  page: createIntegerOption({ description: 'Page number', required: false, min_value: 1 })
})
class BountyListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const page = Number(ctx.options.page ?? 1);
    const rows = ctx.app.bountyService.list(ctx.guildId, page);
    if (rows.length === 0) {
      await reply(
        ctx,
        page === 1
          ? 'No active bounties. Post one: `/bounty post amount:5k title:your task`'
          : 'No bounties on this page.'
      );
      return;
    }
    await replyFields(ctx, {
      title: 'Active Bounties',
      fields: rows.map((b: BountyRow) => ({
        name: `#${b.id} · ${b.title}`,
        value: bountyLine(b),
        inline: false
      })),
      footer: `Page ${page} · take one with /bounty take id:<n>`,
      compact: true
    });
  }
}

@Declare({
  name: 'refund',
  description: 'Admin: cancel any bounty and refund the poster',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  id: createIntegerOption({ description: 'Bounty ID', required: true, min_value: 1 })
})
@Group('admin')
@Middlewares(['permissionPolicy'])
class BountyAdminRefundSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.bountyService.cancel(profileFromContext(ctx), ctx.guildId, Number(ctx.options.id), true);
    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }
    await reply(ctx, `Success — bounty #${result.bounty.id} cancelled by admin; ${formatCurrency(result.bounty.bounty_amount)} refunded to poster.`);
  }
}

@Declare({
  name: 'pay',
  description: 'Admin: force-release a bounty payout to the worker',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options({
  id: createIntegerOption({ description: 'Bounty ID', required: true, min_value: 1 })
})
@Group('admin')
@Middlewares(['permissionPolicy'])
class BountyAdminPaySubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const result = ctx.app.bountyService.pay(profileFromContext(ctx), ctx.guildId, Number(ctx.options.id), true);
    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }
    await reply(ctx, `Success — bounty #${result.bounty.id} paid out to ${mention(result.bounty.assignee_discord_user_id!)} by admin.`);
  }
}

@Declare({
  name: 'bounty',
  description: 'Simple bounty board — post, take, pay',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Groups({ admin: { defaultDescription: 'Admin bounty controls' } })
@Options([
  BountyPostSubCommand,
  BountyTakeSubCommand,
  BountyPaySubCommand,
  BountyCancelSubCommand,
  BountyViewSubCommand,
  BountyListSubCommand,
  BountyAdminRefundSubCommand,
  BountyAdminPaySubCommand
])
export default class BountyCommand extends Command {}
