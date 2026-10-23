export interface RawDiscordUserLike {
  id?: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
  flags?: number | null;
  public_flags?: number | null;
}

const SPAMMER_FLAG = 1 << 20;

function looksLikeDeletedUsername(username: string): boolean {
  const value = username.trim();
  if (!value) {
    return false;
  }

  return (
    /^deleted[_ ]user[_ -][a-z0-9]+$/i.test(value) ||
    /^deleted[_ -]user$/i.test(value) ||
    /^deleted user [a-z0-9]+$/i.test(value)
  );
}

export function isDeletedDiscordAccount(user: RawDiscordUserLike | null | undefined): boolean {
  if (!user?.id) {
    return true;
  }

  const username = user.username?.trim();
  if (!username) {
    return true;
  }

  const flags = user.public_flags ?? user.flags ?? 0;

  // Deleted accounts tend to lose profile decoration and are renamed by Discord.
  if (looksLikeDeletedUsername(username) && !user.avatar && !user.global_name) {
    return true;
  }

  // Inference: spammer-flagged accounts with stripped profile fields are commonly
  // disabled/pending-deletion accounts that do not resolve cleanly in mentions.
  return (flags & SPAMMER_FLAG) === SPAMMER_FLAG && !user.avatar && !user.global_name;
}

export function isUnknownDiscordEntityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes('[404 Not Found]') ||
    message.includes('Unknown User') ||
    message.includes('Unknown Member')
  );
}
