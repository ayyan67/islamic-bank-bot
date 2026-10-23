import { Database } from '../../infra/db/database.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { EconomyRepository } from '../economy/repository.js';
import { LedgerService } from '../ledger/service.js';
import { NotificationsService } from '../notifications/service.js';
import { BountyRepository, type BountyRow } from './repository.js';

const MAX_POSTS_PER_DAY = 5;
const MAX_TITLE_LENGTH = 200;

type Fail = { ok: false; reason: string };

export class BountyService {
  constructor(
    private readonly db: Database,
    private readonly bountyRepo: BountyRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly ledgerService: LedgerService,
    private readonly notificationsService: NotificationsService
  ) {}

  post(
    profile: UserProfileInput,
    guildId: string,
    channelId: string,
    title: string,
    amount: number
  ): { ok: true; id: number } | Fail {
    const trimmed = title.trim();
    if (trimmed.length < 3) return { ok: false, reason: 'Bounty description must be at least 3 characters.' };
    if (trimmed.length > MAX_TITLE_LENGTH) {
      return { ok: false, reason: `Bounty description must be at most ${MAX_TITLE_LENGTH} characters.` };
    }
    if (!Number.isInteger(amount) || amount < 1) return { ok: false, reason: 'Bounty amount must be a positive number.' };

    const owner = this.identityRepo.ensureUser(profile);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if (this.bountyRepo.countCreatedInWindow(owner.id, since) >= MAX_POSTS_PER_DAY) {
      return { ok: false, reason: `You can post at most ${MAX_POSTS_PER_DAY} bounties per 24 hours.` };
    }

    return this.db.transaction(() => {
      const debited = this.economyRepo.subtractWalletBalance(owner.id, amount);
      if (!debited) return { ok: false as const, reason: 'Insufficient wallet balance to fund this bounty.' };

      const id = this.bountyRepo.create(guildId, channelId, owner.id, trimmed, amount);
      this.ledgerService.createTransaction({
        userId: owner.id,
        amount: -amount,
        kind: 'task_bounty_lock',
        subtype: 'escrow_create',
        note: `bounty #${id}`
      });
      return { ok: true as const, id };
    });
  }

  take(profile: UserProfileInput, guildId: string, id: number): { ok: true; bounty: BountyRow } | Fail {
    const user = this.identityRepo.ensureUser(profile);
    const bounty = this.bountyRepo.getById(guildId, id);
    if (!bounty) return { ok: false, reason: `No bounty #${id} in this server.` };
    if (bounty.status !== 'open') return { ok: false, reason: `Bounty #${id} is not open (status: ${bounty.status}).` };
    if (bounty.owner_user_id === user.id) return { ok: false, reason: 'You cannot take your own bounty.' };

    if (!this.bountyRepo.take(id, user.id)) {
      return { ok: false, reason: `Bounty #${id} was just taken by someone else.` };
    }

    this.notificationsService.enqueue({
      guildId,
      sourceChannelId: bounty.channel_id,
      recipientUserId: bounty.owner_discord_user_id,
      actorUserId: profile.discordUserId,
      eventType: 'bounty_taken',
      payload: {
        bountyId: id,
        title: bounty.title,
        takerDiscordUserId: profile.discordUserId,
        takerUsername: profile.username ?? 'Unknown'
      },
      dedupeKey: `bounty_taken:${id}`
    });

    return { ok: true, bounty: this.bountyRepo.getById(guildId, id)! };
  }

  pay(profile: UserProfileInput, guildId: string, id: number, isAdmin = false): { ok: true; bounty: BountyRow } | Fail {
    const user = this.identityRepo.ensureUser(profile);
    const bounty = this.bountyRepo.getById(guildId, id);
    if (!bounty) return { ok: false, reason: `No bounty #${id} in this server.` };
    if (bounty.status !== 'in_progress') {
      return { ok: false, reason: `Bounty #${id} has no active worker to pay (status: ${bounty.status}).` };
    }
    if (!isAdmin && bounty.owner_user_id !== user.id) {
      return { ok: false, reason: 'Only the bounty poster can release payment.' };
    }

    const result = this.db.transaction(() => {
      if (!this.bountyRepo.pay(id)) return { ok: false as const, reason: 'Bounty state changed — try again.' };
      this.economyRepo.addWalletBalance(bounty.assignee_user_id!, bounty.bounty_amount);
      this.ledgerService.createTransaction({
        userId: bounty.assignee_user_id!,
        amount: bounty.bounty_amount,
        kind: 'task_bounty_payout',
        subtype: isAdmin ? 'admin_approve' : 'owner_approve',
        note: `bounty #${id}`
      });
      return { ok: true as const };
    });
    if (!result.ok) return result;

    this.notificationsService.enqueue({
      guildId,
      sourceChannelId: bounty.channel_id,
      recipientUserId: bounty.assignee_discord_user_id!,
      actorUserId: profile.discordUserId,
      eventType: 'bounty_paid',
      payload: { bountyId: id, title: bounty.title, amount: bounty.bounty_amount },
      dedupeKey: `bounty_paid:${id}`
    });

    return { ok: true, bounty: this.bountyRepo.getById(guildId, id)! };
  }

  cancel(profile: UserProfileInput, guildId: string, id: number, isAdmin = false): { ok: true; bounty: BountyRow } | Fail {
    const user = this.identityRepo.ensureUser(profile);
    const bounty = this.bountyRepo.getById(guildId, id);
    if (!bounty) return { ok: false, reason: `No bounty #${id} in this server.` };
    if (bounty.status !== 'open' && bounty.status !== 'in_progress') {
      return { ok: false, reason: `Bounty #${id} is already ${bounty.status}.` };
    }
    if (!isAdmin && bounty.owner_user_id !== user.id) {
      return { ok: false, reason: 'Only the bounty poster can cancel it.' };
    }

    return this.db.transaction(() => {
      if (!this.bountyRepo.cancel(id)) return { ok: false as const, reason: 'Bounty state changed — try again.' };
      this.economyRepo.addWalletBalance(bounty.owner_user_id, bounty.bounty_amount);
      this.ledgerService.createTransaction({
        userId: bounty.owner_user_id,
        amount: bounty.bounty_amount,
        kind: 'task_bounty_refund',
        subtype: isAdmin ? 'admin_refund' : 'owner_cancel',
        note: `bounty #${id}`
      });
      return { ok: true as const, bounty: this.bountyRepo.getById(guildId, id)! };
    });
  }

  list(guildId: string, page: number, pageSize = 5): BountyRow[] {
    return this.bountyRepo.listActive(guildId, page, pageSize);
  }

  get(guildId: string, id: number): BountyRow | undefined {
    return this.bountyRepo.getById(guildId, id);
  }
}
