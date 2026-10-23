import {
  ActionRow,
  Command,
  Declare,
  Group,
  Groups,
  Middlewares,
  Options,
  StringSelectMenu,
  StringSelectOption,
  SubCommand,
  createIntegerOption,
  createRoleOption,
  createStringOption,
  createUserOption
} from 'seyfert';
import {
  CONTEXTS_GUILD,
  INTEGRATION_TYPES_GLOBAL
} from '../../infra/discord/commandPolicy.js';
import type { AdminRoleEntry, AdminUserEntry } from '../../modules/access/types.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { profileFromContext, profileFromUnknown } from '../../infra/discord/profile.js';
import { env } from '../../config/env.js';
import { GUILD_SETTING_DEFS, type GuildSettingKey } from '../../modules/guild-settings/types.js';
import {
  NOTIFICATION_EVENT_DEFINITIONS,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENT_TYPES,
  NotificationDefaultMode,
  NotificationEventType
} from '../../modules/notifications/types.js';
import { buildReplyPayload, mention, reply, replyFields, replyList } from '../shared.js';

function parseOptionalNote(note: unknown): string | undefined {
  if (typeof note !== 'string') {
    return undefined;
  }

  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseRoleId(input: unknown): string | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const role = input as Record<string, unknown>;
  if (typeof role.id === 'string') {
    return role.id;
  }

  const nestedRole = role.role;
  if (nestedRole && typeof nestedRole === 'object' && typeof (nestedRole as Record<string, unknown>).id === 'string') {
    return (nestedRole as Record<string, unknown>).id as string;
  }

  return null;
}

async function ensureOwner(ctx: any): Promise<boolean> {
  if (ctx.app.accessService.isOwner(ctx.author.id)) {
    return true;
  }

  await reply(ctx, 'Only bot owners can assign or remove admin users/roles.');
  return false;
}

const NOTIFY_EVENT_CHOICES = NOTIFICATION_EVENT_DEFINITIONS.map((entry) => ({
  name: entry.label,
  value: entry.type
}));

const NOTIFY_DEFAULT_MODE_CHOICES = [
  { name: 'Off', value: 'off' },
  { name: 'DM Only', value: 'dm_only' },
  { name: 'DM + Channel Fallback', value: 'dm_fallback' }
] as const;

function parseNotifyEventType(raw: unknown): NotificationEventType | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType)) {
    return value as NotificationEventType;
  }

  return null;
}

function parseNotifyDefaultMode(raw: unknown): NotificationDefaultMode | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === 'off' || value === 'dm_only' || value === 'dm_fallback') {
    return value;
  }

  return null;
}

@Declare({
  name: 'award',
  description: 'Award wallet funds to a user',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Middlewares(['permissionPolicy'])
@Options({
  user: createUserOption({
    description: 'User to award funds to',
    required: true
  }),
  amount: createIntegerOption({
    description: 'Amount to award',
    required: true,
    min_value: 1
  }),
  note: createStringOption({
    description: 'Optional audit note',
    required: false,
    max_length: 250
  })
})
class AdminAwardSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    let userRaw: unknown = ctx.options.user;
    let amountRaw: unknown = ctx.options.amount;

    // Prefix fallback: Seyfert lumps trailing tokens into the -user value
    // (e.g. ".award @User 500" → -user "@User 500"). Split them apart and
    // also read from raw message content when the amount is missing entirely.
    if (typeof userRaw === 'string' && !amountRaw) {
      const parts = userRaw.trim().split(/\s+/);
      if (parts.length >= 2) {
        const last = parts[parts.length - 1] ?? '';
        if (/^\d+$/.test(last)) {
          amountRaw = last;
          userRaw = parts.slice(0, -1).join(' ');
        }
      }
    }
    if (!amountRaw && ctx.message?.content) {
      const match = String(ctx.message.content).trim().match(/\b(\d+)\s*$/);
      if (match?.[1]) amountRaw = match[1];
    }

    const target = profileFromUnknown(userRaw);
    if (!target) {
      await reply(ctx, 'Unable to resolve target user.');
      return;
    }

    const amount = Number(amountRaw ?? 0);
    const note = parseOptionalNote(ctx.options.note);
    const result = ctx.app.economyService.adminAward(profileFromContext(ctx), target, amount, note, {
      guildId: ctx.guildId ?? null,
      sourceChannelId: ctx.channelId ?? null
    });

    if (!result.ok) {
      await reply(ctx, result.reason ?? 'Unable to award funds.');
      return;
    }

    const noteSuffix = note ? ` Note: ${note}` : '';
    await replyFields(ctx, {
      title: 'Admin Award',
      tone: 'success',
      fields: [
        { name: 'User', value: mention(target.discordUserId), inline: true },
        { name: 'Amount', value: formatCurrency(amount), inline: true },
        {
          name: 'Balance',
          value: `${formatCurrency(result.before)} → ${formatCurrency(result.after)}`,
          inline: true
        }
      ],
      description: noteSuffix.trim().length > 0 ? noteSuffix.trim() : undefined,
      compact: true
    });
  }
}

