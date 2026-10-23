import { Board, Cell, ROWS, COLS, CELL_EMOJI } from './types.js';

export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as Cell[]);
}

export function dropPiece(board: Board, col: number, player: 1 | 2): number | null {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row]![col] === 0) {
      board[row]![col] = player;
      return row;
    }
  }
  return null; // column is full
}

export function checkWin(board: Board, row: number, col: number, player: Cell): boolean {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ] as const;

  for (const [dr, dc] of directions) {
    let count = 1;
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r]![c] === player) {
        count++;
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

export function isBoardFull(board: Board): boolean {
  return board[0]!.every((cell) => cell !== 0);
}

export function renderBoard(board: Board): string {
  const colNums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];
  const rows = board.map((row) => row.map((cell) => CELL_EMOJI[cell]).join('')).join('\n');
  return `${rows}\n${colNums.join('')}`;
}
