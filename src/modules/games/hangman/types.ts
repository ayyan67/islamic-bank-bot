export interface HangmanSession {
  channelId: string;
  guildId: string;
  startedBy: string;
  word: string;
  category: string;
  guessed: Set<string>;
  wrongGuesses: Set<string>;
  messageId: string | null;
  startedAt: number;
}

export type HangmanPayload = { embeds: any[] } | { content: string };

export type HangmanGameState = 'playing' | 'solved' | 'lost';

export const MAX_WRONG_GUESSES = 7;

export const GALLOWS_STAGES = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```',
  '```\n  +---+\n  |   |\n [X]  |\n /|\\  |\n / \\  |\n      |\n=========```'
];
