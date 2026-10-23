import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { logger } from '../logging/logger.js';
import { migrations } from './migrations.js';

export type SqliteDb = BetterSqlite3.Database;

export class Database {
  readonly sqlite: SqliteDb;

  constructor(dbPath: string) {
    const absolutePath = path.resolve(dbPath);
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.sqlite = new BetterSqlite3(absolutePath);
    this.configure();
    this.applyMigrations();
  }

  private configure(): void {
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('synchronous = NORMAL');
    this.sqlite.pragma('busy_timeout = 5000');
  }

  private applyMigrations(): void {
    this.sqlite.exec(
      `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      `
    );

    const hasMigration = this.sqlite.prepare('SELECT 1 FROM schema_migrations WHERE id = ? LIMIT 1');
    const recordMigration = this.sqlite.prepare('INSERT INTO schema_migrations (id) VALUES (?)');

    for (const migration of migrations) {
      const alreadyApplied = hasMigration.get(migration.id);
      if (alreadyApplied) {
        continue;
      }

      const tx = this.sqlite.transaction(() => {
        this.sqlite.exec(migration.sql);
        recordMigration.run(migration.id);
      });

      tx();
      logger.info({ migrationId: migration.id }, 'Applied database migration');
    }
  }

  transaction<T>(fn: () => T): T {
    return this.sqlite.transaction(fn)();
  }

  close(): void {
    this.sqlite.close();
  }
}
