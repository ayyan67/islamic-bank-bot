import { Command, Declare, Options, createStringOption } from 'seyfert';
import { env } from '../../config/env.js';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy.js';
import { PREFIX_ALIASES } from '../../infra/discord/prefixAliases.js';
import { replyFields } from '../shared.js';
import { HELP_SECTIONS, HELP_TOPICS, type HelpTopic } from './catalog.js';

const MAX_PREFIX_ALIAS_HINTS = 8;

function normalizeTopicInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[/.]+/, '')
    .replace(/\s+/g, ' ');
}

function topicKeys(topic: HelpTopic): string[] {
  const keys = [topic.id, topic.title, ...(topic.aliases ?? [])];
  const normalized = keys.map((key) => normalizeTopicInput(key)).filter((key) => key.length > 0);
  const root = normalizeTopicInput(topic.id).split(' ')[0];
  if (root && !normalized.includes(root)) {
    normalized.push(root);
  }

  return [...new Set(normalized)];
}

const TOPIC_LOOKUP = new Map<string, HelpTopic>();
for (const topic of HELP_TOPICS) {
  for (const key of topicKeys(topic)) {
    if (!TOPIC_LOOKUP.has(key)) {
      TOPIC_LOOKUP.set(key, topic);
    }
  }
}

function parsePrefixTopicRemainder(ctx: any): string | null {
  const rawContent = typeof ctx.message?.content === 'string' ? ctx.message.content : null;
  if (!rawContent || !rawContent.startsWith(env.DEFAULT_PREFIX)) {
    return null;
  }

  const afterPrefix = rawContent.slice(env.DEFAULT_PREFIX.length).trim();
  if (afterPrefix.length === 0) {
    return null;
  }

  const firstSpaceIndex = afterPrefix.indexOf(' ');
  if (firstSpaceIndex < 0) {
    return null;
  }

  const remainder = afterPrefix.slice(firstSpaceIndex + 1).trim();
  if (remainder.length === 0) {
    return null;
  }

  const lowered = remainder.toLowerCase();
  if (lowered.startsWith('-topic ')) {
    const value = remainder.slice(7).trim();
    return value.length > 0 ? value : null;
  }

  if (lowered.startsWith('--topic ')) {
    const value = remainder.slice(8).trim();
    return value.length > 0 ? value : null;
  }

  const topicPrefix = remainder.match(/^topic[:=]\s*(.+)$/i);
  if (topicPrefix?.[1]) {
    return topicPrefix[1].trim();
  }

  return remainder;
}

function resolveTopicQuery(ctx: any): string | null {
  const explicit = typeof ctx.options?.topic === 'string' ? ctx.options.topic.trim() : '';
  if (explicit.length > 0) {
    return explicit;
  }

  return parsePrefixTopicRemainder(ctx);
}

function findTopicByLookup(query: string): HelpTopic | null {
  const exact = TOPIC_LOOKUP.get(query);
  if (exact) {
    return exact;
  }

  const parts = query.split(' ').filter((part) => part.length > 0);
  if (parts.length >= 2) {
    const twoPart = `${parts[0]} ${parts[1]}`;
    const twoPartMatch = TOPIC_LOOKUP.get(twoPart);
    if (twoPartMatch) {
      return twoPartMatch;
    }
  }

  const root = parts[0] ?? '';
  if (root.length > 0) {
    const rootMatch = TOPIC_LOOKUP.get(root);
    if (rootMatch) {
      return rootMatch;
    }
  }

  return null;
}

function resolvePrefixAliasTarget(rawQuery: string): string | null {
  const query = normalizeTopicInput(rawQuery);
  if (!query) {
    return null;
  }

  const aliasTarget = PREFIX_ALIASES[query];
  if (!aliasTarget) {
    return null;
  }

  return aliasCommandPath(aliasTarget);
}

function findHelpTopic(rawQuery: string): HelpTopic | null {
  const query = normalizeTopicInput(rawQuery);
  if (!query) {
    return null;
  }

  const lookupMatch = findTopicByLookup(query);
  if (lookupMatch) {
    return lookupMatch;
  }

  const aliasTarget = resolvePrefixAliasTarget(query);
  if (aliasTarget) {
    const aliasMatch = findTopicByLookup(aliasTarget);
    if (aliasMatch) {
      return aliasMatch;
    }
  }

  for (const topic of HELP_TOPICS) {
    const keys = topicKeys(topic);
    if (keys.some((key) => key.includes(query) || query.includes(key))) {
      return topic;
    }
  }

  return null;
}

