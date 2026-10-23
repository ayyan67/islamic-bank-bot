import { Command, Declare, Options, SubCommand } from 'seyfert';
import { env } from '../../config/env.js';
import { CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { reply, replyFields } from '../shared.js';

@Declare({
  name: 'tag-reward',
  description: 'Claim the community tag reward',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
class TagRewardSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    // Check if user has the server tag active via Discord API
    const user = await ctx.author.fetch(true).catch(() => ctx.author);
    const pg = (user as any).primaryGuild;
    const hasTagActive = Boolean(pg?.identityEnabled && pg.identityGuildId === ctx.guildId);

    const result = ctx.app.communityService.claimTagReward(
      profileFromContext(ctx),
      ctx.guildId,
      env.TAG_REWARD_GUILD_ID,
      env.TAG_REWARD_AMOUNT,
      env.TAG_REWARD_COOLDOWN_HOURS,
      hasTagActive
    );

    if (!result.ok) {
      await reply(ctx, result.reason, { title: 'Community Tag Reward' });
      return;
    }

    if (result.phase === 'initiated') {
      await reply(
        ctx,
        'Tag reward initiated! Keep your server tag active and check back after 24 hours to collect your reward.',
        { title: 'Community Tag Reward' }
      );
      return;
    }

    // phase === 'collected'
    await replyFields(ctx, {
      title: 'Community Tag Reward',
      tone: 'success',
      fields: [{ name: 'Reward', value: formatCurrency(result.amount), inline: true }],
      description: 'Tag verified — reward collected!',
      compact: true
    });
  }
}

@Declare({
  name: 'community',
  description: 'Community economy commands',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options([TagRewardSubCommand])
export default class CommunityCommand extends Command {}
