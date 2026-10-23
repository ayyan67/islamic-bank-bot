import { resolve } from 'node:path';
import { env } from '../../config/env.js';
import { isEconomyGuild } from '../economy-scope/scope.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import { UserProfileInput } from '../../infra/db/types.js';
import { EconomyRepository } from '../economy/repository.js';
import { GuildSettingsService } from '../guild-settings/service.js';
import { LedgerService } from '../ledger/service.js';
import { loadAllTriviaLists } from './questionLoader.js';
import { TriviaRepository } from './repository.js';
import {
  buildQuestionMessage,
  checkAnswer,
  clearTimers,
  createSession,
  formatScoreboard
} from './session.js';
import { formatCurrency } from '../../infra/discord/formatting.js';
import type { MessageSender, TriviaList, TriviaSession, TriviaSessionConfig } from './types.js';

const REVEAL_MESSAGES = [
  'It was **{}**. Now you know for next time, inshaAllah!',
  'The answer was **{}**. A tough one — you\'ll get the next!',
  'It was **{}**! Add that to your knowledge bank.',
  '**{}**. Tricky one! Keep going, you\'re learning.',
  'It was **{}**. Every question is a chance to learn something new!',
  'The answer was **{}**. Don\'t worry, the next one\'s yours inshaAllah.',
  'It was **{}**. That was a hard one — no shame in that!',
  'The answer was **{}**. Remember it for next time!',
  'It was **{}**. The best learners are the ones who keep trying.',
  '**{}**. Knowledge comes one question at a time!',
  'It was **{}**. You\'re building knowledge with every round, mashaAllah.',
  'The answer was **{}**. Stay in the game — you\'ve got this!'
];

const FAIL_MESSAGES = [
  'On to the next one — you\'ve got this!',
  'No worries, let\'s keep it moving!',
  'That was a tough one. Next question!',
  'All good, the next one might be yours inshaAllah!',
  'Onwards! Every question is a fresh chance.',
  'Don\'t sweat it — let\'s see what\'s next!',
  'Keep going, the comeback is always stronger!'
];

const CORRECT_MESSAGES = [
  'got it! **+1** to you!',
  'nailed it! **+1**',
  'got it right! Finally someone with sense. **+1**',
  'yes! **+1** for actually reading.',
  'correct! **+1** Allahuma Barik.',
  'got it! About time someone showed up. **+1**',
  'is correct! **+1** point to the smart one.',
  'with the clutch answer! **+1**'
];

const WIN_MESSAGES = [
  'wins the trivia! Allahuma Barik, well played.',
  'takes the W! Not bad, not bad.',
  'wins! Finally someone who studied.',
  'is the trivia champion! The Ummah is proud.',
  'wins the game! SubhanAllah, actual knowledge displayed today.',
  'secured the victory! May your rewards be many.',
  'wins! I knew someone here had braincells.'
];

