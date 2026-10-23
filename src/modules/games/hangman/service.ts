import { resolve } from 'node:path';
import { env } from '../../../config/env.js';
import type { HangmanSession, HangmanPayload, HangmanGameState } from './types.js';
import { buildHangmanEmbed, guessLetter, guessWord } from './session.js';
import { loadAllHangmanLists, type HangmanWordList } from './wordLoader.js';

type SendFn = (channelId: string, payload: HangmanPayload) => Promise<{ id: string } | any>;
type EditFn = (channelId: string, messageId: string, payload: HangmanPayload) => Promise<void>;

export class HangmanService {
  private readonly sessions = new Map<string, HangmanSession>();
  private readonly lists: Map<string, HangmanWordList>;

  constructor() {
    this.lists = loadAllHangmanLists(resolve(env.HANGMAN_WORDS_PATH));
  }

  getAvailableCategories(): { name: string; wordCount: number }[] {
    return [...this.lists.entries()].map(([name, list]) => ({
      name,
      wordCount: list.words.length
    }));
  }

  pickWord(category?: string): { word: string; category: string } | null {
    if (category && this.lists.has(category)) {
      const list = this.lists.get(category)!;
      const word = list.words[Math.floor(Math.random() * list.words.length)];
      return word ? { word, category } : null;
    }

    // Random category
    const entries = [...this.lists.entries()];
    if (entries.length === 0) return null;
    const [catName, catList] = entries[Math.floor(Math.random() * entries.length)]!;
    const word = catList.words[Math.floor(Math.random() * catList.words.length)];
    return word ? { word, category: catName } : null;
  }

  startGame(
    channelId: string,
    guildId: string,
    startedBy: string,
    category?: string
  ): { ok: true; session: HangmanSession } | { ok: false; reason: string } {
    if (this.sessions.has(channelId)) {
      return { ok: false, reason: 'A hangman game is already in progress in this channel.' };
    }

    const picked = this.pickWord(category);
    if (!picked) return { ok: false, reason: 'Could not find a word to use. No word lists loaded.' };

    const session: HangmanSession = {
      channelId,
      guildId,
      startedBy,
      word: picked.word,
      category: picked.category,
      guessed: new Set(),
      wrongGuesses: new Set(),
      messageId: null,
      startedAt: Date.now()
    };

    this.sessions.set(channelId, session);
    return { ok: true, session };
  }

  stopGame(
    channelId: string,
    requesterId: string,
    isPrivileged: boolean
  ): { ok: true; word: string } | { ok: false; reason: string } {
    const session = this.sessions.get(channelId);
    if (!session) return { ok: false, reason: 'No hangman game is active in this channel.' };
    if (session.startedBy !== requesterId && !isPrivileged) {
      return { ok: false, reason: 'Only the game starter or an admin can stop the game.' };
    }
    this.sessions.delete(channelId);
    return { ok: true, word: session.word };
  }

  hasActiveSession(channelId: string): boolean {
    return this.sessions.has(channelId);
  }

  async handleMessage(channelId: string, content: string, send: SendFn, edit: EditFn): Promise<void> {
    const session = this.sessions.get(channelId);
    if (!session) return;

    const trimmed = content.trim();
    if (!/^[A-Za-z]+$/.test(trimmed)) return;

    const isSingleLetter = trimmed.length === 1;
    const result = isSingleLetter ? guessLetter(session, trimmed) : guessWord(session, trimmed);
    if (result === 'already_guessed') return;

    let state: HangmanGameState = 'playing';
    if (result === 'solved') {
      this.sessions.delete(channelId);
      state = 'solved';
    } else if (result === 'lost') {
      this.sessions.delete(channelId);
      state = 'lost';
    }

    const embed = buildHangmanEmbed(session, state);

    if (session.messageId) {
      try {
        await edit(channelId, session.messageId, embed);
        return;
      } catch {
        // Message may have been deleted — fall through to send new
      }
    }

    const msg = await send(channelId, embed);
    if (msg?.id) session.messageId = msg.id;
  }

  getInitialEmbed(session: HangmanSession): HangmanPayload {
    return buildHangmanEmbed(session);
  }

  stopAllGames(): void {
    this.sessions.clear();
  }
}
