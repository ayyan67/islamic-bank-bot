# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start with tsx watch (auto-reload)
pnpm build            # Compile to dist/
pnpm start            # Run compiled JS
pnpm typecheck        # tsc --noEmit (strict mode)
pnpm lint             # ESLint
pnpm test             # Vitest (all tests)
pnpm aliases:check    # Verify command manifest is up to date
```

**Before every push**, run `pnpm aliases:check` to ensure the generated command manifest (`src/generated/commandManifest.ts`) is in sync. If it fails, run `pnpm aliases:generate` to regenerate it, then include the updated file in your commit.

After adding or modifying slash commands, delete `data/command-cache.json` so Seyfert re-uploads to Discord on next start.

## Changelog (REQUIRED on every push)

**Always update `assets/changelog.json` before pushing.** This file powers the `.changelog` / `.cl` command shown in Discord.

Format — prepend a new entry to the top of the array:
```json
{
  "version": "1.x.0",
  "date": "YYYY-MM-DD",
  "title": "Short release title",
  "changes": [
    "emoji Short description of change",
    "emoji Another change"
  ]
}
```
Keep the 3 most recent entries in the file (remove older ones). Use a relevant emoji per line (🎮 games, 🕌 Islamic, 💰 economy, 🛠️ fix, ⚙️ config, 📚 content, etc.).

## Community Suggestions Pipeline

Feature requests live on the VPS at `/srv/halal-economy-bot/shared/data/feature-requests.json` (`/suggest submit`, `/suggest list`). **When you implement a suggestion, resolve it** so the pipeline only shows open ideas: `/suggest done id:<n>` (admin-only; moves the entry to `feature-requests-archive.json`), or edit the two files over SSH the same way. Check the open list before planning feature work.

## Architecture

Layered: **Commands → Services → Repositories → Database (SQLite/better-sqlite3)**

All wiring lives in `src/app/container.ts` (`AppContainer`), which is injected into every command via Seyfert's context system: `context: () => ({ app })`. Commands access services via `ctx.app.economyService`, `ctx.app.vaultService`, etc.

### Directory Layout

- `src/commands/` — Seyfert command handlers (one folder per domain)
- `src/modules/` — Domain logic, each with `repository.ts`, `service.ts`, optionally `types.ts`
- `src/infra/` — Cross-cutting: database, Discord utilities, logging, metrics
- `src/events/` — Seyfert gateway event handlers (messageCreate for trivia answers + prefix commands)
- `src/config/env.ts` — Zod-validated environment schema
- `src/tests/` — Vitest integration tests using temp SQLite databases

### Data Flow Example

`/vault deposit 500` → `VaultDepositSubCommand.run()` → `vaultService.deposit(profile, 500)` → `vaultRepo` + `ledgerService.createTransaction()` → SQLite

All economy mutations create a `transactions` ledger entry with a `TxKind` (defined in `src/infra/db/types.ts`). Cooldowns are checked by querying the latest transaction of a given kind.

## Adding a New Command

### Simple top-level command

Create `src/commands/<domain>/<name>.ts`:

```typescript
import { Command, Declare, Options, createIntegerOption } from 'seyfert';
import { CONTEXTS_ALL, INTEGRATION_TYPES_GLOBAL } from '../../infra/discord/commandPolicy';
import { profileFromContext } from '../../infra/discord/profile';
import { reply, replyFields } from '../shared';

@Declare({
  name: 'commandname',
  description: 'What it does',
  aliases: ['alias1'],                              // prefix aliases (native Seyfert)
  integrationTypes: [...INTEGRATION_TYPES_GLOBAL],
  contexts: [...CONTEXTS_ALL]                       // or CONTEXTS_GUILD for guild-only
})
@Options({
  amount: createIntegerOption({ description: 'Amount', required: true, min_value: 1 })
})
export default class MyCommand extends Command {
  override async run(ctx: any): Promise<void> {
    const profile = profileFromContext(ctx);
    // ctx.app.<service>.<method>(profile, ...)
    await replyFields(ctx, {
      title: 'Done',
      tone: 'success',
      fields: [{ name: 'Amount', value: String(ctx.options.amount), inline: true }],
      compact: true
    });
  }
}
```

Seyfert auto-discovers commands via the `locations` config in `seyfert.config.ts`. No manual registration needed — just place the file under `src/commands/`.

### Subcommand under a parent

Create the SubCommand class, then register it in the parent's `@Options([...])` array. For grouped subcommands, use `@Group('groupname')` and add the group to the parent's `@Groups({...})`.

See `src/commands/admin/admin.ts` for a complete example of groups, subcommands, and option choices.

### Admin/protected commands

Add `@Middlewares(['permissionPolicy'])` and set `defaultMemberPermissions: ADMIN_DEFAULT_MEMBER_PERMISSIONS`. The `permissionPolicy` middleware checks owner IDs, guild admin users/roles, and Discord ManageGuild permission.

## Adding a New Module

A module lives in `src/modules/<name>/` with up to 3 files:

### 1. `types.ts` — Public interfaces

```typescript
export interface MyResult {
  ok: boolean;
  reason?: string;
}
```

### 2. `repository.ts` — SQL data access

```typescript
import { Database } from '../../infra/db/database';

