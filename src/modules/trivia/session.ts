import type {
  MessagePayload,
  MessageSender,
  TriviaQuestion,
  TriviaSession,
  TriviaSessionConfig
} from './types.js';

export function checkAnswer(guess: string, answers: string[]): boolean {
  const guessLower = guess.toLowerCase();

  for (const answer of answers) {
    const answerLower = answer.toLowerCase();
    if (!answerLower.includes(' ')) {
      const words = guessLower.split(/\s+/);
      if (words.includes(answerLower)) return true;
    } else {
      if (guessLower.includes(answerLower)) return true;
    }
  }

  return false;
}

export function buildQuestionMessage(question: TriviaQuestion, questionNumber: number): MessagePayload {
  const header = `**Question ${questionNumber}!**`;

  if (question.imageUrl) {
    return {
      content: header,
      embeds: [
        {
          description: question.questionText,
          image: { url: question.imageUrl },
          color: 0x2ecc71
        }
      ]
    };
  }

  return { content: `${header}\n\n${question.questionText}` };
}

function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }
  return shuffled;
}

export function createSession(
  channelId: string,
  guildId: string,
  starterId: string,
  listName: string,
  questions: TriviaQuestion[],
  config: TriviaSessionConfig,
  sendMessage: MessageSender
): TriviaSession {
  return {
    channelId,
    guildId,
    starterId,
    listName,
    scores: new Map(),
    playerProfiles: new Map(),
    winnerId: null,
    questionCount: 0,
    currentQuestion: null,
    remainingQuestions: shuffle(questions),
    config,
    status: 'between_questions',
    questionTimer: null,
    inactivityTimer: null,
    startDelayTimer: null,
    sendMessage
  };
}

export function clearTimers(session: TriviaSession): void {
  if (session.questionTimer) {
    clearTimeout(session.questionTimer);
    session.questionTimer = null;
  }
  if (session.inactivityTimer) {
    clearTimeout(session.inactivityTimer);
    session.inactivityTimer = null;
  }
  if (session.startDelayTimer) {
    clearTimeout(session.startDelayTimer);
    session.startDelayTimer = null;
  }
}

export function formatScoreboard(scores: Map<string, number>): string {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return 'No scores recorded.';

  const lines = sorted.map(([userId, score]) => `<@${userId}> — **${score}**`);
  return `**Results:**\n${lines.join('\n')}`;
}
