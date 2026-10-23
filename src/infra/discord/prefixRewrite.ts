import { PREFIX_ALIASES } from './prefixAliases.js';

/**
 * Bare parent commands expand to a sensible default subcommand so `.ledger`
 * or `.prayer` never dead-end with a "specify a subcommand" error.
 * Validated against the command manifest by scripts/check-aliases.ts.
 */
export const DEFAULT_SUBCOMMANDS: Record<string, string> = {
  bounty: 'bounty list',
  claim: 'claim timely',
  digest: 'digest now',
  leaderboard: 'leaderboard wealth',
  ledger: 'ledger recent',
  prayer: 'prayer status',
  roles: 'roles list',
  shop: 'shop list'
};

/**
 * Ordered option names for commands whose prefix form accepts positional
 * args. The rewriter converts bare tokens into the `-flag value` format
 * Seyfert's prefix parser requires. Mentions bind to the `user` option
 * regardless of position; the first standalone number binds to `amount`;
 * an explicit trailing flag the user typed (e.g. `-note ...`) is preserved.
 * Validated against the command manifest by scripts/check-aliases.ts.
 */
export const POSITIONAL_SPECS: Record<string, readonly string[]> = {
  'admin award': ['user', 'amount'],
  'admin take': ['user', 'amount'],
  'admin set-balance': ['user', 'amount'],
  'bounty post': ['amount', 'title'],
  'bounty take': ['id'],
  'bounty pay': ['id'],
  'bounty cancel': ['id'],
  'bounty view': ['id']
};

const ADMIN_ECON_SHORTCUT_MAP: Record<string, string> = {
  award: 'admin award',
  take: 'admin take',
  setbal: 'admin set-balance',
  setbalance: 'admin set-balance'
};
const ADMIN_ECON_SUBCOMMANDS = new Set(['award', 'take', 'set-balance']);

export function injectPositionalFlags(positionalRest: string, spec: readonly string[]): string {
  if (!positionalRest) return '';
  // Already has proper flags — leave untouched
  if (spec.every((flag) => positionalRest.includes(`-${flag} `))) {
    return ' ' + positionalRest;
  }

  let flags = '';
  let remaining = positionalRest;

  // Preserve any explicit trailing flag the user typed (e.g. -note weekly bonus)
  let explicitTail = '';
  const tailMatch = remaining.match(/(?:^|\s)(-[a-z][\w-]*\s+.*)$/s);
  if (tailMatch?.[1]) {
    explicitTail = ' ' + tailMatch[1].trim();
    remaining = remaining.slice(0, remaining.length - tailMatch[1].length).trim();
  }

  for (const flag of spec) {
    if (flag === 'user') {
      // Pull the mention out first so its numeric ID doesn't match the amount regex
      const mention = remaining.match(/<@!?\d+>/)?.[0];
      if (mention) {
        flags += ` -user ${mention}`;
        remaining = remaining.replace(/<@!?\d+>/, '').trim();
      }
    } else if (flag === 'amount') {
      const amount = remaining.match(/(?:^|\s)(\d[\d,]*(?:\.\d+)?[km]?|all)(?=\s|$)/i)?.[1];
      if (amount) {
        flags += ` -amount ${amount}`;
        remaining = remaining.replace(amount, '').trim();
      }
    } else {
      // Generic option: next unconsumed token; the final spec entry
      // consumes everything that remains (free-text options).
      const isLast = flag === spec[spec.length - 1];
      const value = isLast ? remaining : (remaining.split(/\s+/)[0] ?? '');
      if (value) {
        flags += ` -${flag} ${value}`;
        remaining = remaining.slice(value.length).trim();
      }
    }
  }

  return flags + explicitTail;
}

/**
 * Rewrite raw prefix-command content into the canonical, flag-formatted form
 * Seyfert can parse. Pure function — the client monkey-patch is a thin shim
 * around this so behavior is unit-testable.
 */
export function rewritePrefixContent(content: string, prefix: string): string {
  if (!content.startsWith(prefix)) return content;

  const afterPrefix = content.slice(prefix.length).trimStart();
  const words = afterPrefix.split(/\s+/);
  const w0 = words[0] ?? '';
  const w1 = words[1] ?? '';
  const oneWord = w0.toLowerCase();
  const twoWord = words.length >= 2 ? `${oneWord} ${w1.toLowerCase()}` : '';

  // Admin economy shortcuts: ".award @user 500" → ".admin award -user <@id> -amount 500"
  const adminShortcut = ADMIN_ECON_SHORTCUT_MAP[oneWord];
  if (adminShortcut) {
    const subCmd = adminShortcut;
    const rest = afterPrefix.slice(w0.length).trim();
    return prefix + subCmd + injectPositionalFlags(rest, POSITIONAL_SPECS[subCmd] ?? []);
  }

  // Admin economy full form (.admin award, .admin take, .admin set-balance)
  if (oneWord === 'admin' && w1 && ADMIN_ECON_SUBCOMMANDS.has(w1.toLowerCase())) {
    const subCmd = w1.toLowerCase();
    const consumed = w0.length + 1 + w1.length;
    const rest = afterPrefix.slice(consumed).trim();
    const path = `admin ${subCmd}`;
    return prefix + path + injectPositionalFlags(rest, POSITIONAL_SPECS[path] ?? []);
  }

  // `.trivia worldmap` → `.trivia start -list worldmap` (shorthand for list
  // names). Checked before the generic alias lookup — the native
  // `trivia → trivia` alias would otherwise swallow it.
  if (oneWord === 'trivia' && w1) {
    const triviaSubcommands = new Set(['start', 'stop', 'list', 'leaderboard']);
    if (!triviaSubcommands.has(w1.toLowerCase())) {
      return prefix + 'trivia start -list' + afterPrefix.slice(w0.length).toLowerCase();
    }
  }

  let rewritten: string | null = null;

  // Try longest (2-word) match first, then fall back to 1-word
  const twoWordAlias = twoWord ? PREFIX_ALIASES[twoWord] : undefined;
  if (twoWordAlias) {
    const consumed = w0.length + 1 + w1.length;
    rewritten = twoWordAlias + afterPrefix.slice(consumed).toLowerCase();
  } else {
    const oneWordAlias = oneWord ? PREFIX_ALIASES[oneWord] : undefined;
    if (oneWordAlias) {
      rewritten = oneWordAlias + afterPrefix.slice(w0.length).toLowerCase();
    }
  }

  let result = rewritten !== null ? prefix + rewritten : content;

  // Bare parent command → default subcommand (`.ledger` → `.ledger recent`)
  const bare = result.slice(prefix.length).trim().toLowerCase();
  const defaultPath = DEFAULT_SUBCOMMANDS[bare];
  if (defaultPath) {
    result = prefix + defaultPath;
  }

  // Generic positional→flag injection for any command path with a spec
  // (`.bounty post 5k fix the icon` → `.bounty post -amount 5k -title fix the icon`)
  const resolved = result.slice(prefix.length).trim();
  const resolvedWords = resolved.split(/\s+/);
  const twoWordPath = resolvedWords.length >= 2 ? `${resolvedWords[0]} ${resolvedWords[1]}`.toLowerCase() : '';
  const spec = twoWordPath ? POSITIONAL_SPECS[twoWordPath] : undefined;
  if (spec && resolvedWords.length > 2 && !resolvedWords.slice(2).some((t) => t.startsWith('-'))) {
    const pathLength = resolvedWords[0]!.length + 1 + resolvedWords[1]!.length;
    const rest = resolved.slice(pathLength).trim();
    result = prefix + twoWordPath + injectPositionalFlags(rest, spec);
  }

  return result;
}
