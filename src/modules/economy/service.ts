import { env } from '../../config/env.js';
import { Database } from '../../infra/db/database.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { LedgerService } from '../ledger/service.js';
import { LeaderboardEntry } from '../ledger/types.js';
import { NotificationsService } from '../notifications/service.js';
import { NotificationContext } from '../notifications/types.js';
import { EconomyRepository } from './repository.js';

export interface AdminEconomyMutationResult {
  ok: boolean;
  reason?: string;
  before: number;
  after: number;
  delta: number;
}

export class EconomyService {
  constructor(
    private readonly db: Database,
    private readonly economyRepo: EconomyRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly ledgerService: LedgerService,
    private readonly notificationsService: NotificationsService
  ) {}

  getBalance(profile: UserProfileInput): number {
    const user = this.identityRepo.ensureUser(profile);
    return this.economyRepo.getWalletBalance(user.id);
  }

  transfer(
    from: UserProfileInput,
    to: UserProfileInput,
    amount: number,
    context?: NotificationContext
  ): { ok: boolean; reason?: string } {
    if (amount <= 0) {
      return { ok: false, reason: 'Transfer amount must be greater than zero.' };
    }

    const fromUser = this.identityRepo.ensureUser(from);
    const toUser = this.identityRepo.ensureUser(to);

    if (fromUser.id === toUser.id) {
      return { ok: false, reason: 'You cannot transfer currency to yourself.' };
    }

    const nowIso = new Date().toISOString();
    const dedupeKey = `economy:transfer:${fromUser.id}:${toUser.id}:${amount}:${nowIso}`;

    const success = this.db.transaction(() => {
      const moved = this.economyRepo.transferBalance(fromUser.id, toUser.id, amount);
      if (!moved) {
        return false;
      }

      this.ledgerService.createTransaction({
        userId: fromUser.id,
        amount: -amount,
        kind: 'transfer',
        subtype: 'sent',
        otherUserId: toUser.id,
        createdAt: nowIso
      });

      this.ledgerService.createTransaction({
        userId: toUser.id,
        amount,
        kind: 'transfer',
        subtype: 'received',
        otherUserId: fromUser.id,
        createdAt: nowIso
      });

      this.notificationsService.enqueue({
        guildId: context?.guildId ?? null,
        sourceChannelId: context?.sourceChannelId ?? null,
        recipientUserId: toUser.discordUserId,
        actorUserId: fromUser.discordUserId,
        eventType: 'transfer_received',
        payload: {
          amount,
          senderDiscordUserId: fromUser.discordUserId,
          senderUsername: fromUser.username
        },
        dedupeKey
      });

      return true;
    });

    if (!success) {
      return { ok: false, reason: 'Insufficient wallet balance.' };
    }

    return { ok: true };
  }

  creditUser(profile: UserProfileInput, amount: number, kind: 'claim_timely' | 'claim_prayer' | 'claim_tag_reward', subtype?: string): void {
    if (amount <= 0) {
      return;
    }

    const user = this.identityRepo.ensureUser(profile);
    this.db.transaction(() => {
      this.economyRepo.addWalletBalance(user.id, amount);
      this.ledgerService.createTransaction({
        userId: user.id,
        amount,
        kind,
        subtype: subtype ?? null
      });
    });
  }

  adminAward(
    actor: UserProfileInput,
    target: UserProfileInput,
    amount: number,
    note?: string,
    context?: NotificationContext
  ): AdminEconomyMutationResult {
    if (amount <= 0) {
      return { ok: false, reason: 'Amount must be greater than zero.', before: 0, after: 0, delta: 0 };
    }

    const actorUser = this.identityRepo.ensureUser(actor);
    const targetUser = this.identityRepo.ensureUser(target);
    const nowIso = new Date().toISOString();
    const trimmedNote = note?.trim() || null;
    const dedupeKey = `economy:admin_award:${actorUser.id}:${targetUser.id}:${amount}:${nowIso}`;
    const before = this.db.transaction(() => {
      const current = this.economyRepo.getWalletBalance(targetUser.id);
      this.economyRepo.addWalletBalance(targetUser.id, amount);
      this.ledgerService.createTransaction({
        userId: targetUser.id,
        amount,
        kind: 'admin_award',
        subtype: 'wallet_award',
        note: trimmedNote,
        otherUserId: actorUser.id,
        createdAt: nowIso
      });
      this.notificationsService.enqueue({
        guildId: context?.guildId ?? null,
        sourceChannelId: context?.sourceChannelId ?? null,
        recipientUserId: targetUser.discordUserId,
        actorUserId: actorUser.discordUserId,
        eventType: 'admin_award_received',
        payload: {
          amount,
          before: current,
          after: current + amount,
          actorDiscordUserId: actorUser.discordUserId,
          actorUsername: actorUser.username,
          note: trimmedNote
        },
        dedupeKey
      });
      return current;
    });

    return { ok: true, before, after: before + amount, delta: amount };
  }

