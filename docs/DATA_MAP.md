# Data Map & Analytics Guide

Read this before analysing the bot's data. It records which tables and columns
matter, the traps in the data, the questions worth asking on a schedule, and
the gaps in what we collect. `pnpm stats` (see bottom) runs the standard report.

Production DB: `/srv/halal-economy-bot/shared/data/halal-economy.db` (SQLite, WAL).
Always open it read-only: `new Database(path, { readonly: true })`.
Nightly backups: `/root/backups/halal-economy-YYYYMMDD-HHMMSS.tar.gz` (14 days).

## The one thing to remember

**Wallets are global per user, not per server.** `wallets`, `vault_accounts` and
`streaks` have no guild column. Anything earned in any server the bot is in
spends everywhere. Since 2026-09-29 every new `transactions` row carries the
`guild_id` and `channel_id` it happened in (stamped from an AsyncLocalStorage
command scope set at the gateway entry points, see
`src/infra/discord/commandScope.ts`), so per-server economics are possible
from that date. Older rows have NULL. `prayer_checkins` still has no guild.

Home guild (muslim.chat): `<HOME_GUILD_ID>`. Everything else is a satellite
server; treat their activity as noise unless it feeds the home guild.

## Tables that matter

| Table | Rows (2026-09) | Grain | Key columns | Notes |
|---|---|---|---|---|
| `users` | 93k | one per Discord user ever seen | `id` (internal PK used everywhere else), `discord_user_id`, `username`, `created_at` | ~85k are Nadeko imports with `created_at = 1970-01-01`. Join on `id`, not `discord_user_id`, except for `user_guilds`. |
| `wallets` | 93k | one per user | `balance` | Current liquid supply = `sum(balance)`. |
| `vault_accounts` | 93k | one per user | `balance` | Savings. Total supply = wallets + vaults. Table is `vault_accounts`, not `vaults`. |
| `transactions` | 635k | one ledger row per movement | `user_id`, `amount` (signed), `kind`, `subtype`, `note`, `other_user_id`, `created_at`, `guild_id`, `channel_id` | The heart of everything. See kinds below. `guild_id`/`channel_id` are filled from 2026-09-29 onward (NULL before) via the command scope. |
| `daily_stats` | grows 1 row per metric per day | (`date`, `guild_id`, `metric`) | `value` | Snapshots computed nightly (see below). `guild_id = ''` is global. Query this for trends instead of scanning `transactions`. |
| `prayer_checkins` | 13k | one per prayer claim | `user_id`, `prayer_name`, `checked_in_at`, `reward_amount` | Faster than filtering `transactions` for prayer analysis. **`prayer_name` also contains `all_five_bonus` rows**; filter to the five real names when counting prayers. |
| `streaks` | 220 | one per (user, kind) | `kind` (`timely`/`prayer`), `count`, `best`, `last_claim_at` | Timely streak = consecutive claims within 2x cooldown; prayer streak = days. |
| `drops` | 2.2k | one per `.drop` | `guild_id`, `channel_id`, `dropper_user_id`, `picker_user_id`, `amount`, `created_at`, `picked_at` | `picked_at - created_at` = pick latency (channel liveliness). |
| `shop_items` / `shop_inventory` | 166 / 258 | catalogue / ownership | `guild_id`, `item_key`, `price`, `item_type`, `is_active`; inventory: `acquired_at`, `is_using` | Refunds return 100% of price, so purchases are role swaps, not sinks. |
| `trivia_scores` | 423 | per (user, guild, list) aggregate | `correct_answers`, `games_won`, `games_played`, `updated_at` | No per-session rows exist. |
| `user_guilds` | 31k | per (discord user, guild) | `discord_user_id`, `guild_id`, `last_seen_at` | Keyed by **discord** id. Refreshed on startup sync and on command use. No `first_seen_at` (retention cohorts are not possible yet). |
| `guild_settings` | 288 | per guild | economy overrides, `digest_channel_id`, `challenge_channel_id` | `NULL` = env default. Only the home guild has overrides. |
| `daily_challenges` / `_completions` | 205 / 168 | per day per guild / per completion | `reward_amount`, `challenge_date`, `completed_at` | Low engagement; candidate for rework. |
| `notification_outbox` | 1.4k | per queued DM/notification | `event_type`, `status`, `delivered_via`, `attempt_count` | Delivery health. |
| `reaction_roles` | 14 | per (message, emoji) | `role_id`, `emoji_key` | No grant/remove log exists. |
| `marketplace_tasks` | 17 | per bounty | `status`, `bounty_amount` | Bounty board; mostly cancelled. |
| `clubs` / `club_members` | 31 / 109 | per club / membership | `xp` | Little activity. |

Ignore: `interaction_dedup`, `schema_migrations`, `active_effects` (unused),
`reminders` (empty), `command_policies` (empty), `*_notification_*` overrides.

## `transactions` in detail

`amount` is signed from the user's perspective (earn +, spend −). A transfer
writes two rows: `subtype='sent'` (negative) for the sender and
`subtype='received'` for the recipient, linked by `other_user_id`. Count
transfers by counting `subtype='sent'` only.