export class MyRepository {
  constructor(private readonly db: Database) {}

  getSomething(userId: number): SomeRow | undefined {
    return this.db.sqlite
      .prepare('SELECT ... FROM my_table WHERE user_id = ? LIMIT 1')
      .get(userId) as SomeRow | undefined;
  }
}
```

Conventions: parameterized queries (`?`), typed row interfaces, `db.transaction(() => {...})` for multi-step ops.

### 3. `service.ts` — Business logic

```typescript
import { IdentityRepository } from '../../infra/db/repositories/identityRepository';

export class MyService {
  constructor(
    private readonly myRepo: MyRepository,
    private readonly identityRepo: IdentityRepository,
    private readonly ledgerService: LedgerService  // if economy-related
  ) {}

  doSomething(profile: UserProfileInput, ...): { ok: true } | { ok: false; reason: string } {
    const user = this.identityRepo.ensureUser(profile);
    // business logic...
    // ledgerService.createTransaction(...) for economy changes
  }
}
```

Services return `{ ok: true, ...data }` or `{ ok: false, reason: string }`. Commands check `result.ok` and call `reply(ctx, result.reason)` on failure.

### 4. Wire into AppContainer

In `src/app/container.ts`, add the repo and service fields, instantiate in the constructor (repos first, then services). Order matters — services that depend on other services must be created after their dependencies.

### 5. Add a migration if needed

Append to the `migrations` array in `src/infra/db/migrations.ts`. Each migration has a unique `id` string and raw `sql`. Migrations run automatically on startup and are tracked in `schema_migrations`.

## Key Patterns

### Response Helpers (`src/commands/shared.ts`)

- `reply(ctx, 'message')` — auto-detects tone (error/warning/success/info) from keywords
- `replyFields(ctx, { title, fields, tone, compact })` — structured embed with fields
- `replyList(ctx, { title, lines })` — list format
- `mention(discordUserId)` — `<@id>`
- Always use `compact: true` for cleaner embeds (icon-only title)
- Tone colors: success=green, error=red, warning=amber, info=teal

### Help System

- Command file: `src/commands/help/help.ts` with topic catalog in `src/commands/help/catalog.ts`
- `/help` shows categorized command sections
- `/help topic:<command>` shows summary, usage, examples, permissions, notes, and alias hints
- Prefix works too:
  - `.help transfer`
  - `.h transfer`
  - `.commands policy`
  - `.help -topic shop admin`
- Help lookup resolves both command aliases and prefix alias targets (for example, querying `bank d` resolves to vault help)

### User Identity

`profileFromContext(ctx)` extracts `{ discordUserId, username, ... }` from command context. `profileFromUnknown(ctx.options.user)` for user option targets. Services call `identityRepo.ensureUser(profile)` to upsert and get the internal `userId` (integer PK).

### Guild Settings Override System

Per-guild overrides for economy values (timely amount, prayer rewards, trivia config). Nullable DB columns — `null` means use env default. Commands read settings via:

```typescript
const settings = ctx.app.guildSettingsService.getEffectiveSettings(ctx.guildId);
settings.timelyAmount  // guild override or env.TIMELY_AMOUNT
```

Setting keys/validation defined in `src/modules/guild-settings/types.ts` (`GUILD_SETTING_DEFS`).

### Prefix Aliases

Seyfert's native prefix system supports full command paths (`.vault deposit`). All shorthand rewriting lives in **`src/infra/discord/prefixRewrite.ts`** (`rewritePrefixContent`, a pure function with golden tests in `src/tests/prefix-rewrite.test.ts`); `installPrefixAliases` in `src/app/client.ts` is just a thin shim around it that runs before Seyfert parses the message.

The alias map is in `src/infra/discord/prefixAliases.ts`. Multi-word keys (e.g. `bank d`) are matched before single-word keys. **Seyfert's prefix arg parser requires `-flag value` format** — aliases that map to commands with options must include the flag (e.g. `pray` → `prayer checkin -prayer` so `.pray fajr` becomes `.prayer checkin -prayer fajr`).

For help aliases, `help|h|commands|cmds|manual` are mapped in `prefixAliases.ts` so `.help` and `.h` both work.

**Standard for new commands** (enforced by `pnpm aliases:check`):
1. Declare aliases in `@Declare({ aliases })` — one short alias max per root command; the checker fails on collisions.
2. Parent commands with subcommands MUST add an entry to `DEFAULT_SUBCOMMANDS` in `prefixRewrite.ts` so the bare form (`.ledger`) does the obvious thing.
3. Commands whose prefix form takes positional args (`.award @user 500`) get an entry in `POSITIONAL_SPECS` (ordered option names) instead of hand-rolled flag parsing — `injectPositionalFlags` converts tokens generically (mentions bind to `user`, numbers to `amount`, the last option consumes remaining free text).
4. Add a golden test to `src/tests/prefix-rewrite.test.ts` for every new alias/shorthand.
5. Add a help topic in `src/commands/help/catalog.ts`.

### Shop Pagination

- `/shop list [page]` paginates catalog entries
- `/shop inventory [page]` paginates owned items
- `/shop admin list [page]` paginates admin view
- Pagination uses interactive **Previous/Next** Discord buttons (plus footer hints).
- Prefix users can pass a positional trailing page number for shop list commands:
  - `.shop list 2`
  - `.shop inventory 3`
  - `.shop admin list 2`

### Button Pagination

- Button pagination collector utility: `src/infra/discord/pagination.ts`
- Current button-enabled commands:
  - `/shop list`, `/shop inventory`, `/shop admin list`
  - `/leaderboard wealth`
  - `/club leaderboard`
  - `/ledger recent`
- Button interactions are requester-scoped: only the original command user can page.

### Shop Key Canonicalization

- Known legacy typo key `ayyubud` is canonicalized to `ayyubid` in `src/modules/shop/service.ts` (runtime key normalization for lookups/additions)

### Middleware Pipeline

Seven global middlewares in `src/infra/discord/middlewares.ts`, applied in order: `authz` → `idempotency` → `interactionSla` (auto-defer) → `backpressure` → `commandPolicy` (guild allow/deny) → `cooldown` → `audit`. Admin commands additionally use `permissionPolicy` middleware via `@Middlewares(['permissionPolicy'])`.

### Ledger & Cooldowns

All economy changes create a `transactions` row with a `TxKind`. Cooldowns work by querying the latest transaction of a kind (e.g. `claim_timely`) and checking its timestamp against the configured cooldown hours. To reset a cooldown, delete the latest transaction of that kind.

### Testing Pattern

Tests create a fresh `AppContainer` with a temp SQLite DB path. Each test gets isolated state. Cleanup removes the DB files (including WAL/SHM) in `afterEach`.

```typescript
const dbPath = createTempDbPath();
const container = new AppContainer(dbPath);
// ... test against container services ...
container.close();
removeDbFiles(dbPath);
```

## Seyfert Specifics

- **Command context type**: Use `any` for `ctx` — the custom context (`{ app: AppContainer }`) is at `ctx.app`
- **handleCommand**: Initialized during `client.start()`, not at construction. Monkey-patches must happen after start
- **Prefix arg format**: `-flagname value` (not positional). Seyfert's `argsParser` regex: `/-(.*?)(?=\s-|$)/gs`
- **Subcommand aliases**: Set in `@Declare({ aliases: [...] })` on the SubCommand class
- **Command cache**: `data/command-cache.json` — delete to force Discord re-upload of changed commands
- **Intents**: Guilds + GuildMessages + MessageContent + DirectMessages (MessageContent required for trivia + prefix)

## Analytics & Data Map

Before analysing usage, economy health, or abuse, read `docs/DATA_MAP.md`. It records which tables/columns matter, the ledger's double-row and legacy caveats, the weekly/monthly checklist, and the gaps in what is collected. `pnpm stats [--days N] [--db path] [--json]` (or `node dist/src/tools/stats.js` on the VPS) produces the standard report; keep `src/tools/stats.ts` and the doc in sync when you add a metric.
