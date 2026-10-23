import { CommandContext } from 'seyfert';
import { UserProfileInput } from '../db/types.js';

type UnknownRecord = Record<string, unknown>;

/** Extract a Discord user ID from a raw mention string like `<@123>` or `<@!123>`. */
export function parseMentionId(raw: string): string | null {
  const match = raw.trim().match(/^<@!?(\d+)>$/);
  return match?.[1] ?? null;
}

function pickUser(candidate: unknown): UnknownRecord | undefined {
  if (!candidate || typeof candidate !== 'object') {
    // Handle raw mention strings from prefix commands: "<@123456>" or "<@!123456>"
    if (typeof candidate === 'string') {
      const id = parseMentionId(candidate.trim().split(/\s+/)[0] ?? '');
      if (id) return { id };
    }
    return undefined;
  }

  const base = candidate as UnknownRecord;
  if (typeof base.id === 'string') {
    return base;
  }

  const nested = base.user;
  if (nested && typeof nested === 'object' && typeof (nested as UnknownRecord).id === 'string') {
    return nested as UnknownRecord;
  }

  return undefined;
}

export function profileFromContext(ctx: CommandContext): UserProfileInput {
  return profileFromUnknown(ctx.author)!;
}

export function profileFromUnknown(value: unknown): UserProfileInput | null {
  const user = pickUser(value);
  if (!user) {
    return null;
  }

  const avatar = user.avatar;
  const avatarId = typeof avatar === 'string' ? avatar : null;

  return {
    discordUserId: user.id as string,
    username: typeof user.username === 'string' ? user.username : null,
    discriminator: typeof user.discriminator === 'string' ? user.discriminator : null,
    avatarId
  };
}
