import { Database } from '../../infra/db/database.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { LedgerService } from '../ledger/service.js';
import { NotificationsService } from '../notifications/service.js';
import type { NotificationContext } from '../notifications/types.js';
import { WorshipRepository, type PrayerName, type StreakKind } from './repository.js';

export const STREAK_BONUS_PER_DAY = 5;
export const STREAK_BONUS_CAP = 50;

/** +5% per consecutive claim/day beyond the first, capped at +50%. */
export function streakBonusPercent(streakCount: number): number {
  return Math.min(Math.max(streakCount - 1, 0) * STREAK_BONUS_PER_DAY, STREAK_BONUS_CAP);
}

/** A timely streak survives as long as claims land within 2x the cooldown (min 1h). */
export function timelyStreakWindowMs(cooldownHours: number): number {
  return Math.max(cooldownHours * 2, 1) * 3_600_000;
}

export class WorshipService {
  constructor(
    private readonly db: Database,
    private readonly worshipRepo: WorshipRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly ledgerService: LedgerService,
    private readonly notificationsService?: NotificationsService
  ) {}

  getDailyPrayers(): readonly PrayerName[] {
    return this.worshipRepo.getDailyPrayers();
  }

  claimTimely(
    profile: UserProfileInput,
    amount: number,
    cooldownHours: number,
    context?: NotificationContext
  ):
    | { ok: true; streak: number; streakBonus: number; totalAmount: number }
    | { ok: false; reason: string; remainingSeconds?: number } {
    const user = this.identityRepo.ensureUser(profile);
    this.worshipRepo.ensureWalletExists(user.id);

    return this.db.transaction(() => {
      const latest = this.ledgerService.getLatestByKind(user.id, 'claim_timely');
      if (latest) {
        const nextAt = Date.parse(latest.createdAt) + cooldownHours * 60 * 60 * 1000;
        const now = Date.now();
        if (now < nextAt) {
          return {
            ok: false,
            reason: 'Timely is still on cooldown.',
            remainingSeconds: Math.ceil((nextAt - now) / 1000)
          };
        }
      }

      const streak = this.worshipRepo.touchTimelyStreak(user.id, timelyStreakWindowMs(cooldownHours));
      const streakBonus = Math.round((amount * streakBonusPercent(streak.count)) / 100);

      this.worshipRepo.creditWallet(user.id, amount + streakBonus);
      this.ledgerService.createTransaction({
        userId: user.id,
        amount,
        kind: 'claim_timely',
        subtype: 'timely'
      });
      if (streakBonus > 0) {
        this.ledgerService.createTransaction({
          userId: user.id,
          amount: streakBonus,
          kind: 'claim_timely',
          subtype: 'streak_bonus',
          note: `streak:${streak.count}`
        });
      }

      // Opt-in reminder when the cooldown expires (delayed outbox delivery).
      const readyAt = Date.now() + cooldownHours * 60 * 60 * 1000;
      this.notificationsService?.enqueue({
        guildId: context?.guildId ?? null,
        sourceChannelId: context?.sourceChannelId ?? null,
        recipientUserId: profile.discordUserId,
        actorUserId: null,
        eventType: 'timely_ready',
        payload: { lastAmount: amount },
        dedupeKey: `timely_ready:${user.id}:${readyAt}`,
        deliverAt: readyAt
      });

      return { ok: true, streak: streak.count, streakBonus, totalAmount: amount + streakBonus };
    });
  }

  getStreaks(profile: UserProfileInput, timelyCooldownHours = 12): { timely: number; prayer: number } {
    const user = this.identityRepo.ensureUser(profile);
    return {
      timely: this.worshipRepo.getActiveTimelyStreak(user.id, timelyStreakWindowMs(timelyCooldownHours)),
      prayer: this.worshipRepo.getActiveStreak(user.id, 'prayer')
    };
  }