@Declare({
  name: 'take',
  description: 'Take wallet funds from a user',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Middlewares(['permissionPolicy'])
@Options({
  user: createUserOption({
    description: 'User to take funds from',
    required: true
  }),
  amount: createIntegerOption({
    description: 'Amount to take',
    required: true,
    min_value: 1
  }),
  note: createStringOption({
    description: 'Optional audit note',
    required: false,
    max_length: 250
  })
})
class AdminTakeSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    let userRaw: unknown = ctx.options.user;
    let amountRaw: unknown = ctx.options.amount;

    if (typeof userRaw === 'string' && !amountRaw) {
      const parts = userRaw.trim().split(/\s+/);
      if (parts.length >= 2) {
        const last = parts[parts.length - 1] ?? '';
        if (/^\d+$/.test(last)) {
          amountRaw = last;
          userRaw = parts.slice(0, -1).join(' ');
        }
      }
    }
    if (!amountRaw && ctx.message?.content) {
      const match = String(ctx.message.content).trim().match(/\b(\d+)\s*$/);
      if (match?.[1]) amountRaw = match[1];
    }

    const target = profileFromUnknown(userRaw);
    if (!target) {
      await reply(ctx, 'Unable to resolve target user.');
      return;
    }

    const amount = Number(amountRaw ?? 0);
    const note = parseOptionalNote(ctx.options.note);
    const result = ctx.app.economyService.adminTake(profileFromContext(ctx), target, amount, note, {
      guildId: ctx.guildId ?? null,
      sourceChannelId: ctx.channelId ?? null
    });

    if (!result.ok) {
      await reply(ctx, result.reason ?? 'Unable to take funds.');
      return;
    }

    const noteSuffix = note ? ` Note: ${note}` : '';
    await replyFields(ctx, {
      title: 'Admin Take',
      tone: 'success',
      fields: [
        { name: 'User', value: mention(target.discordUserId), inline: true },
        { name: 'Amount', value: formatCurrency(amount), inline: true },
        {
          name: 'Balance',
          value: `${formatCurrency(result.before)} → ${formatCurrency(result.after)}`,
          inline: true
        }
      ],
      description: noteSuffix.trim().length > 0 ? noteSuffix.trim() : undefined,
      compact: true
    });
  }
}

