import { Connect4Session, TURN_TIMEOUT_MS } from './types.js';
import { createBoard, dropPiece, checkWin, isBoardFull, renderBoard } from './session.js';

const COLOR_P1 = 0xe74c3c; // red
const COLOR_P2 = 0x3498db; // blue
const COLOR_WIN = 0xf1c40f; // gold
const COLOR_DRAW = 0x95a5a6; // gray
const COLOR_END = 0xe74c3c; // red for timeout/resign

export class Connect4Service {
  private readonly sessions = new Map<string, Connect4Session>();

  startGame(
    channelId: string,
    guildId: string,
    p1: { id: string; username: string },
    p2: { id: string; username: string },
    onTimeout: (session: Connect4Session) => void
  ): { ok: true; session: Connect4Session } | { ok: false; reason: string } {
    if (this.sessions.has(channelId)) {
      return { ok: false, reason: 'A Connect 4 game is already in progress in this channel.' };
    }
    if (p1.id === p2.id) {
      return { ok: false, reason: "You can't challenge yourself!" };
    }

    const session: Connect4Session = {
      channelId,
      guildId,
      player1: p1,
      player2: p2,
      board: createBoard(),
      currentTurn: 1,
      messageId: null,
      turnTimer: null,
      startedAt: Date.now()
    };

    session.turnTimer = setTimeout(() => onTimeout(session), TURN_TIMEOUT_MS);
    this.sessions.set(channelId, session);
    return { ok: true, session };
  }

  playColumn(
    channelId: string,
    playerId: string,
    col: number
  ): { ok: true; result: 'win' | 'draw' | 'continue'; session: Connect4Session } | { ok: false; reason: string } {
    const session = this.sessions.get(channelId);
    if (!session) return { ok: false, reason: 'No Connect 4 game active in this channel.' };

    const expectedId = session.currentTurn === 1 ? session.player1.id : session.player2.id;
    if (playerId !== expectedId) return { ok: false, reason: "It's not your turn!" };

    if (col < 0 || col >= 7) return { ok: false, reason: 'Invalid column. Choose 1–7.' };

    const row = dropPiece(session.board, col, session.currentTurn);
    if (row === null) return { ok: false, reason: 'That column is full. Choose another.' };

    if (session.turnTimer) clearTimeout(session.turnTimer);

    if (checkWin(session.board, row, col, session.currentTurn)) {
      this.sessions.delete(channelId);
      return { ok: true, result: 'win', session };
    }

    if (isBoardFull(session.board)) {
      this.sessions.delete(channelId);
      return { ok: true, result: 'draw', session };
    }

    session.currentTurn = session.currentTurn === 1 ? 2 : 1;
    return { ok: true, result: 'continue', session };
  }

  buildDisplay(session: Connect4Session, footer?: string): string {
    const p1 = `🔴 ${session.player1.username}`;
    const p2 = `🔵 ${session.player2.username}`;
    const turnPlayer = session.currentTurn === 1 ? session.player1 : session.player2;
    const turnEmoji = session.currentTurn === 1 ? '🔴' : '🔵';
    const board = renderBoard(session.board);
    const turnLine = footer ? footer : `${turnEmoji} **${turnPlayer.username}'s turn** — type a column number (1–7)`;
    return `${p1} vs ${p2}\n${board}\n${turnLine}`;
  }

  buildEmbed(
    session: Connect4Session,
    state: 'playing' | 'win' | 'draw' | 'timeout' | 'resign' = 'playing',
    winner?: { id: string; username: string },
    loser?: { id: string; username: string }
  ): { embeds: any[] } {
    const p1 = session.player1;
    const p2 = session.player2;
    const board = renderBoard(session.board);

    let color: number;
    let title: string;
    let statusLine: string;
    let footerText: string;

    if (state === 'win' && winner) {
      const winEmoji = winner.id === p1.id ? '🔴' : '🔵';
      color = COLOR_WIN;
      title = '🏆 Connect 4';
      statusLine = `${winEmoji} **${winner.username}** wins the game! Congratulations!`;
      footerText = 'Game over';
    } else if (state === 'draw') {
      color = COLOR_DRAW;
      title = '🤝 Connect 4';
      statusLine = "🤝 The game ended in a draw — well played both!";
      footerText = 'Game over';
    } else if (state === 'timeout' && loser && winner) {
      const winEmoji = winner.id === p1.id ? '🔴' : '🔵';
      color = COLOR_END;
      title = '⏰ Connect 4 — Time Out';
      statusLine = `⏰ **${loser.username}** ran out of time! ${winEmoji} **${winner.username}** wins by forfeit.`;
      footerText = 'Game over — 60s per turn';
    } else if (state === 'resign' && loser && winner) {
      const winEmoji = winner.id === p1.id ? '🔴' : '🔵';
      color = COLOR_END;
      title = '🏳️ Connect 4 — Resigned';
      statusLine = `🏳️ **${loser.username}** resigned! ${winEmoji} **${winner.username}** wins.`;
      footerText = 'Game over';
    } else {
      // playing
      const turnPlayer = session.currentTurn === 1 ? p1 : p2;
      const turnEmoji = session.currentTurn === 1 ? '🔴' : '🔵';
      color = session.currentTurn === 1 ? COLOR_P1 : COLOR_P2;
      title = '🎮 Connect 4';
      statusLine = `${turnEmoji} **${turnPlayer.username}'s turn** — type a column number (1–7)`;
      footerText = 'Type 1–7 to drop a piece • .c4stop to resign';
    }

    return {
      embeds: [
        {
          title,
          description: `${board}\n\n${statusLine}`,
          color,
          fields: [
            { name: '🔴 Player 1', value: p1.username, inline: true },
            { name: '🔵 Player 2', value: p2.username, inline: true }
          ],
          footer: { text: footerText },
          timestamp: new Date().toISOString()
        }
      ]
    };
  }

  forceEnd(channelId: string): Connect4Session | null {
    const session = this.sessions.get(channelId);
    if (session) {
      if (session.turnTimer) clearTimeout(session.turnTimer);
      this.sessions.delete(channelId);
    }
    return session ?? null;
  }

  hasActiveSession(channelId: string): boolean {
    return this.sessions.has(channelId);
  }

  getSession(channelId: string): Connect4Session | undefined {
    return this.sessions.get(channelId);
  }

  stopAllGames(): void {
    for (const session of this.sessions.values()) {
      if (session.turnTimer) clearTimeout(session.turnTimer);
    }
    this.sessions.clear();
  }
}