function topicSuggestions(rawQuery: string): string[] {
  const query = normalizeTopicInput(rawQuery);
  const matches = new Set(
    HELP_TOPICS
      .filter((topic) => topicKeys(topic).some((key) => key.includes(query)))
      .slice(0, 5)
      .map((topic) => `/${topic.id}`)
  );

  const aliasTarget = resolvePrefixAliasTarget(query);
  if (aliasTarget) {
    const aliasTopic = findTopicByLookup(aliasTarget);
    if (aliasTopic) {
      matches.add(`/${aliasTopic.id}`);
    }
  }

  if (matches.size > 0) {
    return [...matches].slice(0, 5);
  }

  return HELP_TOPICS.slice(0, 5).map((topic) => `/${topic.id}`);
}

function aliasCommandPath(aliasTarget: string): string {
  const tokens = aliasTarget
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const pathTokens: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('-')) {
      break;
    }

    pathTokens.push(token);
  }

  return pathTokens.join(' ');
}

function collectPrefixAliasHints(topic: HelpTopic): string[] {
  if (!env.ENABLE_PREFIX_ALIASES) {
    return [];
  }

  const keys = topicKeys(topic);
  const hints = Object.entries(PREFIX_ALIASES)
    .filter(([, target]) => {
      const aliasPath = aliasCommandPath(target);
      if (!aliasPath) {
        return false;
      }

      return keys.some((key) => aliasPath === key || aliasPath.startsWith(`${key} `) || key.startsWith(`${aliasPath} `));
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_PREFIX_ALIAS_HINTS)
    .map(([alias, target]) => `${env.DEFAULT_PREFIX}${alias} -> ${env.DEFAULT_PREFIX}${target}`);

  return hints;
}

async function sendOverview(ctx: any): Promise<void> {
  const fields = HELP_SECTIONS.map((section) => ({
    name: section.name,
    value: section.lines.join('\n'),
    inline: false
  }));

  const description = env.ENABLE_PREFIX_ALIASES
    ? `Use \`/help topic:<command>\` for details.\nPrefix examples: \`${env.DEFAULT_PREFIX}help transfer\` or \`${env.DEFAULT_PREFIX}help -topic transfer\`.`
    : 'Use `/help topic:<command>` for detailed usage of any command.';

  await replyFields(ctx, {
    title: 'Help Center',
    description,
    fields,
    compact: true
  });
}

async function sendTopic(ctx: any, topic: HelpTopic): Promise<void> {
  const fields = [
    {
      name: 'Summary',
      value: topic.summary,
      inline: false
    },
    {
      name: 'Usage',
      value: topic.usage.map((entry) => `\`${entry}\``).join('\n'),
      inline: false
    },
    {
      name: 'Examples',
      value: topic.examples.map((entry) => `\`${entry}\``).join('\n'),
      inline: false
    },
    {
      name: 'Permissions',
      value: topic.permissions,
      inline: false
    }
  ];

  if (topic.aliases && topic.aliases.length > 0) {
    fields.push({
      name: 'Lookup Keywords',
      value: topic.aliases.map((entry) => `\`${entry}\``).join('  '),
      inline: false
    });
  }

  const prefixAliases = collectPrefixAliasHints(topic);
  if (prefixAliases.length > 0) {
    fields.push({
      name: 'Prefix Aliases',
      value: prefixAliases.map((entry) => `\`${entry}\``).join('\n'),
      inline: false
    });
  }

  if (topic.notes) {
    fields.push({
      name: 'Notes',
      value: topic.notes,
      inline: false
    });
  }

  await replyFields(ctx, {
    title: `Help: ${topic.title}`,
    description: `Topic path: \`/${topic.id}\``,
    fields,
    compact: true
  });
}

@Declare({
  name: 'help',
  description: 'Show command help and usage',
  aliases: ['h', 'commands', 'cmds', 'manual'],
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]
})
@Options({
  topic: createStringOption({
    description: 'Optional command or module (example: transfer, shop admin)',
    required: false,
    max_length: 120
  })
})
export default class HelpCommand extends Command {
  override async run(ctx: any): Promise<void> {
    const query = resolveTopicQuery(ctx);
    if (!query) {
      await sendOverview(ctx);
      return;
    }

    const topic = findHelpTopic(query);
    if (!topic) {
      const suggestions = topicSuggestions(query);
      await replyFields(ctx, {
        title: 'Help Topic Not Found',
        tone: 'warning',
        description: `No help topic matched \`${query}\`.`,
        fields: [
          {
            name: 'Try One Of These',
            value: suggestions.map((entry) => `\`${entry}\``).join('\n'),
            inline: false
          }
        ],
        compact: true
      });
      return;
    }

    await sendTopic(ctx, topic);
  }
}
