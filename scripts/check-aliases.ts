import { HELP_TOPICS } from '../src/commands/help/catalog.js';
import {
  COMMAND_MANIFEST,
  NATIVE_PREFIX_ALIASES,
  NATIVE_ROOT_ALIAS_COLLISIONS
} from '../src/generated/commandManifest.js';
import { PREFIX_ALIASES } from '../src/infra/discord/prefixAliases.js';
import { DEFAULT_SUBCOMMANDS, POSITIONAL_SPECS } from '../src/infra/discord/prefixRewrite.js';

function aliasCommandPath(target: string): string {
  const tokens = target
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const commandTokens: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('-')) {
      break;
    }

    commandTokens.push(token);
  }

  return commandTokens.join(' ');
}

function commandRoot(path: string): string {
  return path.trim().split(/\s+/)[0] ?? '';
}

function run(): void {
  const errors: string[] = [];
  const validPaths = new Set<string>();
  const rootCommands = new Set<string>();

  for (const command of COMMAND_MANIFEST) {
    rootCommands.add(command.name);
    validPaths.add(command.name);
    for (const subcommand of command.subcommands) {
      validPaths.add(subcommand.path);
    }
  }

  const nativeCollisions = Object.keys(NATIVE_ROOT_ALIAS_COLLISIONS);
  if (nativeCollisions.length > 0) {
    for (const key of nativeCollisions.sort((a, b) => a.localeCompare(b))) {
      const owners = NATIVE_ROOT_ALIAS_COLLISIONS[key] ?? [];
      errors.push(`Native alias collision for "${key}": ${owners.join(', ')}`);
    }
  }

  for (const root of [...rootCommands].sort((a, b) => a.localeCompare(b))) {
    if (!(root in PREFIX_ALIASES)) {
      errors.push(`Missing root command mapping in PREFIX_ALIASES: "${root}"`);
    }
  }

  const aliasEntries = Object.entries(PREFIX_ALIASES).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [alias, target] of aliasEntries) {
    if (alias !== alias.trim().toLowerCase()) {
      errors.push(`Alias key must be lowercase and trimmed: "${alias}"`);
    }

    const path = aliasCommandPath(target);
    if (!path) {
      errors.push(`Alias "${alias}" resolves to an empty command path.`);
      continue;
    }

    if (!validPaths.has(path)) {
      errors.push(`Alias "${alias}" points to unknown command path "${path}".`);
      continue;
    }

    const nativePath = NATIVE_PREFIX_ALIASES[alias];
    if (nativePath) {
      const targetRoot = commandRoot(path);
      if (targetRoot !== nativePath) {
        errors.push(
          `Alias "${alias}" overrides native root "${nativePath}" with incompatible target "${path}".`
        );
      }
    }
  }

  for (const [root, target] of Object.entries(DEFAULT_SUBCOMMANDS)) {
    if (!rootCommands.has(root)) {
      errors.push(`DEFAULT_SUBCOMMANDS key "${root}" is not a root command.`);
    }
    if (!validPaths.has(target)) {
      errors.push(`DEFAULT_SUBCOMMANDS target "${target}" is not a valid command path.`);
    }
  }

  for (const path of Object.keys(POSITIONAL_SPECS)) {
    if (!validPaths.has(path)) {
      errors.push(`POSITIONAL_SPECS key "${path}" is not a valid command path.`);
    }
  }

  for (const topic of HELP_TOPICS) {
    const exactMatch = validPaths.has(topic.id);
    const prefixMatch = [...validPaths].some((path) => path.startsWith(`${topic.id} `));
    if (!exactMatch && !prefixMatch) {
      errors.push(`Help topic id "${topic.id}" does not map to a command path.`);
    }
  }

  if (errors.length > 0) {
    console.error(`Alias check failed with ${errors.length} issue(s):`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `Alias check passed (${rootCommands.size} root commands, ${aliasEntries.length} prefix aliases, ${HELP_TOPICS.length} help topics)`
  );
}

run();
