import { Database } from '../../infra/db/database.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { EconomyRepository } from '../economy/repository.js';
import { LedgerService } from '../ledger/service.js';
import { DropRepository } from './repository.js';
import type { DropResult, DropFailure, PickResult, PickFailure } from './types.js';

export class DropService {
  constructor(
    private readonly db: Database,
    private readonly dropRepo: DropRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly ledgerService: LedgerService
  ) {}

  drop(
    profile: UserProfileInput,
    guildId: string,
    channelId: string,
    amount: number
  ): DropResult | DropFailure {
    if (amount <= 0) {
      return { ok: false, reason: 'Drop amount must be greater than zero.' };
    }

    const user = this.identityRepo.ensureUser(profile);

    return this.db.transaction(() => {
      const success = this.economyRepo.subtractWalletBalance(user.id, amount);
      if (!success) {
        return { ok: false, reason: 'Insufficient wallet balance.' } as const;
      }

      const dropId = this.dropRepo.createDrop(guildId, channelId, user.id, amount);

      this.ledgerService.createTransaction({
        userId: user.id,
        amount: -amount,
        kind: 'drop',
        subtype: 'dropped',
        note: `Drop #${dropId} in channel ${channelId}`
      });

      return { ok: true, dropId, amount } as const;
    });
  }

  pick(
    profile: UserProfileInput,
    channelId: string
  ): PickResult | PickFailure {
    const user = this.identityRepo.ensureUser(profile);

    return this.db.transaction(() => {
      const drop = this.dropRepo.pickDrop(channelId, user.id);
      if (!drop) {
        return { ok: false, reason: 'No active drop in this channel.' } as const;
      }

      this.economyRepo.addWalletBalance(user.id, drop.amount);

      this.ledgerService.createTransaction({
        userId: user.id,
        amount: drop.amount,
        kind: 'drop_pick',
        subtype: 'picked',
        note: `Picked drop #${drop.id}`
      });

      const dropper = this.identityRepo.getUserById(drop.dropper_user_id);

      return {
        ok: true,
        amount: drop.amount,
        dropperDiscordUserId: dropper?.discordUserId ?? 'unknown'
      } as const;
    });
  }

  hasActiveDrop(channelId: string): boolean {
    return this.dropRepo.getActiveDrop(channelId) !== undefined;
  }
}
