import { Command, Declare, Middlewares, Options, SubCommand, createIntegerOption, createStringOption } from 'seyfert';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { profileFromContext } from '../../infra/discord/profile.js';
import { reply, replyFields, buildReplyPayload } from '../shared.js';
import { formatCooldown } from '../../infra/discord/formatting.js';
import {
  attachPaginationCollector,
  buildPaginationComponents,
  resolveRequestedPage
} from '../../infra/discord/pagination.js';

// ─── Data ──────────────────────────────────────────────────────────────────

export interface FeatureRequest {
  id: number;
  discordUserId: string;
  username: string;
  category: string;
  description: string;
  timestamp: number;
  guildId: string | null;
}

const CATEGORY_CHOICES = [
  { name: 'Economy', value: 'economy' },
  { name: 'Games', value: 'games' },
  { name: 'Worship', value: 'worship' },
  { name: 'Trivia', value: 'trivia' },
  { name: 'Community', value: 'community' },
  { name: 'Utility', value: 'utility' },
  { name: 'Other', value: 'other' }
] as const;

const CATEGORY_EMOJIS: Record<string, string> = {
  economy: '💰',
  games: '🎮',
  worship: '🕌',
  trivia: '🧠',
  community: '🤝',
  utility: '⚙️',
  other: '💡'
};

const REQUESTS_PATH = resolve('./data/feature-requests.json');
const ARCHIVE_PATH = resolve('./data/feature-requests-archive.json');
const MAX_ENTRIES = 100;
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const LIST_PAGE_SIZE = 5;

function loadRequests(): FeatureRequest[] {
  try {
    const raw = readFileSync(REQUESTS_PATH, 'utf-8');
    return JSON.parse(raw) as FeatureRequest[];
  } catch {
    return [];
  }
}

function saveRequests(entries: FeatureRequest[]): void {
  mkdirSync(dirname(REQUESTS_PATH), { recursive: true });
  writeFileSync(REQUESTS_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// ─── Submit subcommand ──────────────────────────────────────────────────────

@Declare({
  name: 'submit',
  description: 'Submit a feature request or idea',
  aliases: ['s'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  description: createStringOption({
    description: 'Describe your feature request or idea',
    required: true,
    max_length: 500
  }),
  category: createStringOption({
    description: 'Category for your suggestion',
    required: false,
    choices: [...CATEGORY_CHOICES]
  })
})
class SuggestSubmitSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    const description = String(ctx.options.description ?? '').trim();
    const category = String(ctx.options.category ?? 'other');

    if (!description || description.length < 10) {
      await reply(ctx, 'Please provide a description of at least 10 characters.');
      return;
    }

    if (description.length > 500) {
      await reply(ctx, 'Description must be 500 characters or fewer.');
      return;
    }

    const entries = loadRequests();

    // Per-user cooldown: find most recent entry from this user
    const lastEntry = entries
      .filter((e) => e.discordUserId === profile.discordUserId)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (lastEntry) {
      const elapsed = Date.now() - lastEntry.timestamp;
      if (elapsed < COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        await reply(
          ctx,
          `Cooldown active — you can submit another suggestion in **${formatCooldown(remainingSeconds)}**.`
        );
        return;
      }
    }

    const nextId = entries.length > 0 ? Math.max(...entries.map((e) => e.id)) + 1 : 1;

    const newEntry: FeatureRequest = {
      id: nextId,
      discordUserId: profile.discordUserId,
      username: profile.username ?? 'unknown',
      category,
      description,
      timestamp: Date.now(),
      guildId: ctx.guildId ?? null
    };

    entries.unshift(newEntry);
    if (entries.length > MAX_ENTRIES) {
      entries.length = MAX_ENTRIES;
    }

    saveRequests(entries);

    const emoji = CATEGORY_EMOJIS[category] ?? '💡';
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

    await replyFields(ctx, {
      title: 'Suggestion Submitted',
      tone: 'success',
      fields: [
        { name: 'ID', value: `#${nextId}`, inline: true },
        { name: 'Category', value: `${emoji} ${categoryLabel}`, inline: true },
        { name: 'Description', value: description, inline: false }
      ],
      footer: 'Thank you for your feedback!',
      compact: true
    });
  }
}

// ─── List subcommand ────────────────────────────────────────────────────────

@Declare({
  name: 'list',
  description: 'Browse recent feature suggestions',
  aliases: ['l'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  page: createIntegerOption({
    description: 'Page number',
    required: false,
    min_value: 1
  })
})
class SuggestListSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const entries = loadRequests();

    if (entries.length === 0) {
      await reply(ctx, 'No suggestions yet — be the first with `.suggest <your idea>`!');
      return;
    }

    const totalPages = Math.ceil(entries.length / LIST_PAGE_SIZE);
    let currentPage = Math.min(resolveRequestedPage(ctx, ctx.options.page), totalPages);

    const getPageEntries = (page: number): FeatureRequest[] => {
      const start = (page - 1) * LIST_PAGE_SIZE;
      return entries.slice(start, start + LIST_PAGE_SIZE);
    };

    const buildPayload = (page: number) => {
      const pageEntries = getPageEntries(page);
      const hasPrev = page > 1;
      const hasNext = page < totalPages;

      const fields = pageEntries.map((e) => {
        const emoji = CATEGORY_EMOJIS[e.category] ?? '💡';
        const categoryLabel = e.category.charAt(0).toUpperCase() + e.category.slice(1);
        return {
          name: `#${e.id} — ${emoji} ${categoryLabel} · ${e.username} · ${formatTimestamp(e.timestamp)}`,
          value: e.description,
          inline: false
        };
      });

      return buildReplyPayload({
        fullCommandName: 'suggest list',
        requesterName: ctx.author?.username ?? 'user',
        content: '',
        options: {
          title: 'Feature Suggestions',
          fields,
          footer: `Page ${page} of ${totalPages} · ${entries.length} total`,
          compact: true,
          components: hasPrev || hasNext ? buildPaginationComponents(hasPrev, hasNext) : undefined
        }
      });
    };

    const hasPagination = totalPages > 1;
    const response = await ctx.editOrReply(buildPayload(currentPage), hasPagination ? true : undefined);

    if (!hasPagination || !response) return;

    attachPaginationCollector({
      ctx,
      responseMessage: response,
      ownerUserId: ctx.author.id,
      getCurrentPage: () => currentPage,
      onPageRequested: async (requestedPage, interaction) => {
        if (requestedPage < 1 || requestedPage > totalPages) {
          await interaction.deferUpdate();
          return;
        }
        currentPage = requestedPage;
        await interaction.update(buildPayload(currentPage));
      }
    });
  }
}

