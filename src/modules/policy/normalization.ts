export function normalizeCommandName(raw: string): string {
  return raw.trim().replace(/^[^a-z0-9]+/i, '').toLowerCase();
}

export function normalizeSubcommandName(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const normalized = raw
    .trim()
    .replace(/^[^a-z0-9]+/i, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

  return normalized.length > 0 ? normalized : null;
}

export function parseCommandPath(fullCommandName: string): { command: string; subcommand: string | null } {
  const tokens = fullCommandName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (tokens.length === 0) {
    return { command: '', subcommand: null };
  }

  const rawCommand = tokens[0] ?? '';
  const rest = tokens.slice(1);
  const command = normalizeCommandName(rawCommand);
  return {
    command,
    subcommand: rest.length > 0 ? normalizeSubcommandName(rest.join(' ')) : null
  };
}
