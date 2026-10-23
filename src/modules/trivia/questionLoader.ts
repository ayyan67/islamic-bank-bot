import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TriviaList, TriviaQuestion } from './types.js';

const URL_PATTERN = /https?:\/\/\S+/;

export function parseTriviaFile(name: string, content: string): TriviaList {
  const questions: TriviaQuestion[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || !line.includes('`')) continue;

    const parts = line.split('`');
    const questionRaw = parts[0];
    const answers = parts
      .slice(1)
      .map((a) => a.trim())
      .filter(Boolean);

    if (!questionRaw || answers.length === 0) continue;

    const urlMatch = questionRaw.match(URL_PATTERN);
    const imageUrl = urlMatch ? urlMatch[0] : null;
    const questionText = imageUrl ? questionRaw.replace(imageUrl, '').trim() : questionRaw;

    questions.push({ questionText, imageUrl, answers });
  }

  return { name, questions };
}

function applyPalestineSubstitution(list: TriviaList): void {
  for (const q of list.questions) {
    const hasIsrael = q.answers.some((a) => a.toLowerCase() === 'israel');
    if (!hasIsrael) continue;

    q.answers = q.answers.map((a) => (a.toLowerCase() === 'israel' ? 'Palestine' : a));
    q.questionText = q.questionText.replace(/Israel/gi, 'Palestine');

    if (q.questionText.toLowerCase().includes('capital of palestine')) {
      if (!q.answers.some((a) => a.toLowerCase() === 'ramallah')) {
        q.answers.push('Ramallah');
      }
      if (!q.answers.some((a) => a.toLowerCase() === 'al-quds')) {
        q.answers.push('Al-Quds');
      }
    }
  }
}

export function loadAllTriviaLists(basePath: string): Map<string, TriviaList> {
  const lists = new Map<string, TriviaList>();
  const files = readdirSync(basePath).filter((f) => f.endsWith('.txt') && !f.includes(' '));

  for (const file of files) {
    const content = readFileSync(join(basePath, file), 'utf-8');
    const name = file.replace('.txt', '');
    const list = parseTriviaFile(name, content);

    if (list.questions.length > 0) {
      applyPalestineSubstitution(list);
      lists.set(name, list);
    }
  }

  return lists;
}
