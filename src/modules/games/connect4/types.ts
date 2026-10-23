export const ROWS = 6;
export const COLS = 7;

export type Cell = 0 | 1 | 2; // 0=empty, 1=P1, 2=P2
export type Board = Cell[][];

export interface Connect4Session {
  channelId: string;
  guildId: string;
  player1: { id: string; username: string };
  player2: { id: string; username: string };
  board: Board;
  currentTurn: 1 | 2;
  messageId: string | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
}

export const TURN_TIMEOUT_MS = 60_000; // 60 seconds per turn
export const CELL_EMOJI: Record<Cell, string> = {
  0: '⚫',
  1: '🔴',
  2: '🔵'
};