@Declare({
  name: 'set-balance',
  description: 'Set a user wallet balance',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Middlewares(['permissionPolicy'])
@Options({
  user: createUserOption({
    description: 'User whose balance to set',
    required: true
  }),
  amount: createIntegerOption({
    description: 'New wallet balance',
    required: true,
    min_value: 0
  }),
  note: createStringOption({
    description: 'Optional audit note',
    required: false,
    max_length: 250
  })
})
class AdminSetBalanceSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    let userRaw: unknown = ctx.options.user;
    let amountRaw: unknown = ctx.options.amount;

    if (typeof userRaw === 'string' && !amountRaw) {
      const parts = userRaw.trim().split(/\s+/);
      if (parts.length >= 2) {
        const last = parts[parts.length - 1] ?? '';
        if (/^\d+$/.test(last)) {
          amountRaw = last;
          userRaw = parts.slice(0, -1).join(' ');
        }
      }
    }
    if (!amountRaw && ctx.message?.content) {
      const match = String(ctx.message.content).trim().match(/\b(\d+)\s*$/);
      if (match?.[1]) amountRaw = match[1];
    }

    const target = profileFromUnknown(userRaw);
    if (!target) {
      await reply(ctx, 'Unable to resolve target user.');
      return;
    }

    const amount = Number(amountRaw ?? 0);
    const note = parseOptionalNote(ctx.options.note);
    const result = ctx.app.economyService.adminSetBalance(profileFromContext(ctx), target, amount, note, {
      guildId: ctx.guildId ?? null,
      sourceChannelId: ctx.channelId ?? null
    });

    if (!result.ok) {
      await reply(ctx, result.reason ?? 'Unable to set wallet balance.');
      return;
    }

    const noteSuffix = note ? ` Note: ${note}` : '';
    await replyFields(ctx, {
      title: 'Admin Set Wallet',
      tone: 'success',
      fields: [
        { name: 'User', value: mention(target.discordUserId), inline: true },
        { name: 'New Balance', value: formatCurrency(result.after), inline: true },
        { name: 'Delta', value: formatCurrency(result.delta), inline: true }
      ],
      description: noteSuffix.trim().length > 0 ? noteSuffix.trim() : undefined,
      compact: true
    });
  }
}

@Declare({
  name: 'set',
  description: 'Set a user vault balance',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('vault')
@Middlewares(['permissionPolicy'])
@Options({
  user: createUserOption({
    description: 'User whose vault to set',
    required: true
  }),
  amount: createIntegerOption({
    description: 'New vault balance',
    required: true,
    min_value: 0
  }),
  note: createStringOption({
    description: 'Optional audit note',
    required: false,
    max_length: 250
  })
})
class AdminVaultSetSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve target user.');
      return;
    }

    const amount = Number(ctx.options.amount ?? 0);
    const note = parseOptionalNote(ctx.options.note);
    const result = ctx.app.vaultService.adminSetBalance(profileFromContext(ctx), target, amount, note);

    if (!result.ok) {
      await reply(ctx, result.reason ?? 'Unable to set vault balance.');
      return;
    }

    const noteSuffix = note ? ` Note: ${note}` : '';
    await replyFields(ctx, {
      title: 'Admin Set Vault',
      tone: 'success',
      fields: [
        { name: 'User', value: mention(target.discordUserId), inline: true },
        { name: 'New Vault', value: formatCurrency(result.after), inline: true },
        { name: 'Delta', value: formatCurrency(result.delta), inline: true }
      ],
      description: noteSuffix.trim().length > 0 ? noteSuffix.trim() : undefined,
      compact: true
    });
  }
}

@Declare({
  name: 'list',
  description: 'List current owners/admin users/admin roles',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Middlewares(['permissionPolicy'])
class AdminListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const admins = ctx.app.accessService.listEffectiveAdmins(ctx.guildId);
    const owners = env.OWNER_IDS.length > 0 ? env.OWNER_IDS.map((id) => mention(id)).join(', ') : 'None configured';
    const globalAdmins =
      admins.globalUsers.length > 0
        ? admins.globalUsers.map((entry: AdminUserEntry) => mention(entry.userId)).join(', ')
        : 'None';
    const guildAdmins =
      admins.guildUsers.length > 0
        ? admins.guildUsers.map((entry: AdminUserEntry) => mention(entry.userId)).join(', ')
        : 'None';
    const guildAdminRoles =
      admins.guildRoles.length > 0
        ? admins.guildRoles.map((entry: AdminRoleEntry) => `<@&${entry.roleId}>`).join(', ')
        : 'None';

    await replyList(ctx, {
      title: 'Admin Configuration',
      lines: [
        `Owners: ${owners}`,
        `Global admin users: ${globalAdmins}`,
        `Guild admin users: ${guildAdmins}`,
        `Guild admin roles: ${guildAdminRoles}`
      ]
    });
  }
}

