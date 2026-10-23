import { CommandContext } from 'seyfert';

export type ReplyTone = 'info' | 'success' | 'warning' | 'error';

export interface ReplyField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface ReplyOptions {
  title?: string;
  tone?: ReplyTone;
  footer?: string;
  fields?: ReplyField[];
  compact?: boolean;
  components?: any[];
  withResponse?: boolean;
  /** Send as ephemeral (only visible to user). Auto-enabled for error/warning tones on slash commands. */
  ephemeral?: boolean;
  /** Small image shown top-right of the embed (e.g. a user avatar URL). */
  thumbnail?: string;
}

const EMBED_COLOR: Record<ReplyTone, number> = {
  info: 0x0f9d58,
  success: 0x16a34a,
  warning: 0xf59e0b,
  error: 0xef4444
};

const EMBED_ICON: Record<ReplyTone, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌'
};

interface CommandTheme {
  icon: string;
  label: string;
  color: number;
}

const DEFAULT_THEME: CommandTheme = {
  icon: '🕌',
  label: 'General',
  color: 0x1f8b4c
};

const COMMAND_THEMES: Record<string, CommandTheme> = {
  balance: { icon: '💰', label: 'Economy', color: 0x16a34a },
  transfer: { icon: '💸', label: 'Economy', color: 0x16a34a },
  leaderboard: { icon: '🏆', label: 'Economy', color: 0xc084fc },
  vault: { icon: '🏦', label: 'Vault', color: 0x0891b2 },
  prayer: { icon: '🕋', label: 'Worship', color: 0x047857 },
  claim: { icon: '🎁', label: 'Rewards', color: 0x059669 },
  community: { icon: '🤝', label: 'Community', color: 0x0ea5a4 },
  ledger: { icon: '📒', label: 'Ledger', color: 0x2563eb },
  admin: { icon: '🛡️', label: 'Administration', color: 0xdc2626 },
  policy: { icon: '📜', label: 'Policy', color: 0x4b5563 },
  shop: { icon: '🛍️', label: 'Shop', color: 0x0f766e },
  bounty: { icon: '🎯', label: 'Bounties', color: 0x0ea5e9 },
  club: { icon: '🏛️', label: 'Clubs', color: 0x7c3aed },
  status: { icon: '📊', label: 'Economy', color: 0x16a34a },
  digest: { icon: '📰', label: 'Community', color: 0x0d9488 },
  remind: { icon: '⏰', label: 'Reminders', color: 0x0ea5e9 },
  hangman: { icon: '🎮', label: 'Games', color: 0xf97316 },
  connect4: { icon: '🎮', label: 'Games', color: 0xf97316 },
  race: { icon: '🏁', label: 'Games', color: 0xf97316 },
  joinrace: { icon: '🏁', label: 'Games', color: 0xf97316 },
  games: { icon: '🎮', label: 'Games', color: 0xf97316 },
  changelog: { icon: '📝', label: 'Updates', color: 0x0ea5e9 },
  clear: { icon: '🧹', label: 'Utility', color: 0x4b5563 },
  drop: { icon: '💰', label: 'Drops', color: 0xeab308 },
  pick: { icon: '💰', label: 'Drops', color: 0xeab308 },
  trivia: { icon: '🧠', label: 'Trivia', color: 0xf59e0b },
  help: { icon: '❓', label: 'Help', color: 0x0ea5e9 },
  notify: { icon: '🔔', label: 'Notifications', color: 0x0ea5e9 },
  dailychallenge: { icon: '🕌', label: 'Challenges', color: 0x047857 },
  suggest: { icon: '💡', label: 'Suggest', color: 0x8b5cf6 }
};

function inferTone(content: string): ReplyTone {
  const normalized = content.toLowerCase();

  if (
    normalized.includes('failed') ||
    normalized.includes('unable') ||
    normalized.includes('not found') ||
    normalized.includes('do not have permission') ||
    normalized.includes('insufficient')
  ) {
    return 'error';
  }

  if (
    normalized.includes('cooldown') ||
    normalized.includes('blocked') ||
    normalized.includes('already') ||
    normalized.includes('no ')
  ) {
    return 'warning';
  }

  if (
    normalized.includes('claimed') ||
    normalized.includes('awarded') ||
    normalized.includes('transferred') ||
    normalized.includes('deposited') ||
    normalized.includes('withdrew') ||
    normalized.includes('added') ||
    normalized.includes('updated') ||
    normalized.includes('purchased')
  ) {
    return 'success';
  }

  return 'info';
}

