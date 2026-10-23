import { Database } from '../database.js';
import { UserProfileInput, UserRecord } from '../types.js';

interface UserRow {
  id: number;
  discord_user_id: string;
  username: string | null;
  discriminator: string | null;
  avatar_id: string | null;
}

export class IdentityRepository {
  constructor(private readonly db: Database) {}

  ensureUser(profile: UserProfileInput): UserRecord {
    const existing = this.db.sqlite
      .prepare(
        `
        SELECT id, discord_user_id, username, discriminator, avatar_id
        FROM users
        WHERE discord_user_id = ?
        LIMIT 1
      `
      )
      .get(profile.discordUserId) as UserRow | undefined;

    if (existing) {
      const username = profile.username ?? existing.username;
      const discriminator = profile.discriminator ?? existing.discriminator;
      const avatarId = profile.avatarId ?? existing.avatar_id;

      this.db.sqlite
        .prepare(
          `
          UPDATE users
          SET username = ?, discriminator = ?, avatar_id = ?
          WHERE id = ?
        `
        )
        .run(username, discriminator, avatarId, existing.id);

      return {
        id: existing.id,
        discordUserId: existing.discord_user_id,
        username,
        discriminator,
        avatarId
      };
    }

    const insert = this.db.sqlite
      .prepare(
        `
        INSERT INTO users (discord_user_id, username, discriminator, avatar_id)
        VALUES (?, ?, ?, ?)
      `
      )
      .run(
        profile.discordUserId,
        profile.username ?? null,
        profile.discriminator ?? null,
        profile.avatarId ?? null
      );

    const newId = Number(insert.lastInsertRowid);

    this.db.sqlite
      .prepare('INSERT INTO wallets (user_id, balance) VALUES (?, 0) ON CONFLICT(user_id) DO NOTHING')
      .run(newId);

    this.db.sqlite
      .prepare('INSERT INTO vault_accounts (user_id, balance) VALUES (?, 0) ON CONFLICT(user_id) DO NOTHING')
      .run(newId);

    return {
      id: newId,
      discordUserId: profile.discordUserId,
      username: profile.username ?? null,
      discriminator: profile.discriminator ?? null,
      avatarId: profile.avatarId ?? null
    };
  }

  getUserByDiscordId(discordUserId: string): UserRecord | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT id, discord_user_id, username, discriminator, avatar_id
        FROM users
        WHERE discord_user_id = ?
        LIMIT 1
      `
      )
      .get(discordUserId) as UserRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      discordUserId: row.discord_user_id,
      username: row.username,
      discriminator: row.discriminator,
      avatarId: row.avatar_id
    };
  }

  getUserById(userId: number): UserRecord | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT id, discord_user_id, username, discriminator, avatar_id
        FROM users
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(userId) as UserRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      discordUserId: row.discord_user_id,
      username: row.username,
      discriminator: row.discriminator,
      avatarId: row.avatar_id
    };
  }

  trackGuildPresence(discordUserId: string, guildId: string): void {
    this.db.sqlite
      .prepare(
        `INSERT INTO user_guilds (discord_user_id, guild_id, last_seen_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(discord_user_id, guild_id) DO UPDATE SET
           last_seen_at = CURRENT_TIMESTAMP`
      )
      .run(discordUserId, guildId);
  }

  syncGuildMembers(guildId: string, memberDiscordIds: Set<string>): void {
    this.db.transaction(() => {
      const knownUsers = this.db.sqlite
        .prepare('SELECT discord_user_id FROM users')
        .all() as { discord_user_id: string }[];

      const knownSet = new Set(knownUsers.map((u) => u.discord_user_id));
      const clearGuild = this.db.sqlite.prepare('DELETE FROM user_guilds WHERE guild_id = ?');

      const upsert = this.db.sqlite.prepare(
        `INSERT INTO user_guilds (discord_user_id, guild_id, last_seen_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(discord_user_id, guild_id) DO UPDATE SET
           last_seen_at = CURRENT_TIMESTAMP`
      );

      clearGuild.run(guildId);

      for (const discordId of memberDiscordIds) {
        if (knownSet.has(discordId)) {
          upsert.run(discordId, guildId);
        }
      }
    });
  }
}
