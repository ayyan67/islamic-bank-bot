import {
  Command,
  Declare,
  Middlewares,
  Options,
  SubCommand,
  createChannelOption,
  createRoleOption,
  createStringOption
} from 'seyfert';
import {
  ADMIN_DEFAULT_MEMBER_PERMISSIONS,
  CONTEXTS_GUILD,
  INTEGRATION_TYPES_GLOBAL
} from '../../infra/discord/commandPolicy.js';
import { logger } from '../../infra/logging/logger.js';
import {
  parseEmojiInput,
  parseMessageRef,
  parsePanelLines,
  resolvableFromBinding,
  roleNameKey
} from '../../modules/reaction-roles/parse.js';
import type { ReactionRoleBinding } from '../../modules/reaction-roles/types.js';
import { reply, replyFields, replyList } from '../shared.js';

const TITLE = 'Reaction Roles';
const SYNC_DELAY_MS = 350;

function parseRoleId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const role = input as Record<string, unknown>;
  if (typeof role.id === 'string') return role.id;
  const nested = role.role as Record<string, unknown> | undefined;
  return nested && typeof nested.id === 'string' ? nested.id : null;
}

function parseChannelId(input: unknown): string | null {
  if (!input) return null;
  if (typeof input === 'string') return input;
  const ch = input as Record<string, unknown>;
  return typeof ch.id === 'string' ? ch.id : null;
}

/** Resolve the message option (+ optional channel option) into a concrete channel/message pair. */
function resolveTarget(ctx: any): { ok: true; ref: { channelId: string; messageId: string } } | { ok: false; reason: string } {
  const ref = parseMessageRef(ctx.options.message);
  if (!ref) {
    return { ok: false, reason: 'Provide a message link (right-click → Copy Message Link) or a message ID.' };
  }
  if (ref.guildId && ref.guildId !== ctx.guildId) {
    return { ok: false, reason: 'That message link points to a different server.' };
  }
  const channelId = ref.channelId ?? parseChannelId(ctx.options.channel) ?? ctx.channelId;
  if (!channelId) {
    return { ok: false, reason: 'Could not work out which channel the message is in. Use a full message link.' };
  }
  return { ok: true, ref: { channelId, messageId: ref.messageId } };
}

/** Can the bot assign this role? Checks managed flag and hierarchy against the bot's top role. */
async function checkManageable(ctx: any, roleId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const role = await ctx.client.roles.fetch(ctx.guildId, roleId);
    if (role?.managed) return { ok: false, reason: `<@&${roleId}> is managed by an integration and cannot be assigned.` };
    if (role?.id === ctx.guildId) return { ok: false, reason: '@everyone cannot be a reaction role.' };
    const botId = ctx.client.botId ?? ctx.client.applicationId;
    const me = await ctx.client.members.fetch(ctx.guildId, botId);
    const highest = await me.roles.highest();
    if (typeof role?.position === 'number' && typeof highest?.position === 'number' && role.position >= highest.position) {
      return {
        ok: false,
        reason: `I can't assign <@&${roleId}> because it is above my highest role. Move my role higher in Server Settings → Roles.`
      };
    }
    return { ok: true };
  } catch (error) {
    logger.warn({ error: (error as Error)?.message, roleId }, 'Role hierarchy check failed; allowing bind');
    return { ok: true };
  }
}

async function seedReaction(ctx: any, channelId: string, messageId: string, resolvable: any): Promise<boolean> {
  try {
    await ctx.client.reactions.add(messageId, channelId, resolvable);
    return true;
  } catch (error) {
    logger.warn({ error: (error as Error)?.message, channelId, messageId }, 'Could not add seed reaction');
    return false;
  }
}

function describe(b: ReactionRoleBinding): string {
  return `${b.emojiDisplay} → <@&${b.roleId}>`;
}

