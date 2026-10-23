import { Database } from '../../infra/db/database.js';
import { AddPolicyInput, CommandPolicyEntry, RemovePolicyInput } from './types.js';

interface PolicyRow {
  id: number;
  guild_id: string;
  command: string;
  subcommand: string | null;
  action: 'allow' | 'deny';
  scope: 'guild' | 'channel' | 'role' | 'user';
  target_id: string | null;
  created_by: string;
  created_at: string;
}

export class PolicyRepository {
  constructor(private readonly db: Database) {}

  addPolicy(input: AddPolicyInput): boolean {
    const result = this.db.sqlite
      .prepare(
        `
        INSERT INTO command_policies (guild_id, command, subcommand, action, scope, target_id, created_by)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1
          FROM command_policies
          WHERE guild_id = ?
            AND command = ?
            AND COALESCE(subcommand, '') = COALESCE(?, '')
            AND action = ?
            AND scope = ?
            AND COALESCE(target_id, '') = COALESCE(?, '')
        )
      `
      )
      .run(
        input.guildId,
        input.command,
        input.subcommand,
        input.action,
        input.scope,
        input.targetId,
        input.createdBy,
        input.guildId,
        input.command,
        input.subcommand,
        input.action,
        input.scope,
        input.targetId
      );

    return result.changes > 0;
  }

  removePolicy(input: RemovePolicyInput): boolean {
    const result = this.db.sqlite
      .prepare(
        `
        DELETE FROM command_policies
        WHERE guild_id = ?
          AND command = ?
          AND COALESCE(subcommand, '') = COALESCE(?, '')
          AND action = ?
          AND scope = ?
          AND COALESCE(target_id, '') = COALESCE(?, '')
      `
      )
      .run(
        input.guildId,
        input.command,
        input.subcommand,
        input.action,
        input.scope,
        input.targetId
      );

    return result.changes > 0;
  }

  listPolicies(guildId: string, command?: string, subcommand?: string | null): CommandPolicyEntry[] {
    if (!command) {
      const rows = this.db.sqlite
        .prepare(
          `
          SELECT id, guild_id, command, subcommand, action, scope, target_id, created_by, created_at
          FROM command_policies
          WHERE guild_id = ?
          ORDER BY command ASC, subcommand ASC, action ASC, scope ASC, target_id ASC
        `
        )
        .all(guildId) as PolicyRow[];

      return rows.map((row) => this.mapRow(row));
    }

    if (typeof subcommand === 'undefined') {
      const rows = this.db.sqlite
        .prepare(
          `
          SELECT id, guild_id, command, subcommand, action, scope, target_id, created_by, created_at
          FROM command_policies
          WHERE guild_id = ?
            AND command = ?
          ORDER BY command ASC, subcommand ASC, action ASC, scope ASC, target_id ASC
        `
        )
        .all(guildId, command) as PolicyRow[];

      return rows.map((row) => this.mapRow(row));
    }

    if (subcommand === null) {
      const rows = this.db.sqlite
        .prepare(
          `
          SELECT id, guild_id, command, subcommand, action, scope, target_id, created_by, created_at
          FROM command_policies
          WHERE guild_id = ?
            AND command = ?
            AND subcommand IS NULL
          ORDER BY command ASC, subcommand ASC, action ASC, scope ASC, target_id ASC
        `
        )
        .all(guildId, command) as PolicyRow[];

      return rows.map((row) => this.mapRow(row));
    }

    const rows = this.db.sqlite
      .prepare(
        `
        SELECT id, guild_id, command, subcommand, action, scope, target_id, created_by, created_at
        FROM command_policies
        WHERE guild_id = ?
          AND command = ?
          AND (subcommand = ? OR subcommand IS NULL)
        ORDER BY command ASC, subcommand ASC, action ASC, scope ASC, target_id ASC
      `
      )
      .all(guildId, command, subcommand) as PolicyRow[];

    return rows.map((row) => this.mapRow(row));
  }

  getApplicablePolicies(guildId: string, command: string, subcommand: string | null): CommandPolicyEntry[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT id, guild_id, command, subcommand, action, scope, target_id, created_by, created_at
        FROM command_policies
        WHERE guild_id = ?
          AND command = ?
          AND (subcommand IS NULL OR subcommand = ?)
      `
      )
      .all(guildId, command, subcommand) as PolicyRow[];

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: PolicyRow): CommandPolicyEntry {
    return {
      id: row.id,
      guildId: row.guild_id,
      command: row.command,
      subcommand: row.subcommand,
      action: row.action,
      scope: row.scope,
      targetId: row.target_id,
      createdBy: row.created_by,
      createdAt: row.created_at
    };
  }
}