  getStreakLeaderboard(kind: StreakKind, limit = 10, guildId?: string | null): Array<{
    discordUserId: string;
    username: string;
    count: number;
    best: number;
  }> {
    return this.worshipRepo.topStreaks(kind, limit, new Date(), guildId).map((row) => ({
      discordUserId: row.discord_user_id,
      username: row.username ?? 'Unknown',
      count: row.count,
      best: row.best
    }));
  }

  getTimelyStatus(profile: UserProfileInput, cooldownHours: number): {
    available: boolean;
    remainingSeconds: number;
  } {
    const user = this.identityRepo.ensureUser(profile);
    const latest = this.ledgerService.getLatestByKind(user.id, 'claim_timely');
    if (!latest) {
      return { available: true, remainingSeconds: 0 };
    }
    const nextAt = Date.parse(latest.createdAt) + cooldownHours * 60 * 60 * 1000;
    const now = Date.now();
    if (now >= nextAt) {
      return { available: true, remainingSeconds: 0 };
    }
    return { available: false, remainingSeconds: Math.ceil((nextAt - now) / 1000) };
  }

  getPrayerStatus(profile: UserProfileInput): {
    claimed: PrayerName[];
    lastClaimAt: string | null;
    hasBonus: boolean;
  } {
    const user = this.identityRepo.ensureUser(profile);
    return this.worshipRepo.getPrayerStatus(user.id);
  }

  claimEid(profile: UserProfileInput, amount: number, subtype: string):
    | { ok: true }
    | { ok: false; reason: string } {
    const user = this.identityRepo.ensureUser(profile);
    this.worshipRepo.ensureWalletExists(user.id);

    return this.db.transaction(() => {
      const existing = this.ledgerService.getLatestByKindAndSubtype(user.id, 'claim_eid', subtype);
      if (existing) {
        return { ok: false, reason: 'You have already claimed this Eid bonus.' };
      }

      this.worshipRepo.creditWallet(user.id, amount);
      this.ledgerService.createTransaction({
        userId: user.id,
        amount,
        kind: 'claim_eid',
        subtype
      });

      return { ok: true };
    });
  }

  claimPrayer(
    profile: UserProfileInput,
    prayer: PrayerName,
    reward: number,
    cooldownHours: number,
    allFiveBonus: number
  ):
    | { ok: true; bonusAwarded: number; streak: number; streakBonus: number }
    | { ok: false; reason: string; remainingSeconds?: number } {
    const user = this.identityRepo.ensureUser(profile);
    this.worshipRepo.ensureWalletExists(user.id);

    return this.db.transaction(() => {
      const result = this.worshipRepo.claimPrayer(user.id, prayer, reward, cooldownHours, allFiveBonus);
      if (!result.ok) {
        return result;
      }

      const streak = this.worshipRepo.touchStreak(user.id, 'prayer');
      const streakBonus = Math.round((reward * streakBonusPercent(streak.count)) / 100);
      if (streakBonus > 0) {
        this.worshipRepo.creditWallet(user.id, streakBonus);
      }

      this.ledgerService.createTransaction({
        userId: user.id,
        amount: reward,
        kind: 'claim_prayer',
        subtype: prayer,
        createdAt: result.checkedInAt
      });

      if (streakBonus > 0) {
        this.ledgerService.createTransaction({
          userId: user.id,
          amount: streakBonus,
          kind: 'claim_prayer',
          subtype: 'streak_bonus',
          note: `streak:${streak.count}`,
          createdAt: result.checkedInAt
        });
      }

      if (result.bonusAwarded > 0) {
        this.ledgerService.createTransaction({
          userId: user.id,
          amount: result.bonusAwarded,
          kind: 'claim_prayer',
          subtype: 'all_five_bonus',
          createdAt: result.checkedInAt
        });
      }

      return { ok: true, bonusAwarded: result.bonusAwarded, streak: streak.count, streakBonus };
    });
  }
}
