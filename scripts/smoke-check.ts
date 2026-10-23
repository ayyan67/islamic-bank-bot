import { env } from '../src/config/env.js';
import { Database } from '../src/infra/db/database.js';

const REQUIRED_TABLES = [
  'users',
  'wallets',
  'vault_accounts',
  'guild_settings',
  'clubs',
  'club_members',
  'club_applications',
  'club_bans',
  'transactions',
  'prayer_checkins',
  'tag_reward_claims',
  'trivia_scores',
  'admin_users',
  'admin_roles',
  'command_policies',
  'shop_items',
  'shop_item_texts',
  'shop_inventory',
  'drops',
  'reminders',
  'interaction_dedup'
];

function run(): void {
  if (!env.BOT_TOKEN && env.NODE_ENV === 'production') {
    throw new Error('BOT_TOKEN is required in production.');
  }

  const db = new Database(env.DATABASE_PATH);
  try {
    const tables = db.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];

    const tableSet = new Set(tables.map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((name) => !tableSet.has(name));
    if (missing.length > 0) {
      throw new Error(`Missing required tables: ${missing.join(', ')}`);
    }

    const fkOrphans = db.sqlite.pragma('foreign_key_check') as Array<Record<string, unknown>>;
    if (fkOrphans.length > 0) {
      throw new Error(`Foreign key orphan rows detected: ${JSON.stringify(fkOrphans)}`);
    }

    console.log('Smoke check passed');
  } finally {
    db.close();
  }
}

run();
