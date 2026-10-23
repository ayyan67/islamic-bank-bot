# Islamic Bank

> This is a public snapshot of a private production repository. History has
> been squashed into one commit, and server addresses, Discord IDs and some
> production-only data cleanup have been removed or replaced with placeholders.

Islamic Bank is a Discord bot that runs a virtual-currency economy, prayer
check-ins, trivia and small games for a Muslim community server.

## Who uses it

It runs in production for **muslim.chat**, a Muslim community server on Discord,
and in a number of smaller servers. It replaced NadekoBot, which the community
had used from 2018 to 2022, and carried its balances over.

Figures from the production database, measured in September 2026
(see `docs/DATA_MAP.md`):

| | |
|---|---|
| User records | about 93,000 (about 85,000 imported from NadekoBot) |
| Ledger rows | about 635,000 (about 383,000 imported from NadekoBot) |
| Prayer check-ins | about 13,000 |
| Servers with settings rows | 288 |

The imported user count overstates real activity; the bot's own analytics
measure active users by ledger activity in a time window instead.

## Features

- **Economy**: balances, transfers, an hourly claim with streak bonuses, a
  savings vault, a role shop, currency drops, leaderboards, and an admin
  award/take with a full audit trail.
- **Worship**: check-ins for the five daily prayers, with a bonus for all
  five in a day and a daily streak. Resets at midnight UTC, so a member's
  time zone never breaks a streak.
- **Trivia and games**: trivia with per-server leaderboards and rewards
  (Quranic Arabic vocabulary, guess the surah, Islamic history, mental math
  and others), hangman, connect four and a race game.
- **Community**: clubs with XP, a bounty board with escrow, daily challenges,
  a weekly digest post, reaction roles, reminders, and a `/suggest` queue for
  feature requests.
- **Server administration**: per-server overrides for reward amounts and
  cooldowns, per-channel command allow/deny policies, and admin users/roles.
- Slash commands throughout, plus short text commands (`.pray fajr`,
  `.bank d 500`) for members who prefer typing.

## Architecture

TypeScript on Node 22, [Seyfert](https://seyfert.dev) for the Discord gateway,
SQLite through better-sqlite3, Zod for configuration, Pino for logs.

```
commands  ->  services  ->  repositories  ->  SQLite
```

Commands parse input and format replies. Services hold the rules and return
`{ ok: true, ... } | { ok: false, reason }`. Repositories hold parameterised
SQL. Everything is wired in one container (`src/app/container.ts`) that is
injected into each command, which is also how the tests build an isolated
instance against a temporary database.

**Ledger.** Every balance change writes a row to `transactions` inside the same
SQLite transaction as the balance update, so a balance never moves without a
record of why. A transfer writes two rows (sender and recipient) linked to each
other. Cooldowns are derived from the ledger (the latest row of a given kind)
rather than stored separately. Ledger rows are not edited; the one exception is
an admin cooldown reset, which deletes the latest claim row. Debits use
`UPDATE ... WHERE balance >= ?` so an overdraft cannot happen even under
concurrent commands.

**Middleware.** Every command passes through a fixed pipeline in
`src/infra/discord/middlewares.ts`:

1. `authz`: rejects events without an author and records the start time.
2. `idempotency`: claims the Discord interaction ID in an `interaction_dedup`
   table with a 15-minute TTL. If Discord redelivers an interaction, the second
   delivery is rejected instead of paying out twice.
3. `interactionSla`: defers the reply automatically so slow commands do not
   hit Discord's three-second response deadline.
4. `backpressure`: turns commands away with a short message when Discord
   rate-limit or invalid-request counts in the last minute cross a threshold,
   so the bot backs off before Discord starts blocking its requests.
5. `commandPolicy`: per-server and per-channel allow/deny rules.
6. `cooldown`: per-user command rate limit.
7. `audit`: logs command name, user, server, channel, outcome and duration.

Admin commands also run `permissionPolicy`, which checks bot owners, configured
admin users and roles, and Discord's Manage Server permission.

**Economy scope.** Wallets are global per user, but currency can only be
earned in the configured home server (`ECONOMY_GUILD_IDS`). Without that rule
any server owner who added the bot could mint currency that spends in the home
server.

**Migration from NadekoBot.** User balances, shop items and about 383,000
historical transactions (2018 to 2022) were imported into the same tables. The
original Nadeko transaction type is kept in `legacy_type`, imported rows use
the `legacy` kind, and analytics exclude them. The one-off import tooling is
not part of this repository. Schema changes go through numbered migrations in
`src/infra/db/migrations.ts`, applied at startup and recorded in
`schema_migrations`.

**Notifications.** DMs and channel notifications go through an outbox table
with a unique dedupe key, retry with attempt counts, and a dead-letter state,
so a Discord outage delays notifications instead of losing them.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which connects to the
server over SSH (host, user and keys come from repository secrets) and runs
`deploy/deploy.sh <sha>`:

1. Extract that commit with `git archive` into `releases/<sha>`.
2. Link the shared `.env` and data directory, `pnpm install --frozen-lockfile`,
   build, and run `pnpm smoke-check` (required tables exist, no foreign-key
   orphans).
3. Point the `current` symlink at the new release, keeping the old one as
   `previous`, and restart the systemd unit.
4. Watch the service for 30 seconds. If it fails, the error trap points
   `current` back at `previous` and restarts, then prints the recent logs.
5. Keep the newest four releases.

The systemd unit caps memory at 500 MB and restarts on failure.

**Backups.** A cron job runs `botctl backup` nightly: an online SQLite
`.backup`, a `PRAGMA integrity_check` on the copy, then an archive of the
snapshot and config. Archives older than 14 days are pruned. `deploy/botctl`
also wraps start, stop, status and log commands with explicit success and
failure output.

## Observability

- Structured JSON logs through Pino, with the bot token and authorization
  headers redacted.
- A heartbeat every five minutes with uptime, memory, command and rate-limit
  metrics, and notification outbox health. REST 429s and gateway reconnects are logged.
- Errors in commands, middleware and the framework are logged with context;
  unhandled rejections are logged without crashing the process.
- A scheduler writes one row per metric per day to `daily_stats` (active
  users, currency minted and burned, claims, transfers, shop activity, supply
  and concentration). `pnpm stats` prints a report from it.
  `docs/DATA_MAP.md` documents the tables, the traps in the data, and what to
  check weekly and monthly.

## Running locally

Requires Node 22 and pnpm 10, and a Discord application with a bot token.

```bash
pnpm install
cp .env.example .env    # set BOT_TOKEN, APPLICATION_ID, and your server ID
pnpm dev                # tsx watch
```

The database is created and migrated at `./data/halal-economy.db` on first
start.

## Tests and CI

```bash
pnpm typecheck       # tsc --noEmit, strict mode
pnpm lint            # ESLint
pnpm test            # Vitest
pnpm aliases:check   # generated command manifest is up to date, no alias collisions
pnpm build
```

The Vitest suite (19 files, 109 tests) builds a real container against a
temporary SQLite file for each test and covers the economy services, streaks,
UTC day resets, shop refunds, bounties, notifications, access policy, economy
scope, analytics, and golden tests for the text-command rewriter. CI
(`.github/workflows/ci.yml`) runs all of the above on every pull request and on
`main`.

## Notes on this snapshot

- Some trivia lists used in production are not included because their origin
  is not documented. The bot loads whatever lists are in `assets/trivia/`
  (one question per line, answers separated by backticks).
- Migrations `020` and `021` were one-off production data cleanups; their
  user ID lists have been removed and they are no-ops here.
