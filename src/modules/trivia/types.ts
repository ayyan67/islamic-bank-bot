export interface TriviaQuestion {
  questionText: string;
  imageUrl: string | null;
  answers: string[];
}

export interface TriviaList {
  name: string;
  questions: TriviaQuestion[];
}

export interface TriviaSessionConfig {
  maxScore: number;
  delaySeconds: number;
  timeoutSeconds: number;
  revealAnswer: boolean;
  botPlays: boolean;
}

export type SessionStatus = 'waiting_for_answer' | 'between_questions' | 'stopped';

export type MessagePayload =
  | { content: string }
  | { content: string; embeds: Array<{ description: string; image: { url: string }; color: number }> };

export type MessageSender = (channelId: string, payload: MessagePayload) => Promise<void>;

export interface TriviaSession {
  channelId: string;
  guildId: string;
  starterId: string;
  listName: string;
  scores: Map<string, number>;
  /** Discord user ID → last known profile for reward payout */
  playerProfiles: Map<string, { discordUserId: string; username?: string | null }>;
  /** Discord user ID of the player who won (reached maxScore), if any */
  winnerId: string | null;
  questionCount: number;
  currentQuestion: TriviaQuestion | null;
  remainingQuestions: TriviaQuestion[];
  config: TriviaSessionConfig;
  status: SessionStatus;
  questionTimer: ReturnType<typeof setTimeout> | null;
  inactivityTimer: ReturnType<typeof setTimeout> | null;
  startDelayTimer: ReturnType<typeof setTimeout> | null;
  sendMessage: MessageSender;
}

export interface TriviaLeaderboardRow {
  discord_user_id: string;
  username: string | null;
  total_correct: number;
  total_wins: number;
  total_games: number;
}
