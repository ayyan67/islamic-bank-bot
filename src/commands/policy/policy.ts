import {
  Command,
  Declare,
  Middlewares,
  Options,
  SubCommand,
  createStringOption
} from 'seyfert';
import {
  ADMIN_DEFAULT_MEMBER_PERMISSIONS,
  CONTEXTS_GUILD,
  INTEGRATION_TYPES_GLOBAL
} from '../../infra/discord/commandPolicy.js';
import type { CommandPolicyAction, CommandPolicyScope } from '../../modules/policy/types.js';
import { reply, replyFields } from '../shared.js';

const POLICY_SCOPE_CHOICES = [
  { name: 'Guild', value: 'guild' },
  { name: 'Channel', value: 'channel' },
  { name: 'Role', value: 'role' },
  { name: 'User', value: 'user' }
] as const;

function splitCommandAndSubcommand(
  commandInput: string,
  subcommandInput: string | null | undefined
): { command: string; subcommand: string | null } {
  const normalizedCommand = commandInput.trim();
  const normalizedSubcommand = subcommandInput?.trim();

  if (normalizedSubcommand && normalizedSubcommand.length > 0) {
    return { command: normalizedCommand, subcommand: normalizedSubcommand };
  }

  const parts = normalizedCommand.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length <= 1) {
    return { command: normalizedCommand, subcommand: null };
  }

  return {
    command: parts[0] ?? '',
    subcommand: parts.slice(1).join(' ')
  };
}

function parsePolicyScope(input: unknown): CommandPolicyScope | null {
  if (typeof input !== 'string') {
    return null;
  }

  const value = input.trim().toLowerCase();
  if (value === 'guild' || value === 'channel' || value === 'role' || value === 'user') {
    return value;
  }

  return null;
}

function parseTargetId(scope: CommandPolicyScope, rawTarget: unknown): string | null {
  if (scope === 'guild') {
    return null;
  }

  if (typeof rawTarget !== 'string') {
    return null;
  }

  const input = rawTarget.trim();
  if (input.length === 0) {
    return null;
  }

  const mentionPatterns = [
    /^<@!?(\d+)>$/,
    /^<@&(\d+)>$/,
    /^<#(\d+)>$/
  ];

  for (const pattern of mentionPatterns) {
    const match = input.match(pattern);
    const matchId = match?.[1];
    if (matchId) {
      return matchId;
    }
  }

  return input;
}

function formatPolicyEntry(entry: any): string {
  const subcommand = entry.subcommand ? ` ${entry.subcommand}` : '';

  let targetText = 'all members';
  if (entry.scope === 'guild') {
    targetText = 'guild-wide';
  } else if (entry.scope === 'channel') {
    targetText = entry.targetId ? `<#${entry.targetId}>` : 'unknown-channel';
  } else if (entry.scope === 'role') {
    targetText = entry.targetId ? `<@&${entry.targetId}>` : 'unknown-role';
  } else if (entry.scope === 'user') {
    targetText = entry.targetId ? `<@${entry.targetId}>` : 'unknown-user';
  }

  return `${entry.action.toUpperCase()} /${entry.command}${subcommand} -> ${entry.scope}:${targetText}`;
}

async function upsertPolicy(ctx: any, action: CommandPolicyAction): Promise<void> {
  if (!ctx.guildId) {
    await reply(ctx, 'This command can only be used in a server.');
    return;
  }

  const scope = parsePolicyScope(ctx.options.scope);
  if (!scope) {
    await reply(ctx, 'Invalid scope. Use one of: guild, channel, role, user.');
    return;
  }

  const commandInput = String(ctx.options.command ?? '');
  const subcommandInput = typeof ctx.options.subcommand === 'string' ? ctx.options.subcommand : null;
  const { command, subcommand } = splitCommandAndSubcommand(commandInput, subcommandInput);
  const targetId = parseTargetId(scope, ctx.options.target);
  if (scope !== 'guild' && !targetId) {
    await reply(ctx, `Target is required for scope ${scope}.`);
    return;
  }

  const result = ctx.app.policyService.addPolicy({
    guildId: ctx.guildId,
    command,
    subcommand,
    action,
    scope,
    targetId,
    createdBy: ctx.author.id
  });

  if (!result.ok) {
    await reply(ctx, result.reason ?? `Unable to ${action} this policy.`);
    return;
  }

  const suffix = subcommand ? ` ${subcommand}` : '';
  const targetDisplay = scope === 'guild' ? 'guild-wide' : targetId ?? 'missing-target';
  await reply(
    ctx,
    `${action === 'allow' ? 'Allowlisted' : 'Denied'} \`/${command}${suffix}\` for ${scope}:${targetDisplay}.`
  );
}

@Declare({
  name: 'allow',
  description: 'Allowlist a command target in this guild',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Middlewares(['permissionPolicy'])
@Options({
  command: createStringOption({
    description: 'Base command name (example: transfer)',
    required: true
  }),
  scope: createStringOption({
    description: 'Policy scope',
    required: true,
    choices: [...POLICY_SCOPE_CHOICES]
  }),
  subcommand: createStringOption({
    description: 'Optional subcommand path (example: vault deposit)',
    required: false
  }),
  target: createStringOption({
    description: 'Target ID or mention (ignored for guild scope)',
    required: false
  })
})
class PolicyAllowSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    await upsertPolicy(ctx, 'allow');
  }
}