function trimToLimit(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function commandTitle(fullCommandName: string): string {
  if (!fullCommandName) {
    return 'Islamic Bank';
  }

  const pretty = fullCommandName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

  return pretty.length > 0 ? pretty : 'Islamic Bank';
}

function rootCommand(fullCommandName: string): string {
  const first = fullCommandName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length > 0)[0];

  return first ?? '';
}

function resolveTheme(fullCommandName: string): CommandTheme {
  const root = rootCommand(fullCommandName);
  return COMMAND_THEMES[root] ?? DEFAULT_THEME;
}

interface BuildReplyPayloadInput {
  fullCommandName: string;
  requesterName?: string;
  content: string;
  options?: ReplyOptions;
}

export function buildReplyPayload(input: BuildReplyPayloadInput): { embeds: any[]; components?: any[] } {
  const fullCommandName = input.fullCommandName;
  const tone = input.options?.tone ?? inferTone(input.content);
  const title = input.options?.title ?? commandTitle(fullCommandName);
  const theme = resolveTheme(fullCommandName);
  const fields =
    input.options?.fields
      ?.slice(0, 25)
      .map((field) => ({
        name: trimToLimit(field.name, 256),
        value: trimToLimit(field.value, 1024),
        inline: field.inline ?? false
      })) ?? [];

  const hasContent = input.content.trim().length > 0;
  const description = hasContent ? trimToLimit(input.content, 4000) : undefined;
  const color = tone === 'info' ? theme.color : EMBED_COLOR[tone];
  const prefixedTitle = input.options?.compact ? `${theme.icon} ${title}` : `${EMBED_ICON[tone]} ${title}`;
  const payload: { embeds: any[]; components?: any[] } = {
    embeds: [
      {
        title: trimToLimit(prefixedTitle, 256),
        description,
        color,
        author: {
          name: `Islamic Bank • ${theme.label}`
        },
        fields,
        thumbnail: input.options?.thumbnail ? { url: input.options.thumbnail } : undefined,
        footer: {
          text: trimToLimit(input.options?.footer ?? `Requested by ${input.requesterName ?? 'user'}`, 2048)
        },
        timestamp: new Date().toISOString()
      }
    ]
  };

  if (input.options?.components && input.options.components.length > 0) {
    payload.components = input.options.components;
  }

  return payload;
}

export async function reply(ctx: CommandContext, content: string, options?: ReplyOptions): Promise<any> {
  const payload = buildReplyPayload({
    fullCommandName: (ctx as any).fullCommandName ?? '',
    requesterName: ctx.author.username ?? 'user',
    content,
    options
  });

  return ctx.editOrReply(payload, options?.withResponse ? true : undefined);
}

/**
 * Like reply(), but for prefix invocations the embed is posted as a standalone
 * channel message with no reply reference. Use this when the invoking message is
 * about to be deleted, so the embed does not render an "Original message was
 * deleted" header. Slash invocations fall through to a normal reply.
 */
export async function replyDetached(ctx: CommandContext, content: string, options?: ReplyOptions): Promise<any> {
  const anyCtx = ctx as any;
  const payload = buildReplyPayload({
    fullCommandName: anyCtx.fullCommandName ?? '',
    requesterName: ctx.author?.username ?? 'user',
    content,
    options
  });

  const channelId = anyCtx.channelId;
  const canWrite = Boolean(anyCtx.message) && typeof channelId === 'string' && typeof anyCtx.client?.messages?.write === 'function';
  if (!canWrite) {
    return ctx.editOrReply(payload);
  }
  return anyCtx.client.messages.write(channelId, payload);
}

