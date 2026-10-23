import { Database } from '../../infra/db/database.js';
import { AdminRoleEntry, AdminUserEntry } from './types.js';

interface AdminUserRow {
  guild_id: string | null;
  user_id: string;
  created_by: string;
  created_at: string;
}

interface AdminRoleRow {
  guild_id: string;
  role_id: string;
  created_by: string;
  created_at: string;
}

export class AccessRepository {
  constructor(private readonly db: Database) {}

  addAdminUser(guildId: string | null, userId: string, createdBy: string): boolean {
    const result = this.db.sqlite
      .prepare(
        `
        INSERT INTO admin_users (guild_id, user_id, created_by)
        SELECT ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1
          FROM admin_users
          WHERE COALESCE(guild_id, '__global__') = COALESCE(?, '__global__')
            AND user_id = ?
        )
      `
      )
      .run(guildId, userId, createdBy, guildId, userId);

    return result.changes > 0;
  }

  removeAdminUser(guildId: string | null, userId: string): boolean {
    const result = this.db.sqlite
      .prepare('DELETE FROM admin_users WHERE guild_id IS ? AND user_id = ?')
      .run(guildId, userId);

    return result.changes > 0;
  }

  addAdminRole(guildId: string, roleId: string, createdBy: string): boolean {
    const result = this.db.sqlite
      .prepare(
        `
        INSERT INTO admin_roles (guild_id, role_id, created_by)
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id, role_id) DO NOTHING
      `
      )
      .run(guildId, roleId, createdBy);

    return result.changes > 0;
  }

  removeAdminRole(guildId: string, roleId: string): boolean {
    const result = this.db.sqlite
      .prepare('DELETE FROM admin_roles WHERE guild_id = ? AND role_id = ?')
      .run(guildId, roleId);

    return result.changes > 0;
  }

  isGlobalAdminUser(userId: string): boolean {
    const row = this.db.sqlite
      .prepare('SELECT 1 FROM admin_users WHERE guild_id IS NULL AND user_id = ? LIMIT 1')
      .get(userId);

    return Boolean(row);
  }

  isGuildAdminUser(guildId: string, userId: string): boolean {
    const row = this.db.sqlite
      .prepare('SELECT 1 FROM admin_users WHERE guild_id = ? AND user_id = ? LIMIT 1')
      .get(guildId, userId);

    return Boolean(row);
  }

  hasGuildAdminRole(guildId: string, roleIds: readonly string[]): boolean {
    if (roleIds.length === 0) {
      return false;
    }

    const placeholders = roleIds.map(() => '?').join(',');
    const row = this.db.sqlite
      .prepare(
        `
        SELECT 1
        FROM admin_roles
        WHERE guild_id = ?
          AND role_id IN (${placeholders})
        LIMIT 1
      `
      )
      .get(guildId, ...roleIds);

    return Boolean(row);
  }

  listGlobalAdminUsers(): AdminUserEntry[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT guild_id, user_id, created_by, created_at
        FROM admin_users
        WHERE guild_id IS NULL
        ORDER BY created_at ASC, user_id ASC
      `
      )
      .all() as AdminUserRow[];

    return rows.map((row) => this.mapAdminUser(row));
  }

  listGuildAdminUsers(guildId: string): AdminUserEntry[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT guild_id, user_id, created_by, created_at
        FROM admin_users
        WHERE guild_id = ?
        ORDER BY created_at ASC, user_id ASC
      `
      )
      .all(guildId) as AdminUserRow[];

    return rows.map((row) => this.mapAdminUser(row));
  }

  listGuildAdminRoles(guildId: string): AdminRoleEntry[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT guild_id, role_id, created_by, created_at
        FROM admin_roles
        WHERE guild_id = ?
        ORDER BY created_at ASC, role_id ASC
      `
      )
      .all(guildId) as AdminRoleRow[];

    return rows.map((row) => this.mapAdminRole(row));
  }

  private mapAdminUser(row: AdminUserRow): AdminUserEntry {
    return {
      guildId: row.guild_id,
      userId: row.user_id,
      createdBy: row.created_by,
      createdAt: row.created_at
    };
  }

  private mapAdminRole(row: AdminRoleRow): AdminRoleEntry {
    return {
      guildId: row.guild_id,
      roleId: row.role_id,
      createdBy: row.created_by,
      createdAt: row.created_at
    };
  }
}