@Declare({
  name: 'add',
  description: 'Add a guild admin role',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('role')
@Middlewares(['permissionPolicy'])
@Options({
  role: createRoleOption({
    description: 'Role to grant admin access',
    required: true
  })
})
class AdminRoleAddSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    if (!(await ensureOwner(ctx))) {
      return;
    }

    const roleId = parseRoleId(ctx.options.role);
    if (!roleId) {
      await reply(ctx, 'Unable to resolve role.');
      return;
    }

    const created = ctx.app.accessService.addGuildAdminRole(ctx.guildId, roleId, ctx.author.id);
    await replyFields(ctx, {
      title: created ? 'Admin Role Added' : 'Admin Role Unchanged',
      tone: created ? 'success' : 'warning',
      fields: [{ name: 'Role', value: `<@&${roleId}>`, inline: true }],
      description: created ? 'Role can now execute protected commands.' : 'That role is already configured.',
      compact: true
    });
  }
}

@Declare({
  name: 'remove',
  description: 'Remove a guild admin role',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('role')
@Middlewares(['permissionPolicy'])
@Options({
  role: createRoleOption({
    description: 'Role to remove from admin access',
    required: true
  })
})
class AdminRoleRemoveSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    if (!(await ensureOwner(ctx))) {
      return;
    }

    const roleId = parseRoleId(ctx.options.role);
    if (!roleId) {
      await reply(ctx, 'Unable to resolve role.');
      return;
    }

    const removed = ctx.app.accessService.removeGuildAdminRole(ctx.guildId, roleId);
    await replyFields(ctx, {
      title: removed ? 'Admin Role Removed' : 'Admin Role Not Found',
      tone: removed ? 'success' : 'warning',
      fields: [{ name: 'Role', value: `<@&${roleId}>`, inline: true }],
      compact: true
    });
  }
}