function pickRandom(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const ISLAMIC_LIST_PATTERNS = [
  'islamic',
  'quranic',
  'quran',
  'sahabi',
  'surah',
  'seerah',
  'hadith',
  'fiqh',
  'prophet'
];

export function isIslamicList(listName: string): boolean {
  const lower = listName.toLowerCase();
  return ISLAMIC_LIST_PATTERNS.some((p) => lower.includes(p));
}

export class TriviaService {
  private sessions = new Map<string, TriviaSession>();
  private readonly lists: Map<string, TriviaList>;

  constructor(
    private readonly triviaRepo: TriviaRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly ledgerService: LedgerService,
    private readonly economyRepo: EconomyRepository,
    private readonly guildSettingsService: GuildSettingsService
  ) {
    this.lists = loadAllTriviaLists(resolve(env.TRIVIA_LISTS_PATH));
  }

  hasActiveSession(channelId: string): boolean {
    return this.sessions.has(channelId);
  }

  getAvailableLists(): Array<{ name: string; questionCount: number }> {
    return [...this.lists.entries()].map(([name, list]) => ({
      name,
      questionCount: list.questions.length
    }));
  }

  getLeaderboard(guildId: string, listName?: string) {
    if (listName) {
      return this.triviaRepo.getLeaderboardByList(guildId, listName);
    }
    return this.triviaRepo.getLeaderboard(guildId);
  }

  startGame(
    channelId: string,
    guildId: string,
    starterId: string,
    listName: string,
    config: TriviaSessionConfig,
    sendMessage: MessageSender
  ): { ok: true; questionCount: number; isIslamic: boolean; bonusMultiplier: number } | { ok: false; reason: string } {
    if (this.sessions.has(channelId)) {
      return { ok: false, reason: 'A trivia session is already running in this channel.' };
    }

    const list = this.lists.get(listName);
    if (!list) {
      const available = [...this.lists.keys()].join(', ');
      return {
        ok: false,
        reason: `Trivia list "${listName}" not found. Available: ${available || 'none'}`
      };
    }

    const session = createSession(channelId, guildId, starterId, listName, list.questions, config, sendMessage);
    this.sessions.set(channelId, session);

    this.resetInactivityTimer(session);

    // Delay the first question by 5 seconds so the start embed renders first
    session.startDelayTimer = setTimeout(() => {
      session.startDelayTimer = null;
      if (session.status === 'stopped') return;
      sendMessage(channelId, { content: '**Starting now — here comes the first question!**' }).then(() => {
        this.postNextQuestion(session);
      });
    }, 5000);

    const islamic = isIslamicList(listName);
    const bonusMultiplier = islamic ? env.TRIVIA_ISLAMIC_BONUS_MULTIPLIER : 1;

    return { ok: true, questionCount: list.questions.length, isIslamic: islamic, bonusMultiplier };
  }

  stopGame(
    channelId: string,
    requesterId: string,
    isPrivileged = false
  ): { ok: true; scoreboard: string } | { ok: false; reason: string } {
    const session = this.sessions.get(channelId);
    if (!session) {
      return { ok: false, reason: "There's no trivia session running in this channel." };
    }

    if (!isPrivileged && session.starterId !== requesterId) {
      return { ok: false, reason: 'Only the person who started the trivia (or an admin) can stop it.' };
    }

    return this.endGame(session);
  }

  async handleMessage(
    channelId: string,
    authorId: string,
    profile: UserProfileInput,
    content: string,
    sendMessage: MessageSender
  ): Promise<void> {
    const session = this.sessions.get(channelId);
    if (!session) return;
    if (session.status !== 'waiting_for_answer') return;
    if (!session.currentQuestion) return;

    this.resetInactivityTimer(session);

    if (!checkAnswer(content, session.currentQuestion.answers)) return;

    // Correct answer
    session.currentQuestion = null;
    session.status = 'between_questions';

    if (session.questionTimer) {
      clearTimeout(session.questionTimer);
      session.questionTimer = null;
    }

    const currentScore = (session.scores.get(authorId) ?? 0) + 1;
    session.scores.set(authorId, currentScore);
    session.playerProfiles.set(authorId, profile);

    const replyText = `<@${authorId}> ${pickRandom(CORRECT_MESSAGES)} (Score: **${currentScore}**)`;

    await sendMessage(channelId, { content: replyText });

    if (currentScore >= session.config.maxScore) {
      session.winnerId = authorId;
      const rewards = this.distributeRewards(session);
      const rewardsText = this.formatRewardsSummary(rewards);
      await sendMessage(channelId, {
        content: `<@${authorId}> ${pickRandom(WIN_MESSAGES)} Final score: **${currentScore}**\n\n${formatScoreboard(session.scores)}${rewardsText}`
      });
      this.recordAllParticipants(session);
      this.cleanupSession(session);
      return;
    }

    setTimeout(() => this.postNextQuestion(session), 3000);
  }

  stopAllGames(): void {
    for (const session of this.sessions.values()) {
      clearTimers(session);
      session.status = 'stopped';
    }
    this.sessions.clear();
  }

  private postNextQuestion(session: TriviaSession): void {
    if (session.status === 'stopped') return;

    if (session.remainingQuestions.length === 0) {
      const rewards = this.distributeRewards(session);
      const rewardsText = this.formatRewardsSummary(rewards);
      session.sendMessage(session.channelId, {
        content: `No more questions! Game over.\n\n${formatScoreboard(session.scores)}${rewardsText}`
      });
      this.recordAllParticipants(session);
      this.cleanupSession(session);
      return;
    }

    const question = session.remainingQuestions.pop()!;
    session.currentQuestion = question;
    session.questionCount++;
    session.status = 'waiting_for_answer';

    const message = buildQuestionMessage(question, session.questionCount);
    session.sendMessage(session.channelId, message);

    session.questionTimer = setTimeout(() => {
      this.handleQuestionTimeout(session);
    }, session.config.delaySeconds * 1000);
  }

  private handleQuestionTimeout(session: TriviaSession): void {
    if (session.status !== 'waiting_for_answer') return;

    const timedOutQuestion = session.currentQuestion;
    session.currentQuestion = null;
    session.status = 'between_questions';
    session.questionTimer = null;

    let msg: string;
    if (session.config.revealAnswer && timedOutQuestion) {
      msg = pickRandom(REVEAL_MESSAGES).replace('{}', timedOutQuestion.answers[0] ?? 'unknown');
    } else {
      msg = pickRandom(FAIL_MESSAGES);
    }

    if (session.config.botPlays) {
      msg += ' **+1** for me!';
    }

    session.sendMessage(session.channelId, { content: msg });

    setTimeout(() => this.postNextQuestion(session), 3000);
  }

  private resetInactivityTimer(session: TriviaSession): void {
    if (session.inactivityTimer) {
      clearTimeout(session.inactivityTimer);
    }

    session.inactivityTimer = setTimeout(() => {
      const rewards = this.distributeRewards(session);
      const rewardsText = this.formatRewardsSummary(rewards);
      session.sendMessage(session.channelId, {
        content: `No activity for ${session.config.timeoutSeconds} seconds. Trivia ended.\n\n${formatScoreboard(session.scores)}${rewardsText}`
      });
      this.recordAllParticipants(session);
      this.cleanupSession(session);
    }, session.config.timeoutSeconds * 1000);
  }

  private endGame(session: TriviaSession): { ok: true; scoreboard: string } {
    const rewards = this.distributeRewards(session);
    const rewardsText = this.formatRewardsSummary(rewards);
    const scoreboard = `${formatScoreboard(session.scores)}${rewardsText}`;
    this.recordAllParticipants(session);
    this.cleanupSession(session);
    return { ok: true, scoreboard };
  }

  private cleanupSession(session: TriviaSession): void {
    clearTimers(session);
    session.status = 'stopped';
    this.sessions.delete(session.channelId);
  }

  private distributeRewards(session: TriviaSession): Map<string, number> {
    const rewards = new Map<string, number>();
    const settings = this.guildSettingsService.getEffectiveSettings(session.guildId);
    const requireMultiple = settings.triviaRequireMultiplePlayers;

    // If multiplayer required and fewer than 2 unique players, no rewards
    if (requireMultiple && session.scores.size < 2) {
      return rewards;
    }

    // Trivia stays playable everywhere, but only pays out in economy guilds.
    const canEarn = isEconomyGuild(session.guildId);
    const perCorrect = canEarn ? settings.triviaRewardPerCorrect : 0;
    const winBonus = canEarn ? settings.triviaWinBonus : 0;
    const multiplier = isIslamicList(session.listName) ? env.TRIVIA_ISLAMIC_BONUS_MULTIPLIER : 1;

    for (const [discordUserId, score] of session.scores) {
      const profile = session.playerProfiles.get(discordUserId) ?? { discordUserId };
      const user = this.identityRepo.ensureUser(profile);
      let total = 0;

      // Reward for correct answers (with Islamic bonus if applicable)
      if (perCorrect > 0 && score > 0) {
        const amount = Math.floor(perCorrect * score * multiplier);
        total += amount;
        this.economyRepo.addWalletBalance(user.id, amount);
        this.ledgerService.createTransaction({
          userId: user.id,
          amount,
          kind: 'claim_trivia',
          subtype: 'correct_answer',
          note: `trivia:${session.listName} (${score} correct${multiplier > 1 ? `, ${multiplier}x bonus` : ''})`
        });
      }

      // Record correct answers for stats
      for (let i = 0; i < score; i++) {
        this.triviaRepo.recordCorrectAnswer(user.id, session.guildId, session.listName);
      }

      // Win bonus (with Islamic bonus if applicable)
      if (session.winnerId === discordUserId && winBonus > 0) {
        const boostedWinBonus = Math.floor(winBonus * multiplier);
        total += boostedWinBonus;
        this.economyRepo.addWalletBalance(user.id, boostedWinBonus);
        this.ledgerService.createTransaction({
          userId: user.id,
          amount: boostedWinBonus,
          kind: 'claim_trivia',
          subtype: 'game_win',
          note: `trivia:${session.listName}${multiplier > 1 ? ` (${multiplier}x bonus)` : ''}`
        });
        this.triviaRepo.recordGameWon(user.id, session.guildId, session.listName);
      }

      if (total > 0) {
        rewards.set(discordUserId, total);
      }
    }

    return rewards;
  }

  private formatRewardsSummary(rewards: Map<string, number>): string {
    if (rewards.size === 0) return '\n\n> No rewards — need 2+ players for earnings.';

    const lines = [...rewards.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([userId, amount]) => `<@${userId}> — ${formatCurrency(amount)}`);

    return `\n\n**Earnings:**\n${lines.join('\n')}`;
  }

  private recordAllParticipants(session: TriviaSession): void {
    for (const [discordUserId] of session.scores) {
      const profile = session.playerProfiles.get(discordUserId) ?? { discordUserId };
      const user = this.identityRepo.ensureUser(profile);
      this.triviaRepo.recordGamePlayed(user.id, session.guildId, session.listName);
    }
  }
}