function messageLink(guildId: string, b: { channelId: string; messageId: string }): string {
  return `https://discord.com/channels/${guildId}/${b.channelId}/${b.messageId}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------

@Declare({ name: 'bind', description: 'Bind an emoji on a message to a role' })
@Middlewares(['permissionPolicy'])
@Options({
  message: createStringOption({ description: 'Message link or ID', required: true }),
  emoji: createStringOption({ description: 'Emoji to react with (unicode or custom)', required: true }),
  role: createRoleOption({ description: 'Role to grant', required: true }),
  channel: createChannelOption({ description: 'Channel of the message (only needed with a bare ID)', required: false })
})
class RolesBindSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = resolveTarget(ctx);
    if (!target.ok) return void (await reply(ctx, target.reason, { title: TITLE }));

    const emoji = parseEmojiInput(ctx.options.emoji);
    if (!emoji) return void (await reply(ctx, 'That does not look like a single emoji. Use one unicode emoji or a custom emoji from this server.', { title: TITLE }));

    const roleId = parseRoleId(ctx.options.role);
    if (!roleId) return void (await reply(ctx, 'Unable to resolve that role.', { title: TITLE }));

    const manageable = await checkManageable(ctx, roleId);
    if (!manageable.ok) return void (await reply(ctx, manageable.reason, { title: TITLE }));

    const { channelId, messageId } = target.ref;
    const result = ctx.app.reactionRolesService.bind({
      guildId: ctx.guildId,
      channelId,
      messageId,
      emojiKey: emoji.key,
      emojiDisplay: emoji.display,
      roleId,
      createdBy: ctx.author.id
    });
    if (!result.ok) return void (await reply(ctx, result.reason, { title: TITLE }));

    const seeded = await seedReaction(ctx, channelId, messageId, emoji.resolvable);
    await replyFields(ctx, {
      title: TITLE,
      tone: seeded ? 'success' : 'warning',
      description: `${result.replaced ? 'Updated' : 'Bound'} ${describe(result.binding)} on [this message](${messageLink(ctx.guildId, result.binding)}).${
        seeded ? '' : '\n⚠️ I could not add the reaction myself. Check I have **Add Reactions** and **Read Message History** in that channel, or react once manually.'
      }`,
      fields: [],
      compact: true
    });
  }
}

@Declare({ name: 'unbind', description: 'Remove a reaction role from a message' })
@Middlewares(['permissionPolicy'])
@Options({
  message: createStringOption({ description: 'Message link or ID', required: true }),
  emoji: createStringOption({ description: 'Emoji to unbind (omit to clear all bindings on the message)', required: false }),
  channel: createChannelOption({ description: 'Channel of the message (only needed with a bare ID)', required: false })
})
class RolesUnbindSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = resolveTarget(ctx);
    if (!target.ok) return void (await reply(ctx, target.reason, { title: TITLE }));
    const { messageId } = target.ref;

    if (!ctx.options.emoji) {
      const removed = ctx.app.reactionRolesService.unbindMessage(ctx.guildId, messageId);
      await reply(ctx, removed > 0 ? `Removed ${removed} reaction role${removed === 1 ? '' : 's'} from that message.` : 'That message has no reaction roles.', { title: TITLE, tone: removed > 0 ? 'success' : 'warning' });
      return;
    }

    const emoji = parseEmojiInput(ctx.options.emoji);
    if (!emoji) return void (await reply(ctx, 'That does not look like a single emoji.', { title: TITLE }));
    const removed = ctx.app.reactionRolesService.unbind(ctx.guildId, messageId, emoji.key);
    await reply(ctx, removed ? `Unbound ${emoji.display} from that message.` : `${emoji.display} is not bound on that message.`, { title: TITLE, tone: removed ? 'success' : 'warning' });
  }
}

@Declare({ name: 'list', description: 'Show reaction roles configured in this server' })
@Middlewares(['permissionPolicy'])
@Options({
  message: createStringOption({ description: 'Only show bindings for this message link or ID', required: false })
})
class RolesListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    let bindings: ReactionRoleBinding[];
    if (ctx.options.message) {
      const target = resolveTarget(ctx);
      if (!target.ok) return void (await reply(ctx, target.reason, { title: TITLE }));
      bindings = ctx.app.reactionRolesService.listForMessage(ctx.guildId, target.ref.messageId);
    } else {
      bindings = ctx.app.reactionRolesService.listForGuild(ctx.guildId);
    }

    if (bindings.length === 0) {
      await reply(ctx, 'No reaction roles configured yet. Use `/roles bind` or `/roles import` on an existing role panel.', { title: TITLE });
      return;
    }

    const byMessage = new Map<string, ReactionRoleBinding[]>();
    for (const b of bindings) {
      const key = `${b.channelId}/${b.messageId}`;
      byMessage.set(key, [...(byMessage.get(key) ?? []), b]);
    }
    const lines: string[] = [];
    for (const [, group] of byMessage) {
      const first = group[0]!;
      lines.push(`**[Message](${messageLink(ctx.guildId, first)})** in <#${first.channelId}>`);
      for (const b of group) lines.push(`› ${describe(b)}`);
    }
    await replyList(ctx, { title: TITLE, lines: lines.slice(0, 60) });
  }
}

