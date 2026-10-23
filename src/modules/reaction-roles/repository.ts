import type { Database } from '../../infra/db/database.js';
import type { BindInput, ReactionRoleBinding } from './types.js';

interface Row {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string;
  emoji_key: string;
  emoji_display: string;
  role_id: string;
  created_by: string | null;
  created_at: string;
}

function toBinding(row: Row): ReactionRoleBinding {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    emojiKey: row.emoji_key,
    emojiDisplay: row.emoji_display,
    roleId: row.role_id,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export class ReactionRolesRepository {
  constructor(private readonly db: Database) {}

  upsert(input: BindInput): ReactionRoleBinding {
    this.db.sqlite
      .prepare(
        `INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji_key, emoji_display, role_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (message_id, emoji_key) DO UPDATE SET
           role_id = excluded.role_id,
           emoji_display = excluded.emoji_display,
           channel_id = excluded.channel_id,
           created_by = excluded.created_by`
      )
      .run(input.guildId, input.channelId, input.messageId, input.emojiKey, input.emojiDisplay, input.roleId, input.createdBy);
    return this.find(input.messageId, input.emojiKey)!;
  }

  find(messageId: string, emojiKey: string): ReactionRoleBinding | undefined {
    const row = this.db.sqlite
      .prepare('SELECT * FROM reaction_roles WHERE message_id = ? AND emoji_key = ? LIMIT 1')
      .get(messageId, emojiKey) as Row | undefined;
    return row ? toBinding(row) : undefined;
  }

  remove(guildId: string, messageId: string, emojiKey: string): boolean {
    const result = this.db.sqlite
      .prepare('DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji_key = ?')
      .run(guildId, messageId, emojiKey);
    return result.changes > 0;
  }

  removeMessage(guildId: string, messageId: string): number {
    return this.db.sqlite
      .prepare('DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ?')
      .run(guildId, messageId).changes;
  }

  listForMessage(guildId: string, messageId: string): ReactionRoleBinding[] {
    const rows = this.db.sqlite
      .prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ? ORDER BY id ASC')
      .all(guildId, messageId) as Row[];
    return rows.map(toBinding);
  }

  listForGuild(guildId: string): ReactionRoleBinding[] {
    const rows = this.db.sqlite
      .prepare('SELECT * FROM reaction_roles WHERE guild_id = ? ORDER BY channel_id, message_id, id ASC')
      .all(guildId) as Row[];
    return rows.map(toBinding);
  }
}
