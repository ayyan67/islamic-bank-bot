import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type DeclaredKind = 'Command' | 'SubCommand';

interface ParsedDeclaration {
  readonly className: string;
  readonly kind: DeclaredKind;
  readonly isDefaultExport: boolean;
  readonly name: string;
  readonly aliases: string[];
  readonly group: string | null;
  readonly optionClassRefs: string[];
  readonly file: string;
}

interface ManifestSubcommand {
  readonly name: string;
  readonly group: string | null;
  readonly path: string;
  readonly aliases: string[];
  readonly file: string;
}

interface ManifestCommand {
  readonly name: string;
  readonly aliases: string[];
  readonly file: string;
  readonly subcommands: ManifestSubcommand[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const COMMANDS_DIR = path.join(REPO_ROOT, 'src', 'commands');
const OUTPUT_FILE = path.join(REPO_ROOT, 'src', 'generated', 'commandManifest.ts');

function toPosixPath(input: string): string {
  return input.split(path.sep).join('/');
}

function listCommandFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCommandFiles(fullPath));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue;
    }

    if (entry.name === 'shared.ts' || entry.name === 'catalog.ts') {
      continue;
    }

    files.push(fullPath);
  }

  return files.sort();
}

function findMatchingBrace(source: string, startIndex: number): number {
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseName(declareBlock: string): string | null {
  const match = declareBlock.match(/name\s*:\s*['"]([^'"]+)['"]/);
  return match?.[1] ?? null;
}

function parseAliases(declareBlock: string): string[] {
  const arrayMatch = declareBlock.match(/aliases\s*:\s*\[([\s\S]*?)\]/);
  if (!arrayMatch?.[1]) {
    return [];
  }

  return [...arrayMatch[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map((match) => match[1]?.trim() ?? '')
    .filter((value) => value.length > 0);
}

function parseGroup(decoratorSegment: string): string | null {
  const match = decoratorSegment.match(/@Group\(\s*['"]([^'"]+)['"]\s*\)/);
  const group = match?.[1]?.trim() ?? '';
  return group.length > 0 ? group : null;
}

function parseOptionClassRefs(decoratorSegment: string): string[] {
  const refs = new Set<string>();
  const optionsArrayPattern = /@Options\(\s*\[([\s\S]*?)\]\s*\)/g;

  for (const match of decoratorSegment.matchAll(optionsArrayPattern)) {
    const body = match[1] ?? '';
    for (const idMatch of body.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      const token = idMatch[1] ?? '';
      if (token.length > 0) {
        refs.add(token);
      }
    }
  }

  return [...refs];
}

function parseDeclarations(file: string): ParsedDeclaration[] {
  const source = fs.readFileSync(file, 'utf8');
  const declarations: ParsedDeclaration[] = [];
  const relativeFile = toPosixPath(path.relative(REPO_ROOT, file));
  let cursor = 0;

  while (cursor < source.length) {
    const declareStart = source.indexOf('@Declare({', cursor);
    if (declareStart < 0) {
      break;
    }

    const braceStart = source.indexOf('{', declareStart);
    if (braceStart < 0) {
      break;
    }

    const braceEnd = findMatchingBrace(source, braceStart);
    if (braceEnd < 0) {
      break;
    }

    const declareBlock = source.slice(braceStart, braceEnd + 1);
    const name = parseName(declareBlock);
    if (!name) {
      cursor = braceEnd + 1;
      continue;
    }

    let afterDeclare = braceEnd + 1;
    while (afterDeclare < source.length && /\s/.test(source[afterDeclare] ?? '')) {
      afterDeclare += 1;
    }
    if (source[afterDeclare] === ')') {
      afterDeclare += 1;
    }

    const remainder = source.slice(afterDeclare);
    const classMatch = remainder.match(
      /^([\s\S]*?)(export\s+default\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)\s+extends\s+(Command|SubCommand)\b/
    );

    if (!classMatch) {
      cursor = afterDeclare;
      continue;
    }

    const decoratorSegment = classMatch[1] ?? '';
    const className = classMatch[3] ?? '';
    const kind = classMatch[4] as DeclaredKind;
    if (!className || (kind !== 'Command' && kind !== 'SubCommand')) {
      cursor = afterDeclare + classMatch[0].length;
      continue;
    }

    declarations.push({
      className,
      kind,
      isDefaultExport: Boolean(classMatch[2]),
      name,
      aliases: parseAliases(declareBlock),
      group: parseGroup(decoratorSegment),
      optionClassRefs: parseOptionClassRefs(decoratorSegment),
      file: relativeFile
    });

    cursor = afterDeclare + classMatch[0].length;
  }

  return declarations;
}

function buildManifest(declarations: ParsedDeclaration[]): ManifestCommand[] {
  const subcommandsByClass = new Map<string, ParsedDeclaration>();
  const rootCommands = declarations
    .filter((entry) => entry.kind === 'Command' && entry.isDefaultExport)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of declarations) {
    if (entry.kind !== 'SubCommand') {
      continue;
    }
    subcommandsByClass.set(entry.className, entry);
  }

  return rootCommands.map((command) => {
    const subcommands = command.optionClassRefs
      .map((classRef) => subcommandsByClass.get(classRef))
      .filter((entry): entry is ParsedDeclaration => Boolean(entry))
      .map((subcommand) => {
        const pathTokens = [command.name];
        if (subcommand.group) {
          pathTokens.push(subcommand.group);
        }
        pathTokens.push(subcommand.name);

        return {
          name: subcommand.name,
          group: subcommand.group,
          path: pathTokens.join(' '),
          aliases: [...subcommand.aliases].sort(),
          file: subcommand.file
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));

    return {
      name: command.name,
      aliases: [...command.aliases].sort(),
      file: command.file,
      subcommands
    };
  });
}

function buildNativeAliasData(
  manifest: ManifestCommand[]
): { aliases: Record<string, string>; collisions: Record<string, string[]> } {
  const ownersByAlias = new Map<string, Set<string>>();

  for (const command of manifest) {
    for (const alias of [command.name, ...command.aliases]) {
      const normalized = alias.trim().toLowerCase();
      if (!normalized) {
        continue;
      }

      const owners = ownersByAlias.get(normalized) ?? new Set<string>();
      owners.add(command.name);
      ownersByAlias.set(normalized, owners);
    }
  }

  const aliases: Record<string, string> = {};
  const collisions: Record<string, string[]> = {};

  const sortedAliases = [...ownersByAlias.keys()].sort((a, b) => a.localeCompare(b));
  for (const alias of sortedAliases) {
    const owners = [...(ownersByAlias.get(alias) ?? new Set<string>())].sort((a, b) =>
      a.localeCompare(b)
    );

    if (owners.length === 1) {
      aliases[alias] = owners[0] ?? '';
      continue;
    }

    if (owners.length > 1) {
      collisions[alias] = owners;
    }
  }

  return { aliases, collisions };
}

function writeManifestFile(
  manifest: ManifestCommand[],
  nativeAliases: Record<string, string>,
  nativeAliasCollisions: Record<string, string[]>
): void {
  const output = `/* AUTO-GENERATED FILE. DO NOT EDIT.
 * Run \`pnpm aliases:generate\` to regenerate.
 */

export interface CommandSubcommandManifestEntry {
  readonly name: string;
  readonly group: string | null;
  readonly path: string;
  readonly aliases: readonly string[];
  readonly file: string;
}

export interface CommandManifestEntry {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly file: string;
  readonly subcommands: readonly CommandSubcommandManifestEntry[];
}

export const COMMAND_MANIFEST: readonly CommandManifestEntry[] = ${JSON.stringify(
    manifest,
    null,
    2
  )} as const;

export const NATIVE_PREFIX_ALIASES: Readonly<Record<string, string>> = ${JSON.stringify(
    nativeAliases,
    null,
    2
  )} as const;

export const NATIVE_ROOT_ALIAS_COLLISIONS: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(
    nativeAliasCollisions,
    null,
    2
  )} as const;
`;

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
}

function run(): void {
  const commandFiles = listCommandFiles(COMMANDS_DIR);
  const declarations = commandFiles.flatMap((file) => parseDeclarations(file));
  const manifest = buildManifest(declarations);
  const { aliases, collisions } = buildNativeAliasData(manifest);

  writeManifestFile(manifest, aliases, collisions);

  const rootCommandCount = manifest.length;
  const rootAliasCount = Object.keys(aliases).length;
  const collisionCount = Object.keys(collisions).length;

  console.log(
    `Generated command manifest (${rootCommandCount} root commands, ${rootAliasCount} native aliases, ${collisionCount} native collisions)`
  );
}

run();
