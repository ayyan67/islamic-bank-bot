import { Database } from '../../infra/db/database.js';
import { EARN_DENIED_REASON, isEconomyGuild } from '../economy-scope/scope.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import { EconomyRepository } from '../economy/repository.js';
import { LedgerService } from '../ledger/service.js';
import { GuildSettingsService } from '../guild-settings/service.js';
import { ChallengeRepository } from './repository.js';
import {
  SURAH_PROMPTS,
  type ChallengeBan,
  type CompleteChallengeResult,
  type DailyChallenge
} from './types.js';

/** How often the same challenge is reposted (in ms) */
const REPOST_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickRandomPrompt(excludeKey?: string): (typeof SURAH_PROMPTS)[number] {
  const candidates = excludeKey
    ? SURAH_PROMPTS.filter((p) => p.key !== excludeKey)
    : [...SURAH_PROMPTS];
  if (candidates.length === 0) return SURAH_PROMPTS[0]!;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

export function buildChallengeEmbed(
  promptText: string,
  rewardAmount: number,
  completionCount: number
): { embeds: any[] } {
  return {
    embeds: [
      {
        title: '🕌 Daily Recitation Challenge',
        description: promptText,
        color: 0x047857,
        fields: [
          { name: 'Reward', value: formatCurrency(rewardAmount), inline: true },
          { name: 'Completions', value: String(completionCount), inline: true },
          { name: 'How to Complete', value: 'Send a **voice note** in this channel with your recitation', inline: false }
        ],
        footer: { text: 'Honor system — send a voice note to earn the reward' },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

export class ChallengeService {
  constructor(
    private readonly db: Database,
    private readonly challengeRepo: ChallengeRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly ledgerService: LedgerService,
    private readonly guildSettingsService: GuildSettingsService
  ) {}

  getActiveChallenge(guildId: string): DailyChallenge | undefined {
    return this.challengeRepo.getActiveChallenge(guildId);
  }

  getActiveChallengeByChannel(channelId: string): DailyChallenge | undefined {
    return this.challengeRepo.getActiveChallengeByChannel(channelId);
  }

  getCompletionCount(challengeId: number): number {
    return this.challengeRepo.countCompletions(challengeId);
  }

  completeChallenge(
    profile: UserProfileInput,
    channelId: string
  ): CompleteChallengeResult {
    const challenge = this.challengeRepo.getActiveChallengeByChannel(channelId);
    if (!challenge) {
      return { ok: false, reason: 'No active challenge in this channel.' };
    }
    if (!isEconomyGuild(challenge.guildId)) {
      return { ok: false, reason: EARN_DENIED_REASON };
    }

    const user = this.identityRepo.ensureUser(profile);

    const ban = this.challengeRepo.getActiveBan(challenge.guildId, user.id);
    if (ban) {
      return { ok: false, reason: 'banned' };
    }

    if (this.challengeRepo.hasCompleted(challenge.id, user.id)) {
      return { ok: false, reason: 'already_completed' };
    }

    this.db.transaction(() => {
      this.challengeRepo.createCompletion(challenge.id, user.id);
      this.economyRepo.addWalletBalance(user.id, challenge.rewardAmount);
      this.ledgerService.createTransaction({
        userId: user.id,
        amount: challenge.rewardAmount,
        kind: 'challenge_reward',
        subtype: 'daily_recitation',
        note: `challenge:${challenge.promptKey}:${challenge.challengeDate}`
      });
    });

    const completionCount = this.challengeRepo.countCompletions(challenge.id);

    return {
      ok: true,
      rewardAmount: challenge.rewardAmount,
      completionCount,
      challengeTitle: challenge.promptText.split('\n')[0] ?? challenge.promptKey
    };
  }

  /**
   * Called by the periodic poll. For each guild with a challenge channel:
   * - If no active challenge today, create one and return it for posting.
   * - If active but needs repost (>3h since last post), return it for reposting.
   * - Otherwise, skip.
   */
  getGuildsNeedingPost(): Array<{
    guildId: string;
    channelId: string;
    challenge: DailyChallenge;
    isNew: boolean;
  }> {
    const guilds = this.guildSettingsService.listGuildsWithChallengeChannel();
    const results: Array<{
      guildId: string;
      channelId: string;
      challenge: DailyChallenge;
      isNew: boolean;
    }> = [];

    const today = todayDateString();
    const now = Date.now();

    for (const { guildId, channelId } of guilds) {
      const existing = this.challengeRepo.getActiveChallenge(guildId);

      if (existing && existing.challengeDate === today) {
        // Check if it needs a repost
        const lastPosted = new Date(existing.lastPostedAt).getTime();
        if (now - lastPosted >= REPOST_INTERVAL_MS) {
          results.push({ guildId, channelId, challenge: existing, isNew: false });
        }
        continue;
      }

      // Expire any old active challenge
      if (existing) {
        this.challengeRepo.expireChallenge(existing.id);
      }

      // Create new challenge for today
      const settings = this.guildSettingsService.getEffectiveSettings(guildId);
      const reward = settings.challengeReward;
      const prompt = pickRandomPrompt(existing?.promptKey);
      const promptText = `**Recite Surah ${prompt.surah}** (${prompt.arabicName})\n${prompt.description} — ${prompt.verse_count} verses`;

      const challengeId = this.challengeRepo.createChallenge({
        guildId,
        channelId,
        messageId: null,
        promptKey: prompt.key,
        promptText,
        rewardAmount: reward,
        challengeDate: today,
        lastPostedAt: new Date().toISOString()
      });

      const challenge = this.challengeRepo.getActiveChallenge(guildId)!;
      this.challengeRepo.expireOldChallenges(guildId, challengeId);

      results.push({ guildId, channelId, challenge, isNew: true });
    }

    return results;
  }

  markPosted(challengeId: number, messageId: string): void {
    this.challengeRepo.updateMessageId(challengeId, messageId);
  }

  hasUserCompleted(challengeId: number, profile: UserProfileInput): boolean {
    const user = this.identityRepo.ensureUser(profile);
    return this.challengeRepo.hasCompleted(challengeId, user.id);
  }

  // --- Ban management ---

  banUser(
    guildId: string,
    targetProfile: UserProfileInput,
    adminProfile: UserProfileInput,
    reason: string | null,
    durationMinutes: number | null
  ): { ok: true } | { ok: false; reason: string } {
    const target = this.identityRepo.ensureUser(targetProfile);
    const admin = this.identityRepo.ensureUser(adminProfile);

    const expiresAt = durationMinutes
      ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
      : null;

    this.challengeRepo.banUser(guildId, target.id, admin.id, reason, expiresAt);
    return { ok: true };
  }

  unbanUser(
    guildId: string,
    targetProfile: UserProfileInput
  ): { ok: true } | { ok: false; reason: string } {
    const target = this.identityRepo.ensureUser(targetProfile);
    const removed = this.challengeRepo.unbanUser(guildId, target.id);
    if (!removed) {
      return { ok: false, reason: 'This user is not banned from daily challenges.' };
    }
    return { ok: true };
  }

  isUserBanned(guildId: string, profile: UserProfileInput): ChallengeBan | undefined {
    const user = this.identityRepo.ensureUser(profile);
    return this.challengeRepo.getActiveBan(guildId, user.id);
  }

  listBans(guildId: string): ChallengeBan[] {
    return this.challengeRepo.listBans(guildId);
  }

  /** Resolve a ban's user_id (internal) to a discord_user_id for display */
  resolveDiscordId(userId: number): string | undefined {
    return this.identityRepo.getUserById(userId)?.discordUserId;
  }
}
