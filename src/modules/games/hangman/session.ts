import type { HangmanSession, HangmanPayload, HangmanGameState } from './types.js';
import { GALLOWS_STAGES, MAX_WRONG_GUESSES } from './types.js';

const HANGMAN_COLOR: Record<HangmanGameState, number> = {
  playing: 0xf59e0b, // amber
  solved: 0x16a34a, // green
  lost: 0xef4444 // red
};

export function buildWordDisplay(word: string, guessed: Set<string>): string {
  return word
    .split('')
    .map((ch) => {
      if (ch === ' ') return '  ';
      const upper = ch.toUpperCase();
      return guessed.has(upper) || !/[A-Z]/.test(upper) ? ch.toUpperCase() : '\\_';
    })
    .join(' ');
}

export function isWordSolved(word: string, guessed: Set<string>): boolean {
  return word
    .toUpperCase()
    .split('')
    .every((ch) => !/[A-Z]/.test(ch) || guessed.has(ch));
}

export function buildHangmanEmbed(session: HangmanSession, state: HangmanGameState = 'playing'): HangmanPayload {
  const stage = GALLOWS_STAGES[Math.min(session.wrongGuesses.size, GALLOWS_STAGES.length - 1)] ?? '';
  const display = buildWordDisplay(session.word, session.guessed);
  const wrongList = session.wrongGuesses.size > 0 ? [...session.wrongGuesses].sort().join('  ') : 'None';

  const categoryLabel = session.category.charAt(0).toUpperCase() + session.category.slice(1);

  let description = `${stage}\n\n**${display}**`;
  let footerText = 'Type a letter or the full word to guess';

  if (state === 'solved') {
    description += '\n\n\u2705 **Solved!** Well played.';
    footerText = `The word was ${session.word}`;
  } else if (state === 'lost') {
    description += `\n\n\uD83D\uDC80 **Game over!** The word was **${session.word}**.`;
    footerText = `The word was ${session.word}`;
  }

  return {
    embeds: [
      {
        title: `\uD83C\uDFB4 Hangman \u2014 ${categoryLabel}`,
        description,
        color: HANGMAN_COLOR[state],
        fields: [
          {
            name: 'Wrong Guesses',
            value: `${wrongList}  (${session.wrongGuesses.size}/${MAX_WRONG_GUESSES})`,
            inline: true
          }
        ],
        footer: { text: footerText }
      }
    ]
  };
}

export function guessLetter(
  session: HangmanSession,
  letter: string
): 'already_guessed' | 'correct' | 'wrong' | 'solved' | 'lost' {
  const upper = letter.toUpperCase();
  if (session.guessed.has(upper) || session.wrongGuesses.has(upper)) return 'already_guessed';

  if (session.word.toUpperCase().includes(upper)) {
    session.guessed.add(upper);
    if (isWordSolved(session.word, session.guessed)) return 'solved';
    return 'correct';
  } else {
    session.wrongGuesses.add(upper);
    if (session.wrongGuesses.size >= MAX_WRONG_GUESSES) return 'lost';
    return 'wrong';
  }
}

export function guessWord(session: HangmanSession, word: string): 'solved' | 'wrong' | 'lost' {
  if (word.toUpperCase() === session.word.toUpperCase()) {
    // Reveal all letters
    for (const ch of session.word.toUpperCase()) {
      if (/[A-Z]/.test(ch)) session.guessed.add(ch);
    }
    return 'solved';
  }

  session.wrongGuesses.add(`[${word.toUpperCase()}]`);
  if (session.wrongGuesses.size >= MAX_WRONG_GUESSES) return 'lost';
  return 'wrong';
}
