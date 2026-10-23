import type { AppContainer } from '../../app/container.js';
import { emojiKeyFromReaction } from '../../modules/reaction-roles/parse.js';
import { logger } from '../logging/logger.js';

interface ReactionPayload {
  guildId?: string | undefined;
  messageId: string;
  channelId: string;
  userId: string;
  emoji: { id?: string | null; name?: string | null };
  member?: { user?: { bot?: boolean | undefined }; roles?: string[] | { keys?: string[] } } | undefined;
}

// Avoid log spam when a binding is broken (bot below role, missing Manage Roles):
// warn at most once per binding per 10 minutes.
const lastWarned = new Map<string, number>();
const WARN_INTERVAL_MS = 10 * 60 * 1000;

export function appFromClient(client: any): AppContainer | undefined {
  const ctxFn = client?.options?.context ?? client?.context;
  const ctx = typeof ctxFn === 'function' ? (ctxFn() as { app?: AppContainer }) : undefined;
  return ctx?.app;
}

export async function handleReaction(kind: 'add' | 'remove', payload: ReactionPayload, client: any): Promise<void> {
  const app = appFromClient(client);
  if (!app) return;

  const emojiKey = emojiKeyFromReaction(payload.emoji);
  if (!emojiKey) return;

  const decision = app.reactionRolesService.resolve({
    guildId: payload.guildId,
    messageId: payload.messageId,
    emojiKey,
    userId: payload.userId,
    isBot: Boolean(payload.member?.user?.bot),
    botId: client.botId ?? client.applicationId
  });
  if (decision.action !== 'apply') return;

  const { binding } = decision;
  const rawRoles = payload.member?.roles;
  const memberRoles: string[] = Array.isArray(rawRoles) ? rawRoles : (rawRoles?.keys ?? []);
  if (kind === 'add' && memberRoles.includes(binding.roleId)) return;

  try {
    if (kind === 'add') {
      await client.members.addRole(binding.guildId, payload.userId, binding.roleId);
    } else {
      await client.members.removeRole(binding.guildId, payload.userId, binding.roleId);
    }
    logger.debug({ kind, guildId: binding.guildId, userId: payload.userId, roleId: binding.roleId }, 'Reaction role applied');
  } catch (error) {
    const key = `${binding.messageId}:${binding.emojiKey}`;
    const now = Date.now();
    if ((lastWarned.get(key) ?? 0) + WARN_INTERVAL_MS < now) {
      lastWarned.set(key, now);
      logger.warn(
        { kind, guildId: binding.guildId, roleId: binding.roleId, emoji: binding.emojiDisplay, error: (error as Error)?.message },
        'Reaction role update failed (check Manage Roles and role hierarchy)'
      );
    }
  }
}