| `kind` | Meaning | Sink or source | Caveat |
|---|---|---|---|
| `claim_timely` | hourly claim | source | **Two rows per claim** when a streak bonus applies (`subtype='timely'` and `subtype='streak_bonus'`, `note='streak:N'`). Count claims with `subtype='timely'`. |
| `claim_prayer` | prayer check-in | source | `subtype` = prayer name or `streak_bonus`. |
| `claim_eid`, `claim_tag_reward`, `claim_trivia`, `challenge_reward` | event/feature rewards | source | |
| `transfer` | user gift | neutral | See above. Sum of `sent` rows = gifting volume. |
| `drop` / `drop_pick` | `.drop` and `.pick` | neutral | Money moves between users; `drops` table is easier. |
| `shop_purchase` / `shop_refund` | shop | sink / un-sink | `note='shop:<item_key>'` and `shop_refund:<item_key>:<reason>`. Net sink = purchases + refunds (refunds are positive). |
| `vault_deposit` / `vault_withdraw` | savings | neutral | |
| `admin_award` / `admin_take` | manual | source / sink | |
| `task_bounty_*` | bounty escrow | neutral | |
| `legacy` | Nadeko import (2018–2022) | ignore | 383k rows; `legacy_type` holds Nadeko's kind (`timely`, `gift`, `betroll`...). Exclude from any post-2026 analysis. |

`created_at` is mixed: Nadeko-era rows are `YYYY-MM-DD HH:MM:SS.fffffff`,
new rows are ISO `YYYY-MM-DDTHH:MM:SS.sssZ`. Both compare correctly against
`datetime('now', '-30 days')` and both work in `date()`/`strftime()`.

## Known noise

- Bot accounts hold wallets from the import: `MEE6`, `Dyno`, similar. Exclude
  `users.username` in a small bot list when ranking.
- Satellite servers can generate claim activity that funnels into home-guild
  wallets. Earning is restricted to the home guild for this reason.
- The imported user base (93k) makes any "% of users" figure meaningless.
  Always use an activity window (users with a ledger row in the last N days).

## Definitions used in `pnpm stats`

- **Active user (N days)**: distinct `transactions.user_id` with a row in the
  window, `kind != 'legacy'`.
- **Minted**: sum of positive amounts for source kinds. **Burned**: sum of
  negative amounts for `shop_purchase`, `admin_take`, plus refunds as a
  negative burn. Inflation = minted − burned.
- **Supply**: wallets + vault balances. **Top-10 share**: share of supply held
  by the ten largest wallets (exclude bots).
- **Stickiness**: DAU / MAU using the activity definition above.
- **Automation signal**: a user whose last 48 timely claims all land within
  90 seconds of cooldown expiry. Humans are never that regular.

## What to look at, and how often

**Weekly (five minutes, `pnpm stats --days 7`)**
1. Active users 7d vs the previous 7d. A drop of more than 20% is the alarm.
2. Minted vs burned. If burned is under 10% of minted for a month, the economy
   needs a sink.
3. Prayer check-ins per prayer. Fajr is the canary for real engagement.
4. Automation signals and single recipients receiving from 3+ new accounts.
5. Shop: purchases, refund rate, top items. Refund rate above 70% means the
   shop is functioning as a free role picker.

**Monthly**
1. Supply and top-10 share trend. Rising concentration means new members
   cannot catch up; consider zakat/decay mechanics.
2. Streak survival: how many timely streaks exceed 7, 30, 100.
3. Feature adoption: share of active users who used 2+ features (claim +
   anything else). Features with zero use for 60 days are candidates to cut
   or to surface via quests.
4. Notification outbox failure rate and dead letters.
5. Guild spread: which satellite guilds generate ledger activity.

**After every release**: error count in journald for 48h, command latency in
heartbeats, gateway reconnect count per day (baseline: 0–2; Sept 26+ showed
~10/day from Discord's side).

## Daily snapshots (`daily_stats`)

A scheduler in `src/index.ts` calls `statsService.runDue()` every 10 minutes;
it computes any missing UTC day up to yesterday (backfilling at most 30 days
on first run) for the global scope and for every guild with scoped ledger
activity that day. All queries are bounded to one day on
`idx_transactions_created_at`, so a day costs milliseconds. Metrics:
`active_users`, `minted`, `burned`, `timely_claims`, `transfers_count`,
`transfers_volume`, `shop_purchases`, `shop_refunds`, `drops_count`,
`drops_volume`; global-only: `new_users`, `prayer_checkins`, and (only for
the most recent day, since they are point-in-time) `supply_wallets`,
`supply_vaults`, `top10_share`. `pnpm stats` prints the trend table from it.
Add a metric in `src/modules/stats/service.ts` and list it here.

## Gaps: what we should be collecting

Ordered by value. Each is a small migration. (Done: guild/channel on ledger
rows and daily snapshots, 2026-09-29.)

1. **`command_events` table** written by the audit middleware: `ts`,
   `guild_id`, `channel_id`, `user_id`, `command`, `source`
   (`slash`/`prefix`/`button`), `outcome`, `duration_ms`. Journald rotates in
   about two weeks; this keeps 90 days and answers "what do people actually
   use" without SSH. Nightly prune.
2. **`first_seen_at` on `user_guilds`** for retention cohorts (D1/D7/D30).
3. **`game_sessions`** (`kind`, `guild_id`, `channel_id`, `players_json`,
   `winner_user_id`, `started_at`, `ended_at`). Trivia, hangman, race and
   connect4 currently live only in memory.
4. **`reaction_role_events`** (`binding_id`, `user_id`, `action`, `ts`) or
   fold into `command_events` with `command='reaction_role'`.

## Running the report

Local (against a backup or the dev DB):

```
pnpm stats                 # last 30 days, markdown to stdout
pnpm stats --days 7
pnpm stats --db /path/to/halal-economy.db --json
```

Production (read-only, safe while the bot runs):

```
ssh <VPS_USER>@<VPS_HOST> 'cd /srv/halal-economy-bot/current && node dist/src/tools/stats.js --days 7'
```

Ad-hoc SQL on production:

```
ssh <VPS_USER>@<VPS_HOST> "cd /srv/halal-economy-bot/current && node -e \"const D=require('better-sqlite3');const db=new D('data/halal-economy.db',{readonly:true});console.log(db.prepare('SELECT ...').all())\""
```
