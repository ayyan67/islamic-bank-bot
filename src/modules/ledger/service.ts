import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { TxKind } from '../../infra/db/types.js';
import { LedgerRepository, type InsertTransactionInput, type LedgerTransaction } from './repository.js';

export interface CreateTransactionInput {
  userId: number;
  amount: number;
  kind: TxKind;
  subtype?: string | null;
  note?: string | null;
  otherUserId?: number | null;
  legacyType?: string | null;
  legacyExtra?: string | null;
  createdAt?: string;
}

export class LedgerService {
  constructor(
    private readonly ledgerRepo: LedgerRepository,
    private readonly identityRepo: IdentityRepository
  ) {}

  createTransaction(input: CreateTransactionInput): number {
    const payload: InsertTransactionInput = {
      userId: input.userId,
      amount: input.amount,
      kind: input.kind,
      subtype: input.subtype ?? null,
      note: input.note ?? null,
      otherUserId: input.otherUserId ?? null,
      legacyType: input.legacyType ?? null,
      legacyExtra: input.legacyExtra ?? null,
      createdAt: input.createdAt
    };

    return this.ledgerRepo.insertTransaction(payload);
  }

  getRecentTransactionsByDiscordId(discordUserId: string, page: number, pageSize = 10): LedgerTransaction[] {
    const user = this.identityRepo.getUserByDiscordId(discordUserId);
    if (!user) {
      return [];
    }

    return this.ledgerRepo.getRecentTransactionsByUserId(user.id, page, pageSize);
  }

  getTransactionByDiscordIdAndTxId(discordUserId: string, transactionId: number): LedgerTransaction | undefined {
    const user = this.identityRepo.getUserByDiscordId(discordUserId);
    if (!user) {
      return undefined;
    }

    return this.ledgerRepo.getTransactionForUser(user.id, transactionId);
  }

  getLatestByKind(userId: number, kind: TxKind): LedgerTransaction | undefined {
    return this.ledgerRepo.getLatestTransactionByKind(userId, kind);
  }

  getLatestByKindAndSubtype(userId: number, kind: TxKind, subtype: string): LedgerTransaction | undefined {
    return this.ledgerRepo.getLatestTransactionByKindAndSubtype(userId, kind, subtype);
  }

  deleteLatestByKind(userId: number, kind: TxKind): boolean {
    return this.ledgerRepo.deleteLatestTransactionByKind(userId, kind);
  }

  deleteLatestByKindAndSubtype(userId: number, kind: TxKind, subtype: string): boolean {
    return this.ledgerRepo.deleteLatestTransactionByKindAndSubtype(userId, kind, subtype);
  }

  deleteAllByKind(userId: number, kind: TxKind): number {
    return this.ledgerRepo.deleteAllTransactionsByKind(userId, kind);
  }

  deleteLatestByKindForAllUsers(kind: TxKind): number {
    return this.ledgerRepo.deleteLatestTransactionByKindForAllUsers(kind);
  }
}
