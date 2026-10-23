/**
 * Pure helpers for reaction roles: emoji identity, message references and
 * parsing an existing "Name emoji" role panel. No Discord client access here
 * so everything is unit-testable.
 */

const CUSTOM_EMOJI_RE = /^<(a?):([A-Za-z0-9_~]+):(\d{1,25})>$/;

/** Matches one emoji (custom tag or a unicode emoji cluster) anywhere in text. */
const EMOJI_SCAN_RE =
  /<a?:[A-Za-z0-9_~]+:\d{1,25}>|(?:\p{Regional_Indicator}{2}|[0-9#*]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/u;

export interface EmojiIdentity {
  key: string;
  display: string;
  /** What to hand to the Discord REST layer when reacting. */
  resolvable: string | { id: string; name: string; animated?: boolean };
}

/** Strip variation selectors so 📈 and 📈️ collapse to one key. */
export function normalizeUnicodeEmoji(value: string): string {
  return value.replace(/️/g, '').trim();
}

/** Identity for an emoji as delivered in a gateway reaction payload. */
export function emojiKeyFromReaction(emoji: { id?: string | null; name?: string | null }): string | null {
  if (emoji.id) return `c:${emoji.id}`;
  if (emoji.name) return `u:${normalizeUnicodeEmoji(emoji.name)}`;
  return null;
}

/** Parse a user-supplied emoji: a custom `<:name:id>` tag or a unicode emoji. */
export function parseEmojiInput(raw: unknown): EmojiIdentity | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;

  const custom = CUSTOM_EMOJI_RE.exec(value);
  if (custom) {
    const [, animatedFlag, name, id] = custom;
    return {
      key: `c:${id}`,
      display: value,
      resolvable: { id: id!, name: name!, animated: animatedFlag === 'a' }
    };
  }

  const match = EMOJI_SCAN_RE.exec(value);
  if (!match || match.index !== 0 || match[0].length !== value.length) return null;
  const normalized = normalizeUnicodeEmoji(value);
  return { key: `u:${normalized}`, display: value, resolvable: value };
}

/** Rebuild the REST-resolvable form from a stored binding. */
export function resolvableFromBinding(binding: { emojiKey: string; emojiDisplay: string }): EmojiIdentity['resolvable'] {
  if (binding.emojiKey.startsWith('c:')) {
    const custom = CUSTOM_EMOJI_RE.exec(binding.emojiDisplay);
    return {
      id: binding.emojiKey.slice(2),
      name: custom?.[2] ?? 'emoji',
      animated: custom?.[1] === 'a'
    };
  }
  return binding.emojiDisplay;
}

export interface MessageRef {
  guildId: string | null;
  channelId: string | null;
  messageId: string;
}

const MESSAGE_LINK_RE = /discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)\/(\d+)/i;

/** Accepts a full message link or a bare message id. */
export function parseMessageRef(raw: unknown): MessageRef | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  const link = MESSAGE_LINK_RE.exec(value);
  if (link) {
    return {
      guildId: link[1] === '@me' ? null : link[1]!,
      channelId: link[2]!,
      messageId: link[3]!
    };
  }
  if (/^\d{1,25}$/.test(value)) {
    return { guildId: null, channelId: null, messageId: value };
  }
  return null;
}

export interface PanelLine {
  roleName: string;
  emoji: EmojiIdentity;
}

/**
 * Parse a legacy role panel such as:
 *   Computer-Programming 💻
 *   📚 Study-Break (This will mute you)
 *   🔢 - Math
 * Lines without exactly one recognisable emoji are skipped.
 */
export function parsePanelLines(content: string): PanelLine[] {
  const out: PanelLine[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = EMOJI_SCAN_RE.exec(line);
    if (!match) continue;
    const emoji = parseEmojiInput(match[0]);
    if (!emoji) continue;

    const before = line.slice(0, match.index).trim();
    const after = line.slice(match.index + match[0].length).trim();
    let name = before.length > 0 ? before : after;
    // Drop trailing/leading separators and any parenthetical explanation.
    name = name
      .replace(/\([^)]*\)/g, '')
      .replace(/^[\s\-–—:•|]+|[\s\-–—:•|]+$/g, '')
      .trim();
    if (before.length === 0) {
      // Emoji-first lines: stop at a separator so "📚 Study-Break - mutes you" → "Study-Break"
      name = name.split(/\s+[-–—|:]\s+/)[0]!.trim();
    }
    if (!name) continue;
    out.push({ roleName: name, emoji });
  }
  return out;
}

/** Loose role-name comparison: case-insensitive, ignores spaces/dashes/underscores. */
export function roleNameKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_]+/g, '');
}
