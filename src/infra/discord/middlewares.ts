import { createMiddleware } from 'seyfert';
import { env } from '../../config/env.js';
import { AppContainer } from '../../app/container.js';
import { formatCooldown } from './formatting.js';
import { parseCommandPath } from '../../modules/policy/normalization.js';

const commandCooldowns = new Map<string, number>();

const INTERACTION_TTL_MS = 15 * 60 * 1000;

function commandNameForMetrics(context: any): string {
  if (typeof context.fullCommandName === 'string' && context.fullCommandName.trim().length > 0) {
    return context.fullCommandName.trim();
  }

  if (typeof context.command?.name === 'string' && context.command.name.trim().length > 0) {
    return context.command.name.trim();
  }

  return 'unknown';
}

function getStartedAt(context: any): number {
  const startedAt = (context as { __commandStartedAt?: unknown }).__commandStartedAt;
  return typeof startedAt === 'number' ? startedAt : Date.now();
}

function recordBlockedCommand(app: AppContainer, context: any): void {
  app.metrics.recordCommandEvent(
    commandNameForMetrics(context),
    'blocked',
    Math.max(0, Date.now() - getStartedAt(context))
  );
}

function getMemberRoleIds(context: any): string[] {
  const memberRoles = context.member?.roles;
  if (!memberRoles) {
    return [];
  }

  if (Array.isArray(memberRoles)) {
    return memberRoles.filter((roleId): roleId is string => typeof roleId === 'string');
  }

  if (Array.isArray(memberRoles.keys)) {
    return memberRoles.keys.filter((roleId: unknown): roleId is string => typeof roleId === 'string');
  }

  return [];
}


function getCommandPath(context: any): { command: string; subcommand: string | null } {
  if (typeof context.fullCommandName === 'string') {
    return parseCommandPath(context.fullCommandName);
  }

  if (typeof context.command?.name === 'string') {
    return { command: context.command.name, subcommand: null };
  }

  return { command: '', subcommand: null };
}

function requiresElevatedCommandPermission(command: string, subcommand: string | null): boolean {
  if (command === 'admin' || command === 'policy') {
    return true;
  }

  if (command === 'shop' && subcommand) {
    return subcommand.startsWith('admin');
  }

  if (command === 'bounty' && subcommand) {
    return subcommand.startsWith('admin');
  }

  return false;
}

function pruneCooldowns(): void {
  const now = Date.now();

  for (const [key, expiresAt] of commandCooldowns.entries()) {
    if (expiresAt <= now) {
      commandCooldowns.delete(key);
    }
  }
}

export function buildMiddlewares(app: AppContainer) {
  return {
    authz: createMiddleware<any, any>(({ context, next, stop }) => {
      if (!context.author?.id) {
        stop('Missing interaction author');
        return;
      }

      (context as { __commandStartedAt?: number }).__commandStartedAt = Date.now();
      next(undefined);
    }),

    idempotency: createMiddleware<any, any>(async ({ context, next, pass }) => {
      const interactionId = context.interaction?.id;
      if (!interactionId) {
        next({ interactionId: 'message-command' });
        return;
      }

      const claimed = app.interactionDedupRepo.tryClaim(interactionId, INTERACTION_TTL_MS);
      if (!claimed) {
        await context.editOrReply({
          content: 'This interaction was already handled. Please run the command again if needed.'
        });
        recordBlockedCommand(app, context);
        pass();
        return;
      }

      next({ interactionId });
    }),

    interactionSla: createMiddleware<any, any>(async ({ context, next, stop }) => {
      if (!context.interaction || context.deferred) {
        next(undefined);
        return;
      }

      try {
        await context.deferReply(false);
      } catch {
        stop('Unable to acknowledge interaction in time');
        return;
      }

      next(undefined);
    }),

    backpressure: createMiddleware<any, any>(async ({ context, next, pass }) => {
      if (!app.metrics.shouldApplyBackpressure()) {
        next(undefined);
        return;
      }

      await context.editOrReply({
        content: 'The bot is handling heavy traffic. Please wait a moment and try again.'
      });
      recordBlockedCommand(app, context);
      pass();
    }),

    cooldown: createMiddleware<any, any>(async ({ context, next, pass }) => {
      pruneCooldowns();

      const key = `${context.author.id}:${context.fullCommandName}`;
      const now = Date.now();
      const blockedUntil = commandCooldowns.get(key) ?? 0;
      if (blockedUntil > now) {
        await context.editOrReply({
          content: `Command cooldown active. Try again in ${formatCooldown((blockedUntil - now) / 1000)}.`
        });
        recordBlockedCommand(app, context);
        pass();
        return;
      }

      const newBlockedUntil = now + env.COMMAND_COOLDOWN_MS;
      commandCooldowns.set(key, newBlockedUntil);
      next({ blockedUntil: newBlockedUntil });
    }),

    permissionPolicy: createMiddleware<any, any>(async ({ context, next, pass, stop }) => {
      const { command, subcommand } = getCommandPath(context);
      if (!requiresElevatedCommandPermission(command, subcommand)) {
        next(undefined);
        return;
      }

      const userId = context.author?.id;
      if (!userId) {
        stop('Missing command author');
        return;
      }

      if (app.accessService.isOwner(userId)) {
        next(undefined);
        return;
      }

      const roleIds = getMemberRoleIds(context);
      const isAdmin = app.accessService.isAdmin(userId, context.guildId, roleIds);

      if (isAdmin) {
        next(undefined);
        return;
      }

      await context.editOrReply({
        content: 'You do not have permission to use admin or policy commands.'
      });
      recordBlockedCommand(app, context);
      pass();
    }),

    commandPolicy: createMiddleware<any, any>(async ({ context, next, pass, stop }) => {
      if (!context.guildId) {
        next(undefined);
        return;
      }

      const userId = context.author?.id;
      if (!userId) {
        stop('Missing command author');
        return;
      }

      if (app.accessService.isOwner(userId)) {
        next(undefined);
        return;
      }

      const { command, subcommand } = getCommandPath(context);
      if (!command) {
        next(undefined);
        return;
      }

      const roleIds = getMemberRoleIds(context);
      const result = app.policyService.evaluate({
        guildId: context.guildId,
        command,
        subcommand,
        channelId: context.channelId,
        userId,
        roleIds
      });

      if (result.allowed) {
        next(undefined);
        return;
      }

      const content =
        result.reason === 'deny_match'
          ? 'This command is blocked by a server deny policy in this context.'
          : 'This command is allowlisted and you are not in the allowed targets.';

      await context.editOrReply({ content });
      recordBlockedCommand(app, context);
      pass();
    }),

    audit: createMiddleware<any, any>(async ({ context, next }) => {
      app.logger.info(
        {
          command: context.fullCommandName,
          userId: context.author.id,
          guildId: context.guildId ?? null,
          channelId: context.channelId,
          interactionId: context.interaction?.id ?? null
        },
        'Command received'
      );

      if (context.guildId && context.author?.id) {
        try {
          app.identityRepo.trackGuildPresence(context.author.id, context.guildId);
        } catch {
          // non-critical — don't block command execution
        }
      }

      await Promise.resolve(next(undefined) as unknown);
      app.metrics.recordCommandEvent(
        commandNameForMetrics(context),
        'success',
        Math.max(0, Date.now() - getStartedAt(context))
      );
    })
  };
}