  adminTake(
    actor: UserProfileInput,
    target: UserProfileInput,
    amount: number,
    note?: string,
    context?: NotificationContext
  ): AdminEconomyMutationResult {
    if (amount <= 0) {
      return { ok: false, reason: 'Amount must be greater than zero.', before: 0, after: 0, delta: 0 };
    }

    const actorUser = this.identityRepo.ensureUser(actor);
    const targetUser = this.identityRepo.ensureUser(target);
    const nowIso = new Date().toISOString();
    const trimmedNote = note?.trim() || null;
    const dedupeKey = `economy:admin_take:${actorUser.id}:${targetUser.id}:${amount}:${nowIso}`;
    const result = this.db.transaction(() => {
      const before = this.economyRepo.getWalletBalance(targetUser.id);
      const success = this.economyRepo.subtractWalletBalance(targetUser.id, amount);
      if (!success) {
        return { ok: false as const, before };
      }

      this.ledgerService.createTransaction({
        userId: targetUser.id,
        amount: -amount,
        kind: 'admin_take',
        subtype: 'wallet_take',
        note: trimmedNote,
        otherUserId: actorUser.id,
        createdAt: nowIso
      });

      this.notificationsService.enqueue({
        guildId: context?.guildId ?? null,
        sourceChannelId: context?.sourceChannelId ?? null,
        recipientUserId: targetUser.discordUserId,
        actorUserId: actorUser.discordUserId,
        eventType: 'admin_take_received',
        payload: {
          amount,
          before,
          after: before - amount,
          actorDiscordUserId: actorUser.discordUserId,
          actorUsername: actorUser.username,
          note: trimmedNote
        },
        dedupeKey
      });

      return { ok: true as const, before };
    });

    if (!result.ok) {
      const { before } = result;
      return {
        ok: false,
        reason: 'Insufficient wallet balance.',
        before,
        after: before,
        delta: 0
      };
    }

    const before = result.before;
    return { ok: true, before, after: before - amount, delta: -amount };
  }

  adminSetBalance(
    actor: UserProfileInput,
    target: UserProfileInput,
    amount: number,
    note?: string,
    context?: NotificationContext
  ): AdminEconomyMutationResult {
    if (amount < 0) {
      return { ok: false, reason: 'Balance cannot be negative.', before: 0, after: 0, delta: 0 };
    }

    const actorUser = this.identityRepo.ensureUser(actor);
    const targetUser = this.identityRepo.ensureUser(target);
    const nowIso = new Date().toISOString();
    const trimmedNote = note?.trim() || null;
    const dedupeKey = `economy:admin_set_balance:${actorUser.id}:${targetUser.id}:${amount}:${nowIso}`;
    const result = this.db.transaction(() => {
      const before = this.economyRepo.getWalletBalance(targetUser.id);
      const delta = amount - before;

      this.economyRepo.setWalletBalance(targetUser.id, amount);

      if (delta !== 0) {
        this.ledgerService.createTransaction({
          userId: targetUser.id,
          amount: delta,
          kind: delta > 0 ? 'admin_award' : 'admin_take',
          subtype: 'wallet_set',
          note: trimmedNote,
          otherUserId: actorUser.id,
          createdAt: nowIso
        });

        this.notificationsService.enqueue({
          guildId: context?.guildId ?? null,
          sourceChannelId: context?.sourceChannelId ?? null,
          recipientUserId: targetUser.discordUserId,
          actorUserId: actorUser.discordUserId,
          eventType: 'admin_set_balance_changed',
          payload: {
            delta,
            before,
            after: amount,
            actorDiscordUserId: actorUser.discordUserId,
            actorUsername: actorUser.username,
            note: trimmedNote
          },
          dedupeKey
        });
      }

      return { before, delta };
    });

    return { ok: true, before: result.before, after: amount, delta: result.delta };
  }

  getLeaderboard(page: number, pageSize = 10, guildId?: string): LeaderboardEntry[] {
    // The bot's own account never belongs on the wealth leaderboard.
    return this.economyRepo.getLeaderboard(page, pageSize, guildId, env.APPLICATION_ID).map((row) => ({
      discordUserId: row.discord_user_id,
      username: row.username ?? 'Unknown',
      avatarId: row.avatar_id ?? null,
      balance: row.balance
    }));
  }
}
