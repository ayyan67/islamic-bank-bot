import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface HangmanWordList {
  name: string;
  words: string[];
}

export function parseHangmanFile(name: string, content: string): HangmanWordList {
  const words: string[] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    words.push(line.toUpperCase());
  }
  return { name, words };
}

export function loadAllHangmanLists(basePath: string): Map<string, HangmanWordList> {
  const lists = new Map<string, HangmanWordList>();
  const files = readdirSync(basePath).filter((f) => f.endsWith('.txt'));

  for (const file of files) {
    const content = readFileSync(join(basePath, file), 'utf-8');
    const name = file.replace('.txt', '');
    const list = parseHangmanFile(name, content);
    if (list.words.length > 0) {
      lists.set(name, list);
    }
  }

  return lists;
}
