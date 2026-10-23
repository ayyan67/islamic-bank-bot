import { Command, Declare } from 'seyfert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { replyFields } from '../shared.js';
import type { ReplyField } from '../shared.js';

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

function loadChangelog(): ChangelogEntry[] {
  try {
    const raw = readFileSync(resolve('./assets/changelog.json'), 'utf-8');
    return JSON.parse(raw) as ChangelogEntry[];
  } catch {
    return [];
  }
}

@Declare({
  name: 'changelog',
  description: 'View the latest bot update patch notes',
  aliases: ['cl', 'updates', 'patchnotes'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
export default class ChangelogCommand extends Command {
  override async run(ctx: any): Promise<void> {
    const entries = loadChangelog();

    if (entries.length === 0) {
      await ctx.editOrReply({ content: 'No changelog entries found.' });
      return;
    }

    // Show the 3 most recent entries
    const recent = entries.slice(0, 3);
    const fields: ReplyField[] = recent.map((entry) => ({
      name: `v${entry.version} — ${entry.title} *(${entry.date})*`,
      value: entry.changes.map((c) => `• ${c}`).join('\n'),
      inline: false
    }));

    await replyFields(ctx, {
      title: 'Patch Notes',
      tone: 'info',
      fields,
      compact: true
    });
  }
}