/**
 * Delete the message that triggered a prefix command. No-op for slash commands.
 * Failures (missing Manage Messages, already deleted) are swallowed.
 * Returns true only when a delete request succeeded.
 */
export async function deleteInvokingMessage(ctx: CommandContext): Promise<boolean> {
  const anyCtx = ctx as any;
  const messageId = anyCtx.message?.id;
  const channelId = anyCtx.channelId;
  if (typeof messageId !== 'string' || typeof channelId !== 'string') return false;
  if (typeof anyCtx.client?.messages?.delete !== 'function') return false;
  try {
    await anyCtx.client.messages.delete(channelId, messageId, 'drop command cleanup');
    return true;
  } catch {
    return false;
  }
}

interface ReplyListOptions {
  title: string;
  lines: string[];
  tone?: ReplyTone;
  footer?: string;
  compact?: boolean;
  components?: any[];
  withResponse?: boolean;
}

export async function replyList(ctx: CommandContext, options: ReplyListOptions): Promise<any> {
  const lines = options.lines.length > 0 ? options.lines : ['No entries found.'];
  return reply(ctx, lines.join('\n'), {
    title: options.title,
    tone: options.tone ?? 'info',
    footer: options.footer,
    compact: options.compact,
    components: options.components,
    withResponse: options.withResponse
  });
}

interface ReplyFieldsOptions {
  title: string;
  fields: ReplyField[];
  tone?: ReplyTone;
  footer?: string;
  description?: string;
  compact?: boolean;
  components?: any[];
  withResponse?: boolean;
  thumbnail?: string;
}

export async function replyFields(ctx: CommandContext, options: ReplyFieldsOptions): Promise<any> {
  return reply(ctx, options.description ?? '', {
    title: options.title,
    fields: options.fields,
    tone: options.tone ?? 'info',
    footer: options.footer,
    compact: options.compact,
    components: options.components,
    withResponse: options.withResponse,
    thumbnail: options.thumbnail
  });
}

/**
 * Send an ephemeral follow-up message (only visible to the command user).
 * Falls back to a normal reply for prefix commands where ephemeral is not supported.
 */
export async function replyEphemeral(ctx: CommandContext, content: string, options?: ReplyOptions): Promise<any> {
  const payload = buildReplyPayload({
    fullCommandName: (ctx as any).fullCommandName ?? '',
    requesterName: ctx.author.username ?? 'user',
    content,
    options
  });

  // Slash commands support ephemeral follow-ups via interaction.write
  const interaction = (ctx as any).interaction;
  if (interaction && typeof interaction.write === 'function') {
    return interaction.write({ ...payload, flags: 64 });
  }

  // Prefix commands cannot be ephemeral — fall back to normal reply
  return ctx.editOrReply(payload);
}

export function mention(discordUserId: string): string {
  return `<@${discordUserId}>`;
}

/** Best-effort avatar URL for a Seyfert user object or stored avatar hash. */
export function avatarUrl(user: any): string | undefined {
  if (typeof user?.avatarURL === 'function') {
    try {
      const url = user.avatarURL();
      if (typeof url === 'string' && url.length > 0) return url;
    } catch {
      // fall through
    }
  }
  const id = user?.id ?? user?.discordUserId;
  const hash = user?.avatar ?? user?.avatarId;
  if (typeof id === 'string' && typeof hash === 'string' && hash.length > 0) {
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`;
  }
  return undefined;
}

/**
 * Parse a user-supplied amount. Accepts plain integers, "all", and
 * k/m suffixes (500k = 500,000; 1.5m = 1,500,000). Commas are ignored.
 */
export function parseAmount(raw: unknown): number | 'all' | null {
  const str = String(raw ?? '').trim().toLowerCase().replace(/,/g, '');
  if (str === 'all') return 'all';
  const match = str.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!match) return null;
  const multiplier = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
  const num = Math.round(Number(match[1]) * multiplier);
  return Number.isSafeInteger(num) && num >= 1 ? num : null;
}

/** Matches a trailing amount token in raw prefix-command content. */
export const TRAILING_AMOUNT_RE = /\b(\d[\d,]*(?:\.\d+)?[km]?|all)\s*$/i;