// ─── Done subcommand (admin) ────────────────────────────────────────────────

interface ArchivedFeatureRequest extends FeatureRequest {
  resolvedAt: number;
  resolvedBy: string;
}

function loadArchive(): ArchivedFeatureRequest[] {
  try {
    return JSON.parse(readFileSync(ARCHIVE_PATH, 'utf-8')) as ArchivedFeatureRequest[];
  } catch {
    return [];
  }
}

@Declare({
  name: 'done',
  description: 'Mark a suggestion as implemented and archive it (admin)',
  aliases: ['resolve'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  id: createIntegerOption({
    description: 'Suggestion ID to mark done',
    required: true,
    min_value: 1
  })
})
@Middlewares(['permissionPolicy'])
class SuggestDoneSubCommand extends SubCommand {
  override async run(ctx: any): Promise<void> {
    const id = Number(ctx.options.id);
    const entries = loadRequests();
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      await reply(ctx, `No open suggestion with ID #${id}.`);
      return;
    }

    const archive = loadArchive();
    archive.unshift({
      ...entry,
      resolvedAt: Date.now(),
      resolvedBy: ctx.author?.id ?? 'unknown'
    });
    mkdirSync(dirname(ARCHIVE_PATH), { recursive: true });
    writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2), 'utf-8');
    saveRequests(entries.filter((e) => e.id !== id));

    await replyFields(ctx, {
      title: 'Suggestion Implemented',
      tone: 'success',
      fields: [
        { name: 'ID', value: `#${entry.id}`, inline: true },
        { name: 'By', value: entry.username, inline: true },
        { name: 'Description', value: entry.description, inline: false }
      ],
      footer: 'Archived to feature-requests-archive.json',
      compact: true
    });
  }
}

// ─── Parent command ─────────────────────────────────────────────────────────

@Declare({
  name: 'suggest',
  description: 'Submit or browse feature suggestions',
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options([SuggestSubmitSubCommand, SuggestListSubCommand, SuggestDoneSubCommand])
export default class SuggestCommand extends Command {}
