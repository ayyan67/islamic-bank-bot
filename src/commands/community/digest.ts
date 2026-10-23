import { Command, Declare, Middlewares, Options, SubCommand } from 'seyfert';
import { ADMIN_DEFAULT_MEMBER_PERMISSIONS, CONTEXTS_GUILD, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { buildDigestEmbed } from '../../modules/digest/service.js';
import { reply } from '../shared.js';

@Declare({
  name: 'now',
  description: 'Post the weekly digest to this channel now',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Middlewares(['permissionPolicy'])
class DigestNowSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }
    const digest = ctx.app.digestService.computeWeeklyDigest(ctx.guildId);
    await ctx.editOrReply(buildDigestEmbed(digest));
  }
}

@Declare({
  name: 'set-channel',
  description: 'Post the weekly digest to this channel every Friday',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Middlewares(['permissionPolicy'])
class DigestSetChannelSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId || !ctx.channelId) {
      await reply(ctx, 'This command can only be used in a server channel.');
      return;
    }
    ctx.app.guildSettingsService.setDigestChannelId(ctx.guildId, ctx.channelId);
    await reply(ctx, `Success — the weekly digest will be posted in <#${ctx.channelId}> every Friday.`);
  }
}

@Declare({
  name: 'disable',
  description: 'Stop posting the weekly digest',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Middlewares(['permissionPolicy'])
class DigestDisableSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }
    ctx.app.guildSettingsService.setDigestChannelId(ctx.guildId, null);
    await reply(ctx, 'Weekly digest disabled.');
  }
}

@Declare({
  name: 'digest',
  description: 'Weekly community digest',
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS,
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD]
})
@Options([DigestNowSubCommand, DigestSetChannelSubCommand, DigestDisableSubCommand])
export default class DigestCommand extends Command {}