@Declare({ name: 'import', description: 'Read a "Role emoji" panel message and bind every line to its matching role' })
@Middlewares(['permissionPolicy'])
@Options({
  message: createStringOption({ description: 'Message link or ID of the existing role panel', required: true }),
  channel: createChannelOption({ description: 'Channel of the message (only needed with a bare ID)', required: false })
})
class RolesImportSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = resolveTarget(ctx);
    if (!target.ok) return void (await reply(ctx, target.reason, { title: TITLE }));
    const { channelId, messageId } = target.ref;

    let content = '';
    try {
      const msg = await ctx.client.messages.fetch(messageId, channelId);
      content = String(msg?.content ?? '');
      if (!content && Array.isArray(msg?.embeds)) {
        content = msg.embeds.map((e: any) => [e.title, e.description, ...(e.fields ?? []).map((f: any) => `${f.name}\n${f.value}`)].filter(Boolean).join('\n')).join('\n');
      }
    } catch {
      await reply(ctx, 'I could not read that message. Check the link and that I can see the channel.', { title: TITLE });
      return;
    }

    const lines = parsePanelLines(content);
    if (lines.length === 0) {
      await reply(ctx, 'I could not find any "Role-Name emoji" lines in that message.', { title: TITLE });
      return;
    }

    const roles: any[] = await ctx.client.roles.list(ctx.guildId);
    const roleByKey = new Map<string, any>();
    for (const r of roles) roleByKey.set(roleNameKey(r.name), r);

    const bound: string[] = [];
    const skipped: string[] = [];
    for (const line of lines) {
      const role = roleByKey.get(roleNameKey(line.roleName));
      if (!role) {
        skipped.push(`${line.emoji.display} ${line.roleName} — no role with that name`);
        continue;
      }
      const manageable = await checkManageable(ctx, role.id);
      if (!manageable.ok) {
        skipped.push(`${line.emoji.display} ${line.roleName} — above my highest role`);
        continue;
      }
      const result = ctx.app.reactionRolesService.bind({
        guildId: ctx.guildId,
        channelId,
        messageId,
        emojiKey: line.emoji.key,
        emojiDisplay: line.emoji.display,
        roleId: role.id,
        createdBy: ctx.author.id
      });
      if (!result.ok) {
        skipped.push(`${line.emoji.display} ${line.roleName} — ${result.reason}`);
        continue;
      }
      await seedReaction(ctx, channelId, messageId, line.emoji.resolvable);
      bound.push(describe(result.binding));
    }

    const fields = [];
    if (bound.length) fields.push({ name: `Bound (${bound.length})`, value: bound.join('\n').slice(0, 1024), inline: false });
    if (skipped.length) fields.push({ name: `Skipped (${skipped.length})`, value: skipped.join('\n').slice(0, 1024), inline: false });
    await replyFields(ctx, {
      title: TITLE,
      tone: bound.length ? 'success' : 'warning',
      description: `Imported [this panel](${messageLink(ctx.guildId, { channelId, messageId })}). Run \`/roles sync\` on it to grant roles to people who already reacted.`,
      fields,
      compact: true
    });
  }
}

