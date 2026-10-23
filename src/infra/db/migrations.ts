export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: '001_initial_schema',
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  discord_user_id TEXT NOT NULL UNIQUE,
  username TEXT,
  discriminator TEXT,
  avatar_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vault_accounts (
  user_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  prefix TEXT,
  locale TEXT,
  timezone_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS club_members (
  club_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (club_id, user_id),
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS club_applications (
  club_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (club_id, user_id),
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS club_bans (
  club_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  banned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (club_id, user_id),
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  subtype TEXT,
  note TEXT,
  other_user_id INTEGER,
  legacy_type TEXT,
  legacy_extra TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (other_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS prayer_checkins (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  prayer_name TEXT NOT NULL,
  checked_in_at TEXT NOT NULL,
  reward_amount INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tag_reward_claims (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  reward_amount INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_discord_user_id ON users(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created_at ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_kind ON transactions(kind);
CREATE INDEX IF NOT EXISTS idx_clubs_owner ON clubs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members(user_id);
CREATE INDEX IF NOT EXISTS idx_club_apps_user ON club_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_club_bans_user ON club_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_prayer_checkins_user_time ON prayer_checkins(user_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_tag_reward_claims_user ON tag_reward_claims(user_id);
`
  },
  {
    id: '002_trivia',
    sql: `
CREATE TABLE IF NOT EXISTS trivia_scores (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  list_name TEXT NOT NULL,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, guild_id, list_name)
);

CREATE INDEX IF NOT EXISTS idx_trivia_scores_guild ON trivia_scores(guild_id);
CREATE INDEX IF NOT EXISTS idx_trivia_scores_user ON trivia_scores(user_id);
`
  },
  {
    id: '003_access_policy',
    sql: `
CREATE TABLE IF NOT EXISTS admin_users (
  guild_id TEXT NULL,
  user_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS admin_roles (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS command_policies (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  command TEXT NOT NULL,
  subcommand TEXT,
  action TEXT NOT NULL CHECK (action IN ('allow', 'deny')),
  scope TEXT NOT NULL CHECK (scope IN ('guild', 'channel', 'role', 'user')),
  target_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_users_guild_user ON admin_users(guild_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_unique ON admin_users(COALESCE(guild_id, '__global__'), user_id);
CREATE INDEX IF NOT EXISTS idx_admin_roles_guild_role ON admin_roles(guild_id, role_id);
CREATE INDEX IF NOT EXISTS idx_command_policies_lookup ON command_policies(guild_id, command, subcommand);
CREATE INDEX IF NOT EXISTS idx_command_policies_scope ON command_policies(guild_id, scope, target_id);
`
  },
  {
    id: '004_shop',
    sql: `
CREATE TABLE IF NOT EXISTS shop_items (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  item_type TEXT NOT NULL CHECK (item_type IN ('role', 'item')),
  role_id TEXT,
  role_requirement_id TEXT,
  sort_index INTEGER NOT NULL DEFAULT 0,
  stock INTEGER,
  max_per_user INTEGER,
  metadata_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  legacy_shop_entry_id INTEGER,
  legacy_type INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shop_item_texts (
  id INTEGER PRIMARY KEY,
  shop_item_id INTEGER NOT NULL,
  text_value TEXT NOT NULL,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_item_id) REFERENCES shop_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop_inventory (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  guild_id TEXT,
  shop_item_id INTEGER,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('role', 'item', 'xp_item', 'legacy')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  is_using INTEGER NOT NULL DEFAULT 0,
  legacy_owned_item_id INTEGER,
  acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_item_id) REFERENCES shop_items(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_items_unique_key ON shop_items(guild_id, item_key);
CREATE INDEX IF NOT EXISTS idx_shop_items_guild_active ON shop_items(guild_id, is_active, sort_index, id);
CREATE INDEX IF NOT EXISTS idx_shop_items_role ON shop_items(role_id);
CREATE INDEX IF NOT EXISTS idx_shop_item_texts_item ON shop_item_texts(shop_item_id, sort_index, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_inventory_unique ON shop_inventory(user_id, COALESCE(guild_id, '__global__'), item_key);
CREATE INDEX IF NOT EXISTS idx_shop_inventory_user ON shop_inventory(user_id, guild_id);
`
  },
  {
    id: '005_guild_settings_economy',
    sql: `
ALTER TABLE guild_settings ADD COLUMN timely_amount INTEGER;
ALTER TABLE guild_settings ADD COLUMN timely_cooldown_hours INTEGER;
ALTER TABLE guild_settings ADD COLUMN prayer_reward INTEGER;
ALTER TABLE guild_settings ADD COLUMN prayer_cooldown_hours INTEGER;
ALTER TABLE guild_settings ADD COLUMN prayer_all_five_bonus INTEGER;
ALTER TABLE guild_settings ADD COLUMN trivia_max_score INTEGER;
ALTER TABLE guild_settings ADD COLUMN trivia_delay_seconds INTEGER;
ALTER TABLE guild_settings ADD COLUMN trivia_reward_per_correct INTEGER;
ALTER TABLE guild_settings ADD COLUMN trivia_win_bonus INTEGER;
ALTER TABLE guild_settings ADD COLUMN trivia_reveal_answer INTEGER;
`
  },
  {
    id: '006_trivia_earnings_cooldown',
    sql: `
ALTER TABLE guild_settings ADD COLUMN trivia_earnings_cooldown_hours INTEGER;
`
  },
  {
    id: '007_drops',
    sql: `
CREATE TABLE IF NOT EXISTS drops (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  dropper_user_id INTEGER NOT NULL,
  picker_user_id INTEGER,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  picked_at TEXT,
  FOREIGN KEY (dropper_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (picker_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_drops_channel_active ON drops(channel_id, picked_at);
CREATE INDEX IF NOT EXISTS idx_drops_guild ON drops(guild_id);
`
  },
  {
    id: '008_trivia_require_multiple_players',
    sql: `
ALTER TABLE guild_settings ADD COLUMN trivia_require_multiple_players INTEGER;
`
  },
  {
    id: '009_reminders',
    sql: `
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  guild_id TEXT,
  remind_at INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
`
  },
  {
    id: '010_runtime_reliability',
    sql: `
ALTER TABLE reminders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE reminders ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reminders ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE reminders ADD COLUMN last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_reminders_status_due ON reminders(status, remind_at);

CREATE TABLE IF NOT EXISTS interaction_dedup (
  interaction_id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interaction_dedup_expires_at ON interaction_dedup(expires_at);
`
  },
  {
    id: '011_tag_reward_cooldown',
    sql: `
ALTER TABLE tag_reward_claims ADD COLUMN status TEXT NOT NULL DEFAULT 'claimed';
`
  },
  {
    id: '012_tasks_marketplace',
    sql: `
CREATE TABLE IF NOT EXISTS marketplace_tasks (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL,
  assignee_user_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  bounty_amount INTEGER NOT NULL CHECK (bounty_amount > 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'submitted', 'disputed', 'approved', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  cancelled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_decline_reason TEXT,
  last_declined_at TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_submissions (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL,
  assignee_user_id INTEGER NOT NULL,
  proof_text TEXT NOT NULL,
  proof_link TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by_user_id INTEGER,
  decline_reason TEXT,
  FOREIGN KEY (task_id) REFERENCES marketplace_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_disputes (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL,
  submission_id INTEGER NOT NULL,
  opened_by_user_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved_approve', 'resolved_refund', 'resolved_continue')),
  reason TEXT NOT NULL,
  resolution_note TEXT,
  resolved_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (task_id) REFERENCES marketplace_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id) REFERENCES task_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (opened_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_marketplace_tasks_guild_status_id ON marketplace_tasks(guild_id, status, id DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_tasks_owner_guild_created ON marketplace_tasks(owner_user_id, guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_tasks_assignee_guild_status ON marketplace_tasks(assignee_user_id, guild_id, status);
CREATE INDEX IF NOT EXISTS idx_task_submissions_task_id_desc ON task_submissions(task_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_submissions_pending_unique ON task_submissions(task_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_disputes_open_unique ON task_disputes(task_id) WHERE status = 'open';
`
  },
  {
    id: '013_task_applications',
    sql: `
CREATE TABLE IF NOT EXISTS task_applications (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL,
  applicant_user_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by_user_id INTEGER,
  review_note TEXT,
  FOREIGN KEY (task_id) REFERENCES marketplace_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_applications_task_status ON task_applications(task_id, status, id DESC);
CREATE INDEX IF NOT EXISTS idx_task_applications_applicant ON task_applications(applicant_user_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_applications_pending_unique
  ON task_applications(task_id, applicant_user_id)
  WHERE status = 'pending';
`
  },
  {
    id: '014_notifications_overhaul',
    sql: `
CREATE TABLE IF NOT EXISTS notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  source_channel_id TEXT,
  recipient_user_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dm_only', 'dm_fallback')),
  payload_json TEXT NOT NULL,
  dedupe_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'dead')) DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_attempt_at INTEGER,
  last_error TEXT,
  delivered_via TEXT CHECK (delivered_via IN ('dm', 'channel_fallback')),
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);

CREATE TABLE IF NOT EXISTS guild_notification_defaults (
  guild_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('off', 'dm_only', 'dm_fallback')),
  updated_by_user_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, event_type)
);

CREATE TABLE IF NOT EXISTS user_notification_overrides (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('inherit', 'off', 'dm_only', 'dm_fallback')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_due
  ON notification_outbox(status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_recipient
  ON notification_outbox(recipient_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_outbox_dedupe
  ON notification_outbox(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guild_notification_defaults_lookup
  ON guild_notification_defaults(guild_id, event_type);
CREATE INDEX IF NOT EXISTS idx_user_notification_overrides_lookup
  ON user_notification_overrides(guild_id, user_id, event_type);
`
  },
  {
    id: '015_daily_challenges',
    sql: `
ALTER TABLE guild_settings ADD COLUMN challenge_channel_id TEXT;
ALTER TABLE guild_settings ADD COLUMN challenge_reward INTEGER;

CREATE TABLE IF NOT EXISTS daily_challenges (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  prompt_key TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  reward_amount INTEGER NOT NULL CHECK (reward_amount > 0),
  challenge_date TEXT NOT NULL,
  last_posted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_challenge_completions (
  id INTEGER PRIMARY KEY,
  challenge_id INTEGER NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_challenges_guild_date
  ON daily_challenges(guild_id, challenge_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_challenges_active
  ON daily_challenges(status, guild_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_daily_challenges_channel_active
  ON daily_challenges(channel_id, status)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_daily_challenge_completions_challenge
  ON daily_challenge_completions(challenge_id);
`
  },
  {
    id: '016_daily_challenge_bans',
    sql: `
CREATE TABLE IF NOT EXISTS daily_challenge_bans (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_challenge_bans_guild_user
  ON daily_challenge_bans(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_daily_challenge_bans_expires
  ON daily_challenge_bans(expires_at)
  WHERE expires_at IS NOT NULL;
`
  },
  {
    id: '017_user_guilds',
    sql: `
CREATE TABLE IF NOT EXISTS user_guilds (
  discord_user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (discord_user_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_user_guilds_guild
  ON user_guilds(guild_id);
`
  },
  {
    id: '018_backfill_user_guilds',
    sql: `
INSERT OR IGNORE INTO user_guilds (discord_user_id, guild_id, last_seen_at)
SELECT DISTINCT u.discord_user_id, ts.guild_id, CURRENT_TIMESTAMP
FROM trivia_scores ts
INNER JOIN users u ON u.id = ts.user_id
WHERE ts.guild_id IS NOT NULL;

INSERT OR IGNORE INTO user_guilds (discord_user_id, guild_id, last_seen_at)
SELECT DISTINCT u.discord_user_id, si.guild_id, CURRENT_TIMESTAMP
FROM shop_inventory si
INNER JOIN users u ON u.id = si.user_id
WHERE si.guild_id IS NOT NULL;

INSERT OR IGNORE INTO user_guilds (discord_user_id, guild_id, last_seen_at)
SELECT DISTINCT u.discord_user_id, d.guild_id, CURRENT_TIMESTAMP
FROM drops d
INNER JOIN users u ON u.id = d.dropper_user_id
WHERE d.guild_id IS NOT NULL;

INSERT OR IGNORE INTO user_guilds (discord_user_id, guild_id, last_seen_at)
SELECT DISTINCT u.discord_user_id, d.guild_id, CURRENT_TIMESTAMP
FROM drops d
INNER JOIN users u ON u.id = d.picker_user_id
WHERE d.guild_id IS NOT NULL AND d.picker_user_id IS NOT NULL;

INSERT OR IGNORE INTO user_guilds (discord_user_id, guild_id, last_seen_at)
SELECT DISTINCT u.discord_user_id, mt.guild_id, CURRENT_TIMESTAMP
FROM marketplace_tasks mt
INNER JOIN users u ON u.id = mt.owner_user_id
WHERE mt.guild_id IS NOT NULL;

INSERT OR IGNORE INTO user_guilds (discord_user_id, guild_id, last_seen_at)
SELECT DISTINCT u.discord_user_id, mt.guild_id, CURRENT_TIMESTAMP
FROM marketplace_tasks mt
INNER JOIN users u ON u.id = mt.assignee_user_id
WHERE mt.guild_id IS NOT NULL AND mt.assignee_user_id IS NOT NULL;
`
  },
  {
    id: '019_clear_user_guilds_backfill',
    sql: `
DELETE FROM user_guilds;
`
  },
  {
    id: '020_remove_ghost_users_from_guild',
    // Production-only data cleanup. The original removed a list of specific
    // Discord user IDs; that list is omitted from this public snapshot. The id
    // is kept so the migration sequence matches production.
    sql: `SELECT 1;`
  },
  {
    id: '021_expunge_ghost_users',
    // Production-only data cleanup (deleted the same users from marketplace_tasks,
    // user_guilds and users, RESTRICT-FK tables first). User IDs omitted here.
    sql: `SELECT 1;`
  },
  {
    id: '022_vault_privacy',
    sql: `ALTER TABLE guild_settings ADD COLUMN vault_private INTEGER;`
  },
  {
    id: '023_streaks',
    sql: `
CREATE TABLE IF NOT EXISTS streaks (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('timely', 'prayer')),
  count INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  last_day TEXT,
  PRIMARY KEY (user_id, kind),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_streaks_kind_count ON streaks (kind, count DESC);
`
  },
  {
    id: '024_weekly_digest',
    sql: `
ALTER TABLE guild_settings ADD COLUMN digest_channel_id TEXT;
ALTER TABLE guild_settings ADD COLUMN digest_last_posted TEXT;
`
  },
  {
    id: '025_bounty_rework',
    sql: `
-- Bounty rework: the apply/assign/submit/approve flow is retired.
-- Refund escrow for every non-terminal task and cancel it, then drop
-- the tables owned by the old flow.
INSERT INTO transactions (user_id, amount, kind, subtype, note)
SELECT owner_user_id, bounty_amount, 'task_bounty_refund', 'flow_migration', 'bounty rework refund: task #' || id
FROM marketplace_tasks
WHERE status IN ('open', 'in_progress', 'submitted', 'disputed');

UPDATE wallets
SET balance = balance + (
  SELECT COALESCE(SUM(bounty_amount), 0)
  FROM marketplace_tasks mt
  WHERE mt.owner_user_id = wallets.user_id
    AND mt.status IN ('open', 'in_progress', 'submitted', 'disputed')
)
WHERE user_id IN (
  SELECT owner_user_id FROM marketplace_tasks
  WHERE status IN ('open', 'in_progress', 'submitted', 'disputed')
);

UPDATE marketplace_tasks
SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE status IN ('open', 'in_progress', 'submitted', 'disputed');

DROP TABLE IF EXISTS task_applications;
DROP TABLE IF EXISTS task_submissions;
DROP TABLE IF EXISTS task_disputes;
`
  },
  {
    id: '026_timely_streak_window',
    sql: `
-- Timely streaks count consecutive claims (within 2x cooldown), not days.
ALTER TABLE streaks ADD COLUMN last_claim_at TEXT;
UPDATE streaks SET last_claim_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE kind = 'timely';
`
  },
  {
    id: '027_drop_delete_command',
    sql: `ALTER TABLE guild_settings ADD COLUMN drop_delete_command INTEGER;`
  },
  {
    id: '028_reaction_roles',
    sql: `
CREATE TABLE IF NOT EXISTS reaction_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  emoji_key TEXT NOT NULL,
  emoji_display TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (message_id, emoji_key)
);
CREATE INDEX IF NOT EXISTS idx_reaction_roles_guild ON reaction_roles (guild_id, message_id);
`
  },
  {
    id: '029_ledger_scope_and_daily_stats',
    sql: `
-- Per-server attribution for ledger rows (filled going forward from the command scope).
ALTER TABLE transactions ADD COLUMN guild_id TEXT;
ALTER TABLE transactions ADD COLUMN channel_id TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_guild_created_at ON transactions (guild_id, created_at);

-- Daily metric snapshots. guild_id '' = global.
CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT NOT NULL,
  guild_id TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (date, guild_id, metric)
);
CREATE INDEX IF NOT EXISTS idx_daily_stats_metric_date ON daily_stats (guild_id, metric, date);
`
  }
];