@Declare({
  name: 'add',
  description: 'Add an admin user (global or guild-scoped)',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('user')
@Middlewares(['permissionPolicy'])
@Options({
  user: createUserOption({
    description: 'User to grant admin access',
    required: true
  }),
  scope: createStringOption({
    description: 'Admin scope (default: guild)',
    required: false,
    choices: [
      { name: 'guild', value: 'guild' },
      { name: 'global', value: 'global' }
    ]
  })
})
class AdminUserAddSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!(await ensureOwner(ctx))) {
      return;
    }

    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve target user.');
      return;
    }

    const scope = ctx.options.scope ?? 'guild';

    if (scope === 'global') {
      const created = ctx.app.accessService.addGlobalAdminUser(target.discordUserId, ctx.author.id);
      await replyFields(ctx, {
        title: created ? 'Global Admin Added' : 'Global Admin Unchanged',
        tone: created ? 'success' : 'warning',
        fields: [{ name: 'User', value: mention(target.discordUserId), inline: true }],
        compact: true
      });
      return;
    }

    if (!ctx.guildId) {
      await reply(ctx, 'Guild-scoped admins can only be added inside a server.');
      return;
    }

    const created = ctx.app.accessService.addGuildAdminUser(ctx.guildId, target.discordUserId, ctx.author.id);
    await replyFields(ctx, {
      title: created ? 'Guild Admin Added' : 'Guild Admin Unchanged',
      tone: created ? 'success' : 'warning',
      fields: [
        { name: 'User', value: mention(target.discordUserId), inline: true },
        { name: 'Scope', value: 'This server', inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'remove',
  description: 'Remove an admin user (global or guild-scoped)',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('user')
@Middlewares(['permissionPolicy'])
@Options({
  user: createUserOption({
    description: 'User to remove from admin access',
    required: true
  }),
  scope: createStringOption({
    description: 'Admin scope (default: guild)',
    required: false,
    choices: [
      { name: 'guild', value: 'guild' },
      { name: 'global', value: 'global' }
    ]
  })
})
class AdminUserRemoveSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!(await ensureOwner(ctx))) {
      return;
    }

    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve target user.');
      return;
    }

    const scope = ctx.options.scope ?? 'guild';

    if (scope === 'global') {
      const removed = ctx.app.accessService.removeGlobalAdminUser(target.discordUserId);
      await replyFields(ctx, {
        title: removed ? 'Global Admin Removed' : 'Global Admin Not Found',
        tone: removed ? 'success' : 'warning',
        fields: [{ name: 'User', value: mention(target.discordUserId), inline: true }],
        compact: true
      });
      return;
    }

    if (!ctx.guildId) {
      await reply(ctx, 'Guild-scoped admins can only be removed inside a server.');
      return;
    }

    const removed = ctx.app.accessService.removeGuildAdminUser(ctx.guildId, target.discordUserId);
    await replyFields(ctx, {
      title: removed ? 'Guild Admin Removed' : 'Guild Admin Not Found',
      tone: removed ? 'success' : 'warning',
      fields: [
        { name: 'User', value: mention(target.discordUserId), inline: true },
        { name: 'Scope', value: 'This server', inline: true }
      ],
      compact: true
    });
  }
}

const COOLDOWN_CHOICES = [
  { name: 'timely', value: 'timely' },
  { name: 'prayer (all)', value: 'prayer' },
  { name: 'prayer fajr', value: 'prayer:fajr' },
  { name: 'prayer dhuhr', value: 'prayer:dhuhr' },
  { name: 'prayer asr', value: 'prayer:asr' },
  { name: 'prayer maghrib', value: 'prayer:maghrib' },
  { name: 'prayer isha', value: 'prayer:isha' },
  { name: 'all', value: 'all' }
] as const;