@Declare({ name: 'sync', description: 'Grant roles to everyone who already reacted on a bound message' })
@Middlewares(['permissionPolicy'])
@Options({
  message: createStringOption({ description: 'Message link or ID', required: true }),
  channel: createChannelOption({ description: 'Channel of the message (only needed with a bare ID)', required: false })
})
class RolesSyncSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = resolveTarget(ctx);
    if (!target.ok) return void (await reply(ctx, target.reason, { title: TITLE }));
    const { channelId, messageId } = target.ref;

    const bindings: ReactionRoleBinding[] = ctx.app.reactionRolesService.listForMessage(ctx.guildId, messageId);
    if (bindings.length === 0) {
      await reply(ctx, 'That message has no reaction roles. Bind or import first.', { title: TITLE });
      return;
    }

    await reply(ctx, `Syncing ${bindings.length} reaction role${bindings.length === 1 ? '' : 's'}… this can take a few minutes on a busy panel. I will post a summary here when done.`, { title: TITLE, tone: 'info' });

    const client = ctx.client;
    const guildId: string = ctx.guildId;
    const botId = client.botId ?? client.applicationId;

    void (async () => {
      const summary: string[] = [];
      let totalAdded = 0;
      let totalFailed = 0;
      for (const b of bindings) {
        let added = 0;
        let already = 0;
        let failed = 0;
        try {
          const resolvable = resolvableFromBinding(b);
          let after: string | undefined;
          for (;;) {
            const users: any[] = await client.reactions.fetch(messageId, channelId, resolvable, { limit: 100, ...(after ? { after } : {}) });
            if (!users.length) break;
            for (const u of users) {
              if (u.bot || u.id === botId) continue;
              try {
                const member = await client.members.fetch(guildId, u.id);
                const roleIds: string[] = member?.roles?.keys ?? [];
                if (roleIds.includes(b.roleId)) {
                  already++;
                  continue;
                }
                await client.members.addRole(guildId, u.id, b.roleId);
                added++;
                await sleep(SYNC_DELAY_MS);
              } catch {
                failed++;
              }
            }
            if (users.length < 100) break;
            after = users[users.length - 1]!.id;
          }
        } catch (error) {
          logger.warn({ error: (error as Error)?.message, messageId, emoji: b.emojiDisplay }, 'Reaction sync failed for binding');
          failed++;
        }
        totalAdded += added;
        totalFailed += failed;
        summary.push(`${b.emojiDisplay} <@&${b.roleId}> — +${added}, ${already} already had it${failed ? `, ${failed} failed` : ''}`);
      }

      try {
        await client.messages.write(ctx.channelId, {
          embeds: [
            {
              title: '🎭 Reaction Roles — Sync Complete',
              description: summary.join('\n').slice(0, 4000),
              color: totalFailed ? 0xf59e0b : 0x22c55e,
              footer: { text: `Granted ${totalAdded} role${totalAdded === 1 ? '' : 's'}${totalFailed ? ` · ${totalFailed} failed (missing members or permissions)` : ''}` }
            }
          ]
        });
      } catch (error) {
        logger.warn({ error: (error as Error)?.message }, 'Could not post reaction sync summary');
      }
    })().catch((error) => logger.error({ error }, 'Reaction sync crashed'));
  }
}

@Declare({
  name: 'roles',
  description: 'Reaction roles: bind emojis on a message to roles',
  aliases: ['rr'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Middlewares(['permissionPolicy'])
@Options([RolesBindSubCommand, RolesUnbindSubCommand, RolesListSubCommand, RolesImportSubCommand, RolesSyncSubCommand])
export default class RolesCommand extends Command {}
