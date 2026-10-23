import { Database } from '../../infra/db/database.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { LedgerService } from '../ledger/service.js';
import { CommunityRepository } from './repository.js';
import { TagRewardClaimResult } from './types.js';

export class CommunityService {
  constructor(
    private readonly db: Database,
    private readonly communityRepo: CommunityRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly ledgerService: LedgerService
  ) {}

  claimTagReward(
    profile: UserProfileInput,
    guildId: string | undefined,
    allowedGuildId: string,
    rewardAmount: number,
    cooldownHours: number,
    hasTagActive: boolean
  ): TagRewardClaimResult {
    if (!guildId) {
      return { ok: false, reason: 'Tag reward can only be claimed from a server channel.' };
    }

    if (guildId !== allowedGuildId) {
      return { ok: false, reason: 'Tag reward is not enabled in this server.' };
    }

    if (!hasTagActive) {
      return { ok: false, reason: 'You must have the server tag active to claim this reward.' };
    }

    const user = this.identityRepo.ensureUser(profile);
    const latest = this.communityRepo.getLatestTagRewardClaim(user.id, guildId);
    const now = new Date();
    const nowIso = now.toISOString();

    // --- No existing claim: initiate a new pending claim ---
    if (!latest) {
      this.communityRepo.insertTagRewardClaim(user.id, guildId, nowIso, rewardAmount, 'pending');
      return { ok: true, phase: 'initiated' };
    }

    // --- Pending claim: check if 24hrs have passed ---
    if (latest.status === 'pending') {
      const initiatedAt = new Date(latest.claimed_at);
      const elapsedMs = now.getTime() - initiatedAt.getTime();
      const requiredMs = cooldownHours * 60 * 60 * 1000;

      if (elapsedMs < requiredMs) {
        return { ok: false, reason: 'Your tag reward is still being processed. Check back later!' };
      }

      // 24+ hours have passed and tag is still on → collect
      this.db.transaction(() => {
        this.communityRepo.updateClaimStatus(latest.id, 'claimed', nowIso);
        this.communityRepo.creditWallet(user.id, rewardAmount);
        this.ledgerService.createTransaction({
          userId: user.id,
          amount: rewardAmount,
          kind: 'claim_tag_reward',
          subtype: 'tag_reward',
          createdAt: nowIso
        });
      });

      return { ok: true, phase: 'collected', amount: rewardAmount };
    }

    // --- Already claimed: one-time reward ---
    return { ok: false, reason: 'You have already claimed the tag reward. This is a one-time reward.' };
  }
}