@Declare({
  name: 'set',
  description: 'Set a guild config value',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('config')
@Middlewares(['permissionPolicy'])
@Options({
  key: createStringOption({
    description: 'Setting key (e.g. timelyAmount)',
    required: true,
    choices: GUILD_SETTING_DEFS.map((d) => ({ name: d.key, value: d.key }))
  }),
  value: createStringOption({
    description: 'New value',
    required: true
  })
})
class AdminConfigSetSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const key = String(ctx.options.key);
    const rawValue = String(ctx.options.value);
    const result = ctx.app.guildSettingsService.setSetting(ctx.guildId, key, rawValue);

    if (!result.ok) {
      await reply(ctx, result.reason);
      return;
    }

    await replyFields(ctx, {
      title: 'Setting Updated',
      tone: 'success',
      fields: [
        { name: 'Key', value: result.key, inline: true },
        { name: 'Value', value: String(result.value), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'view',
  description: 'View all guild config settings with interactive editor',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('config')
@Middlewares(['permissionPolicy'])
class AdminConfigViewSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const effective = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
    const overrides = ctx.app.guildSettingsService.getOverrides(ctx.guildId);
    const overrideKeys = new Set(overrides.map((o: { key: string }) => o.key));

    const lines = GUILD_SETTING_DEFS.map((def) => {
      const value = (effective as unknown as Record<string, unknown>)[def.key];
      const isOverridden = overrideKeys.has(def.key);
      const marker = isOverridden ? '(override)' : '(default)';
      return `**${def.label}** (\`${def.key}\`)\n${value} *${marker}*`;
    });

    // Build a select menu for quick editing
    const selectOptions = GUILD_SETTING_DEFS.map((def) => {
      const value = (effective as unknown as Record<string, unknown>)[def.key];
      const desc = `Current: ${value} | ${def.type === 'boolean' ? 'true/false' : `${def.min ?? 0}-${def.max ?? '...'}`}`;
      return new StringSelectOption()
        .setLabel(def.label.slice(0, 100))
        .setValue(def.key)
        .setDescription(desc.slice(0, 100));
    });

    const selectRow = new ActionRow<StringSelectMenu>().addComponents(
      new StringSelectMenu()
        .setCustomId('config_edit_select')
        .setPlaceholder('Select a setting to edit...')
        .setOptions(selectOptions)
    );

    const payload = buildReplyPayload({
      fullCommandName: 'admin config view',
      requesterName: ctx.author.username ?? 'user',
      content: lines.join('\n\n'),
      options: {
        title: 'Guild Configuration',
        compact: true,
        components: [selectRow]
      }
    });

    const response = await ctx.editOrReply(payload, true);
    if (!response) return;

    const messageId = response?.id;
    const channelId = response?.channelId ?? response?.channel_id ?? ctx.channelId;
    if (!messageId) return;

    const collector = ctx.client.components.createComponentCollector(
      messageId,
      channelId,
      ctx.guildId,
      {
        timeout: 5 * 60 * 1000,
        idle: 5 * 60 * 1000,
        filter: (interaction: any) => interaction.user?.id === ctx.author.id,
        onPass: async (interaction: any) => {
          await interaction.write({
            content: 'Only the admin who ran this command can use these controls.',
            flags: 64
          });
        }
      }
    );

    collector.run('config_edit_select', async (interaction: any, _stop: any, refresh: () => void) => {
      const selectedKey = interaction.values?.[0] as GuildSettingKey | undefined;
      if (!selectedKey) {
        await interaction.deferUpdate();
        return;
      }

      const def = GUILD_SETTING_DEFS.find((d) => d.key === selectedKey);
      if (!def) {
        await interaction.write({ content: 'Unknown setting.', flags: 64 });
        refresh();
        return;
      }

      const currentSettings = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
      const currentValue = (currentSettings as unknown as Record<string, unknown>)[def.key];

      const hint = def.type === 'boolean'
        ? 'Use: `/admin config set key:' + def.key + ' value:true` or `value:false`'
        : `Use: \`/admin config set key:${def.key} value:<number>\`\nRange: ${def.min ?? 0} \u2013 ${def.max ?? '\u221E'}`;

      await interaction.write({
        ...buildReplyPayload({
          fullCommandName: 'admin config',
          requesterName: ctx.author.username ?? 'user',
          content: `**${def.label}** (\`${def.key}\`)\nCurrent value: **${currentValue}**\n\n${hint}`,
          options: { title: 'Edit Setting', tone: 'info', compact: true }
        }),
        flags: 64
      });
      refresh();
    });
  }
}

@Declare({
  name: 'reset',
  description: 'Reset all guild config to defaults',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('config')
@Middlewares(['permissionPolicy'])
class AdminConfigResetSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    ctx.app.guildSettingsService.resetAllSettings(ctx.guildId);
    await reply(ctx, 'All guild config overrides have been reset to defaults.', {
      title: 'Config Reset',
      tone: 'success',
      compact: true
    });
  }
}

@Declare({
  name: 'reset-cooldown',
  description: 'Reset a user cooldown (timely/prayer/all)',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Middlewares(['permissionPolicy'])
@Options({
  user: createUserOption({
    description: 'User whose cooldown to reset',
    required: true
  }),
  type: createStringOption({
    description: 'Cooldown type to reset',
    required: true,
    choices: [...COOLDOWN_CHOICES]
  })
})
class AdminResetCooldownSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const target = profileFromUnknown(ctx.options.user);
    if (!target) {
      await reply(ctx, 'Unable to resolve target user.');
      return;
    }

    const typeName = String(ctx.options.type ?? '').toLowerCase();
    const user = ctx.app.identityRepo.getUserByDiscordId(target.discordUserId);
    if (!user) {
      await reply(ctx, 'That user has no data yet.');
      return;
    }

    const results: string[] = [];

    if (typeName === 'all' || typeName === 'timely') {
      const deleted = ctx.app.ledgerService.deleteLatestByKind(user.id, 'claim_timely');
      results.push(deleted ? 'Timely cooldown reset' : 'No timely cooldown found');
    }

    if (typeName === 'all' || typeName === 'prayer') {
      // Reset all prayer cooldowns — delete checkins + ledger entries
      const checkins = ctx.app.worshipRepo.deleteAllPrayerCheckins(user.id);
      const txCount = ctx.app.ledgerService.deleteAllByKind(user.id, 'claim_prayer');
      results.push(`Prayer cooldowns reset (${checkins} checkins, ${txCount} ledger entries cleared)`);
    }

    if (typeName.startsWith('prayer:')) {
      const prayer = typeName.split(':')[1];
      // Delete the specific prayer checkin + ledger entry
      const checkinDeleted = ctx.app.worshipRepo.deleteLatestPrayerCheckin(user.id, prayer);
      const txDeleted = ctx.app.ledgerService.deleteLatestByKindAndSubtype(user.id, 'claim_prayer', prayer);
      if (checkinDeleted || txDeleted) {
        results.push(`${prayer} prayer cooldown reset`);
      } else {
        results.push(`No ${prayer} prayer cooldown found`);
      }
    }

    if (results.length === 0) {
      await reply(ctx, 'Unknown cooldown type.');
      return;
    }

    await replyFields(ctx, {
      title: 'Cooldown Reset',
      tone: 'success',
      fields: [
        { name: 'User', value: mention(target.discordUserId), inline: true },
        { name: 'Type', value: typeName, inline: true }
      ],
      description: results.join('\n'),
      compact: true
    });
  }
}

@Declare({
  name: 'reset-server-timely',
  description: 'Reset timely cooldown for ALL users server-wide',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Middlewares(['permissionPolicy'])
class AdminResetServerTimelySubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const count = ctx.app.ledgerService.deleteLatestByKindForAllUsers('claim_timely');

    await replyFields(ctx, {
      title: 'Server-Wide Timely Reset',
      tone: 'success',
      fields: [{ name: 'Users Reset', value: String(count), inline: true }],
      description: count > 0
        ? `Timely cooldown cleared for ${count} user${count === 1 ? '' : 's'}. Everyone can claim again.`
        : 'No active timely cooldowns found.',
      compact: true
    });
  }
}

@Declare({
  name: 'defaults-view',
  description: 'View guild notification default modes',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('notify')
@Middlewares(['permissionPolicy'])
@Options({
  event: createStringOption({
    description: 'Optional event to inspect',
    required: false,
    choices: NOTIFY_EVENT_CHOICES
  })
})
class AdminNotifyDefaultsViewSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const eventType = parseNotifyEventType(ctx.options.event);
    if (ctx.options.event && !eventType) {
      await reply(ctx, 'Invalid notification event.');
      return;
    }

    const rows = ctx.app.notificationsService.listGuildDefaults(ctx.guildId, eventType ?? undefined);
    const fields = rows.map((row: any) => ({
      name: row.eventLabel,
      value: `Default mode: \`${row.guildDefaultMode}\``,
      inline: false
    }));

    await replyFields(ctx, {
      title: 'Notification Defaults',
      fields,
      footer: 'Use /admin notify defaults-set to change defaults.',
      compact: true
    });
  }
}

@Declare({
  name: 'defaults-set',
  description: 'Set guild notification default mode for an event',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('notify')
@Middlewares(['permissionPolicy'])
@Options({
  event: createStringOption({
    description: 'Notification event',
    required: true,
    choices: NOTIFY_EVENT_CHOICES
  }),
  mode: createStringOption({
    description: 'Guild default mode',
    required: true,
    choices: [...NOTIFY_DEFAULT_MODE_CHOICES]
  })
})
class AdminNotifyDefaultsSetSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const eventType = parseNotifyEventType(ctx.options.event);
    const mode = parseNotifyDefaultMode(ctx.options.mode);
    if (!eventType || !mode) {
      await reply(ctx, 'Invalid event or mode.');
      return;
    }

    const updated = ctx.app.notificationsService.setGuildDefault(ctx.guildId, ctx.author.id, eventType, mode);
    await replyFields(ctx, {
      title: 'Notification Default Updated',
      tone: 'success',
      fields: [
        { name: 'Event', value: updated.eventLabel, inline: false },
        { name: 'Mode', value: `\`${updated.guildDefaultMode}\``, inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'defaults-reset',
  description: 'Reset guild notification defaults',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('notify')
@Middlewares(['permissionPolicy'])
@Options({
  event: createStringOption({
    description: 'Optional event to reset',
    required: false,
    choices: NOTIFY_EVENT_CHOICES
  })
})
class AdminNotifyDefaultsResetSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const eventType = parseNotifyEventType(ctx.options.event);
    if (ctx.options.event && !eventType) {
      await reply(ctx, 'Invalid event.');
      return;
    }

    const removed = ctx.app.notificationsService.resetGuildDefaults(ctx.guildId, eventType ?? undefined);
    await replyFields(ctx, {
      title: 'Notification Defaults Reset',
      tone: 'success',
      fields: [
        { name: 'Scope', value: eventType ? NOTIFICATION_EVENT_LABELS[eventType] : 'All events', inline: true },
        { name: 'Rows Removed', value: String(removed), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'health',
  description: 'Show notification queue health',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Group('notify')
@Middlewares(['permissionPolicy'])
class AdminNotifyHealthSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const health = ctx.app.notificationsService.getOutboxHealth();
    await replyFields(ctx, {
      title: 'Notification Queue Health',
      fields: [
        { name: 'Pending', value: String(health.pending), inline: true },
        { name: 'Processing', value: String(health.processing), inline: true },
        { name: 'Dead', value: String(health.dead), inline: true },
        { name: 'Sent (24h)', value: String(health.sentLast24h), inline: true },
        { name: 'Recent Failures (1h)', value: String(health.recentFailures), inline: true }
      ],
      compact: true
    });
  }
}

@Declare({
  name: 'admin',
  description: 'Admin privilege and economy commands',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
})
@Groups({
  vault: { defaultDescription: 'Admin vault commands' },
  role: { defaultDescription: 'Admin role management' },
  user: { defaultDescription: 'Admin user management' },
  config: { defaultDescription: 'Guild config management' },
  notify: { defaultDescription: 'Notification defaults and health' }
})
@Middlewares(['permissionPolicy'])
@Options([
  AdminAwardSubCommand,
  AdminTakeSubCommand,
  AdminSetBalanceSubCommand,
  AdminVaultSetSubCommand,
  AdminListSubCommand,
  AdminRoleAddSubCommand,
  AdminRoleRemoveSubCommand,
  AdminUserAddSubCommand,
  AdminUserRemoveSubCommand,
  AdminConfigSetSubCommand,
  AdminConfigViewSubCommand,
  AdminConfigResetSubCommand,
  AdminResetCooldownSubCommand,
  AdminResetServerTimelySubCommand,
  AdminNotifyDefaultsViewSubCommand,
  AdminNotifyDefaultsSetSubCommand,
  AdminNotifyDefaultsResetSubCommand,
  AdminNotifyHealthSubCommand
])
export default class AdminCommand extends Command {}
