import { Database } from '../../infra/db/database.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { LedgerService } from '../ledger/service.js';
import { VaultRepository } from './repository.js';

export interface AdminVaultMutationResult {
  ok: boolean;
  reason?: string;
  before: number;
  after: number;
  delta: number;
}

export class VaultService {
  constructor(
    private readonly db: Database,
    private readonly vaultRepo: VaultRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly ledgerService: LedgerService
  ) {}

  getBalance(profile: UserProfileInput): number {
    const user = this.identityRepo.ensureUser(profile);
    return this.vaultRepo.getVaultBalance(user.id);
  }

  deposit(profile: UserProfileInput, amount: number): { ok: boolean; reason?: string } {
    const user = this.identityRepo.ensureUser(profile);
    const result = this.db.transaction(() => {
      const tx = this.vaultRepo.deposit(user.id, amount);
      if (!tx.ok) {
        return tx;
      }

      this.ledgerService.createTransaction({
        userId: user.id,
        amount: -amount,
        kind: 'vault_deposit',
        subtype: 'deposit'
      });

      return tx;
    });

    return result;
  }

  withdraw(profile: UserProfileInput, amount: number): { ok: boolean; reason?: string } {
    const user = this.identityRepo.ensureUser(profile);
    const result = this.db.transaction(() => {
      const tx = this.vaultRepo.withdraw(user.id, amount);
      if (!tx.ok) {
        return tx;
      }

      this.ledgerService.createTransaction({
        userId: user.id,
        amount,
        kind: 'vault_withdraw',
        subtype: 'withdraw'
      });

      return tx;
    });

    return result;
  }

  adminSetBalance(
    actor: UserProfileInput,
    target: UserProfileInput,
    amount: number,
    note?: string
  ): AdminVaultMutationResult {
    if (amount < 0) {
      return { ok: false, reason: 'Vault balance cannot be negative.', before: 0, after: 0, delta: 0 };
    }

    const actorUser = this.identityRepo.ensureUser(actor);
    const targetUser = this.identityRepo.ensureUser(target);
    const result = this.db.transaction(() => {
      const before = this.vaultRepo.getVaultBalance(targetUser.id);
      const delta = amount - before;

      this.vaultRepo.setVaultBalance(targetUser.id, amount);

      if (delta !== 0) {
        this.ledgerService.createTransaction({
          userId: targetUser.id,
          amount: delta,
          kind: delta > 0 ? 'admin_award' : 'admin_take',
          subtype: 'vault_set',
          note: note?.trim() || null,
          otherUserId: actorUser.id
        });
      }

      return { before, delta };
    });

    return { ok: true, before: result.before, after: amount, delta: result.delta };
  }
}
