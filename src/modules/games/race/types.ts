export interface Racer {
  discordUserId: string;
  username: string;
  animal: string;
  position: number; // 0–100
}

export interface RaceSession {
  channelId: string;
  guildId: string;
  hostUserId: string;
  racers: Map<string, Racer>;
  joinWindowMs: number;
  joinWindowEndsAt: number;
  messageId: string | null;
  started: boolean;
}

export const RACE_ANIMALS = ['🐎', '🐢', '🐇', '🦅', '🐿️', '🦁', '🐬', '🦊'];
export const TRACK_LENGTH = 20;
export const JOIN_WINDOW_SECONDS = 30;