@Declare({
  name: 'deny',
  description: 'Deny a command target in this guild',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Middlewares(['permissionPolicy'])
@Options({
  command: createStringOption({
    description: 'Base command name (example: transfer)',
    required: true
  }),
  scope: createStringOption({
    description: 'Policy scope',
    required: true,
    choices: [...POLICY_SCOPE_CHOICES]
  }),
  subcommand: createStringOption({
    description: 'Optional subcommand path (example: vault deposit)',
    required: false
  }),
  target: createStringOption({
    description: 'Target ID or mention (ignored for guild scope)',
    required: false
  })
})
class PolicyDenySubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    await upsertPolicy(ctx, 'deny');
  }
}

@Declare({
  name: 'clear',
  description: 'Clear allow/deny policy entries for a target',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Middlewares(['permissionPolicy'])
@Options({
  command: createStringOption({
    description: 'Base command name (example: transfer)',
    required: true
  }),
  scope: createStringOption({
    description: 'Policy scope',
    required: true,
    choices: [...POLICY_SCOPE_CHOICES]
  }),
  subcommand: createStringOption({
    description: 'Optional subcommand path',
    required: false
  }),
  target: createStringOption({
    description: 'Target ID or mention (ignored for guild scope)',
    required: false
  })
})
class PolicyClearSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const scope = parsePolicyScope(ctx.options.scope);
    if (!scope) {
      await reply(ctx, 'Invalid scope. Use one of: guild, channel, role, user.');
      return;
    }

    const commandInput = String(ctx.options.command ?? '');
    const subcommandInput = typeof ctx.options.subcommand === 'string' ? ctx.options.subcommand : null;
    const { command, subcommand } = splitCommandAndSubcommand(commandInput, subcommandInput);
    const targetId = parseTargetId(scope, ctx.options.target);
    if (scope !== 'guild' && !targetId) {
      await reply(ctx, `Target is required for scope ${scope}.`);
      return;
    }

    const allowRemoved = ctx.app.policyService.removePolicy({
      guildId: ctx.guildId,
      command,
      subcommand,
      action: 'allow',
      scope,
      targetId
    });
    const denyRemoved = ctx.app.policyService.removePolicy({
      guildId: ctx.guildId,
      command,
      subcommand,
      action: 'deny',
      scope,
      targetId
    });

    const removedCount = Number(allowRemoved.ok) + Number(denyRemoved.ok);
    if (removedCount === 0) {
      await reply(ctx, 'No matching policy entries were found.');
      return;
    }

    const suffix = subcommand ? ` ${subcommand}` : '';
    await reply(ctx, `Cleared ${removedCount} policy entr${removedCount === 1 ? 'y' : 'ies'} for \`/${command}${suffix}\`.`);
  }
}

@Declare({
  name: 'list',
  description: 'List policies in this guild',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Middlewares(['permissionPolicy'])
@Options({
  command: createStringOption({
    description: 'Optional command filter',
    required: false
  }),
  subcommand: createStringOption({
    description: 'Optional subcommand filter',
    required: false
  })
})
class PolicyListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    if (!ctx.guildId) {
      await reply(ctx, 'This command can only be used in a server.');
      return;
    }

    const commandInput = typeof ctx.options.command === 'string' ? ctx.options.command.trim() : '';
    const optionSubcommand =
      typeof ctx.options.subcommand === 'string' && ctx.options.subcommand.trim().length > 0
        ? ctx.options.subcommand.trim()
        : undefined;

    const parsed = commandInput
      ? splitCommandAndSubcommand(commandInput, optionSubcommand)
      : { command: '', subcommand: undefined as string | undefined };

    const subcommandFilter =
      optionSubcommand ||
      (commandInput.split(/\s+/).filter((part: string) => part.length > 0).length > 1
        ? parsed.subcommand
        : undefined);

    const policies = ctx.app.policyService.listPolicies(
      ctx.guildId,
      parsed.command || undefined,
      subcommandFilter
    );

    if (policies.length === 0) {
      await reply(ctx, 'No policies configured for this filter.');
      return;
    }

    const visible = policies.slice(0, 25);
    const fields = visible.map((entry: any) => ({
      name: `#${entry.id}`,
      value: formatPolicyEntry(entry),
      inline: false
    }));

    const remaining = policies.length - visible.length;
    await replyFields(ctx, {
      title: 'Command Policies',
      fields,
      footer: remaining > 0 ? `${remaining} additional entries not shown` : undefined,
      compact: true
    });
  }
}

@Declare({
  name: 'policy',
  description: 'Allowlist and denylist policy controls',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_GUILD],
  defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS
})
@Middlewares(['permissionPolicy'])
@Options([PolicyAllowSubCommand, PolicyDenySubCommand, PolicyClearSubCommand, PolicyListSubCommand])
export default class PolicyCommand extends Command {}
