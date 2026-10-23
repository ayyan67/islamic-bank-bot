import { Database } from '../../infra/db/database.js';
import { ClubApplicationView, ClubMemberView, ClubMembership, ClubSummary } from './types.js';

interface ClubSummaryRow {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  xp: number;
  owner_user_id: number;
  owner_discord_user_id: string | null;
  owner_username: string | null;
  member_count: number;
}

interface ClubMembershipRow {
  club_id: number;
  user_id: number;
  is_admin: number;
  owner_user_id: number;
}

interface ClubMemberRow {
  user_id: number;
  discord_user_id: string;
  username: string | null;
  is_admin: number;
  joined_at: string;
}

interface ClubApplicationRow {
  club_id: number;
  user_id: number;
  discord_user_id: string;
  username: string | null;
  applied_at: string;
}

const CLUB_SUMMARY_SELECT = `
  SELECT
    c.id,
    c.name,
    c.description,
    c.image_url,
    c.xp,
    c.owner_user_id,
    owner.discord_user_id AS owner_discord_user_id,
    owner.username AS owner_username,
    (
      SELECT COUNT(*)
      FROM club_members cm
      WHERE cm.club_id = c.id
    ) AS member_count
  FROM clubs c
  LEFT JOIN users owner ON owner.id = c.owner_user_id
`;

export class ClubsRepository {
  constructor(private readonly db: Database) {}

  getClubById(clubId: number): ClubSummary | undefined {
    const row = this.db.sqlite
      .prepare(
        `${CLUB_SUMMARY_SELECT}
         WHERE c.id = ?
         LIMIT 1`
      )
      .get(clubId) as ClubSummaryRow | undefined;

    return row ? this.mapSummary(row) : undefined;
  }

  getClubByName(name: string): ClubSummary | undefined {
    const row = this.db.sqlite
      .prepare(
        `${CLUB_SUMMARY_SELECT}
         WHERE LOWER(c.name) = LOWER(?)
         LIMIT 1`
      )
      .get(name) as ClubSummaryRow | undefined;

    return row ? this.mapSummary(row) : undefined;
  }

  getClubMembershipForUser(userId: number): ClubMembership | undefined {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT cm.club_id, cm.user_id, cm.is_admin, c.owner_user_id
        FROM club_members cm
        INNER JOIN clubs c ON c.id = cm.club_id
        WHERE cm.user_id = ?
        LIMIT 1
      `
      )
      .get(userId) as ClubMembershipRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      clubId: row.club_id,
      userId: row.user_id,
      isAdmin: row.is_admin === 1,
      isOwner: row.owner_user_id === row.user_id
    };
  }

  createClub(ownerUserId: number, name: string, description: string | null, createdAt: string): number {
    const result = this.db.sqlite
      .prepare(
        `
        INSERT INTO clubs (owner_user_id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(ownerUserId, name, description, createdAt, createdAt);

    const clubId = Number(result.lastInsertRowid);

    this.db.sqlite
      .prepare(
        `
        INSERT INTO club_members (club_id, user_id, is_admin, joined_at)
        VALUES (?, ?, 1, ?)
      `
      )
      .run(clubId, ownerUserId, createdAt);

    return clubId;
  }

  addMember(clubId: number, userId: number, isAdmin: boolean, joinedAt: string): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO club_members (club_id, user_id, is_admin, joined_at)
        VALUES (?, ?, ?, ?)
      `
      )
      .run(clubId, userId, isAdmin ? 1 : 0, joinedAt);
  }

  removeMember(clubId: number, userId: number): void {
    this.db.sqlite
      .prepare(
        `
        DELETE FROM club_members
        WHERE club_id = ? AND user_id = ?
      `
      )
      .run(clubId, userId);
  }

  countMembers(clubId: number): number {
    const row = this.db.sqlite
      .prepare('SELECT COUNT(*) AS count FROM club_members WHERE club_id = ?')
      .get(clubId) as { count: number };

    return row.count;
  }

  isMember(clubId: number, userId: number): boolean {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT 1
        FROM club_members
        WHERE club_id = ? AND user_id = ?
        LIMIT 1
      `
      )
      .get(clubId, userId);

