import type { ReactionRolesRepository } from './repository.js';
import type { BindInput, ReactionDecision, ReactionEventInput, ReactionRoleBinding } from './types.js';

export const MAX_BINDINGS_PER_MESSAGE = 20; // Discord caps distinct reactions per message

export class ReactionRolesService {
  constructor(private readonly repo: ReactionRolesRepository) {}

  bind(input: BindInput): { ok: true; binding: ReactionRoleBinding; replaced: boolean } | { ok: false; reason: string } {
    const existing = this.repo.find(input.messageId, input.emojiKey);
    if (!existing) {
      const count = this.repo.listForMessage(input.guildId, input.messageId).length;
      if (count >= MAX_BINDINGS_PER_MESSAGE) {
        return { ok: false, reason: `A message can hold at most ${MAX_BINDINGS_PER_MESSAGE} reaction roles.` };
      }
    }
    const binding = this.repo.upsert(input);
    return { ok: true, binding, replaced: Boolean(existing && existing.roleId !== input.roleId) };
  }

  unbind(guildId: string, messageId: string, emojiKey: string): boolean {
    return this.repo.remove(guildId, messageId, emojiKey);
  }

  unbindMessage(guildId: string, messageId: string): number {
    return this.repo.removeMessage(guildId, messageId);
  }

  listForMessage(guildId: string, messageId: string): ReactionRoleBinding[] {
    return this.repo.listForMessage(guildId, messageId);
  }

  listForGuild(guildId: string): ReactionRoleBinding[] {
    return this.repo.listForGuild(guildId);
  }

  /** Decide what a reaction add/remove event should do. Pure apart from the lookup. */
  resolve(event: ReactionEventInput): ReactionDecision {
    if (!event.guildId) return { action: 'ignore', reason: 'no_guild' };
    if (event.isBot || (event.botId && event.userId === event.botId)) return { action: 'ignore', reason: 'bot' };
    const binding = this.repo.find(event.messageId, event.emojiKey);
    if (!binding || binding.guildId !== event.guildId) return { action: 'ignore', reason: 'unbound' };
    return { action: 'apply', binding };
  }
}