    return Boolean(row);
  }

  addApplication(clubId: number, userId: number): boolean {
    const result = this.db.sqlite
      .prepare(
        `
        INSERT INTO club_applications (club_id, user_id)
        VALUES (?, ?)
        ON CONFLICT(club_id, user_id) DO NOTHING
      `
      )
      .run(clubId, userId);

    return result.changes > 0;
  }

  hasApplication(clubId: number, userId: number): boolean {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT 1
        FROM club_applications
        WHERE club_id = ? AND user_id = ?
        LIMIT 1
      `
      )
      .get(clubId, userId);

    return Boolean(row);
  }

  removeApplication(clubId: number, userId: number): void {
    this.db.sqlite
      .prepare(
        `
        DELETE FROM club_applications
        WHERE club_id = ? AND user_id = ?
      `
      )
      .run(clubId, userId);
  }

  removeAllApplicationsForUser(userId: number): void {
    this.db.sqlite
      .prepare(
        `
        DELETE FROM club_applications
        WHERE user_id = ?
      `
      )
      .run(userId);
  }

  listApplications(clubId: number): ClubApplicationView[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT ca.club_id, ca.user_id, u.discord_user_id, u.username, ca.applied_at
        FROM club_applications ca
        INNER JOIN users u ON u.id = ca.user_id
        WHERE ca.club_id = ?
        ORDER BY ca.applied_at ASC
      `
      )
      .all(clubId) as ClubApplicationRow[];

    return rows.map((row) => ({
      clubId: row.club_id,
      userId: row.user_id,
      discordUserId: row.discord_user_id,
      username: row.username,
      appliedAt: row.applied_at
    }));
  }

  addBan(clubId: number, userId: number): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO club_bans (club_id, user_id)
        VALUES (?, ?)
        ON CONFLICT(club_id, user_id) DO NOTHING
      `
      )
      .run(clubId, userId);
  }

  removeBan(clubId: number, userId: number): void {
    this.db.sqlite
      .prepare(
        `
        DELETE FROM club_bans
        WHERE club_id = ? AND user_id = ?
      `
      )
      .run(clubId, userId);
  }

  isBanned(clubId: number, userId: number): boolean {
    const row = this.db.sqlite
      .prepare(
        `
        SELECT 1
        FROM club_bans
        WHERE club_id = ? AND user_id = ?
        LIMIT 1
      `
      )
      .get(clubId, userId);

    return Boolean(row);
  }

  updateOwner(clubId: number, newOwnerUserId: number): void {
    this.db.sqlite
      .prepare('UPDATE clubs SET owner_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newOwnerUserId, clubId);

    this.db.sqlite
      .prepare(
        `
        UPDATE club_members
        SET is_admin = CASE
          WHEN user_id = ? THEN 1
          ELSE is_admin
        END
        WHERE club_id = ?
      `
      )
      .run(newOwnerUserId, clubId);
  }

  setAdmin(clubId: number, userId: number, isAdmin: boolean): void {
    this.db.sqlite
      .prepare('UPDATE club_members SET is_admin = ? WHERE club_id = ? AND user_id = ?')
      .run(isAdmin ? 1 : 0, clubId, userId);
  }

  updateDescription(clubId: number, description: string | null): void {
    this.db.sqlite
      .prepare('UPDATE clubs SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(description, clubId);
  }

  updateIcon(clubId: number, imageUrl: string | null): void {
    this.db.sqlite
      .prepare('UPDATE clubs SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(imageUrl, clubId);
  }

  disband(clubId: number): void {
    this.db.sqlite.prepare('DELETE FROM clubs WHERE id = ?').run(clubId);
  }

  listMembers(clubId: number): ClubMemberView[] {
    const rows = this.db.sqlite
      .prepare(
        `
        SELECT cm.user_id, u.discord_user_id, u.username, cm.is_admin, cm.joined_at
        FROM club_members cm
        INNER JOIN users u ON u.id = cm.user_id
        WHERE cm.club_id = ?
        ORDER BY cm.is_admin DESC, cm.joined_at ASC
      `
      )
      .all(clubId) as ClubMemberRow[];

    return rows.map((row) => ({
      userId: row.user_id,
      discordUserId: row.discord_user_id,
      username: row.username,
      isAdmin: row.is_admin === 1,
      joinedAt: row.joined_at
    }));
  }

  getLeaderboard(page: number, pageSize: number): ClubSummary[] {
    const offset = Math.max(0, (page - 1) * pageSize);

    const rows = this.db.sqlite
      .prepare(
        `
        SELECT
          c.id,
          c.name,
          c.description,
          c.image_url,
          c.xp,
          c.owner_user_id,
          owner.discord_user_id AS owner_discord_user_id,
          owner.username AS owner_username,
          COUNT(cm.user_id) AS member_count
        FROM clubs c
        LEFT JOIN users owner ON owner.id = c.owner_user_id
        LEFT JOIN club_members cm ON cm.club_id = c.id
        GROUP BY c.id
        ORDER BY c.xp DESC, member_count DESC, c.id ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(pageSize, offset) as ClubSummaryRow[];

    return rows.map((row) => this.mapSummary(row));
  }

  private mapSummary(row: ClubSummaryRow): ClubSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      xp: row.xp,
      ownerUserId: row.owner_user_id,
      ownerDiscordUserId: row.owner_discord_user_id,
      ownerUsername: row.owner_username,
      memberCount: row.member_count
    };
  }
}
