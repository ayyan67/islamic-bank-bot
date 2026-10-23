import { Database } from '../../infra/db/database.js';

export type BountyStatus = 'open' | 'in_progress' | 'approved' | 'cancelled';

export interface BountyRow {
  id: number;
  guild_id: string;
  channel_id: string;
  owner_user_id: number;
  assignee_user_id: number | null;
  title: string;
  bounty_amount: number;
  status: BountyStatus;
  created_at: string;
  claimed_at: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  owner_username: string | null;
  owner_discord_user_id: string;
  assignee_username: string | null;
  assignee_discord_user_id: string | null;
}

const SELECT_BOUNTY = `
  SELECT t.id, t.guild_id, t.channel_id, t.owner_user_id, t.assignee_user_id,
         t.title, t.bounty_amount, t.status, t.created_at, t.claimed_at,
         t.approved_at, t.cancelled_at,
         ou.username AS owner_username, ou.discord_user_id AS owner_discord_user_id,
         au.username AS assignee_username, au.discord_user_id AS assignee_discord_user_id
  FROM marketplace_tasks t
  INNER JOIN users ou ON ou.id = t.owner_user_id
  LEFT JOIN users au ON au.id = t.assignee_user_id
`;

export class BountyRepository {
  constructor(private readonly db: Database) {}

  create(guildId: string, channelId: string, ownerUserId: number, title: string, amount: number): number {
    const result = this.db.sqlite
      .prepare(
        `INSERT INTO marketplace_tasks (guild_id, channel_id, owner_user_id, title, description, bounty_amount, status)
         VALUES (?, ?, ?, ?, '', ?, 'open')`
      )
      .run(guildId, channelId, ownerUserId, title, amount);
    return Number(result.lastInsertRowid);
  }

  getById(guildId: string, id: number): BountyRow | undefined {
    return this.db.sqlite
      .prepare(`${SELECT_BOUNTY} WHERE t.id = ? AND t.guild_id = ? LIMIT 1`)
      .get(id, guildId) as BountyRow | undefined;
  }

  listActive(guildId: string, page: number, pageSize: number): BountyRow[] {
    const offset = Math.max(0, (page - 1) * pageSize);
    return this.db.sqlite
      .prepare(
        `${SELECT_BOUNTY}
         WHERE t.guild_id = ? AND t.status IN ('open', 'in_progress')
         ORDER BY t.status ASC, t.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(guildId, pageSize, offset) as BountyRow[];
  }

  countCreatedInWindow(ownerUserId: number, sinceIso: string): number {
    const row = this.db.sqlite
      .prepare('SELECT COUNT(*) AS n FROM marketplace_tasks WHERE owner_user_id = ? AND created_at >= ?')
      .get(ownerUserId, sinceIso) as { n: number };
    return row.n;
  }

  take(id: number, assigneeUserId: number): boolean {
    const result = this.db.sqlite
      .prepare(
        `UPDATE marketplace_tasks
         SET assignee_user_id = ?, status = 'in_progress', claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'open'`
      )
      .run(assigneeUserId, id);
    return result.changes > 0;
  }

  pay(id: number): boolean {
    const result = this.db.sqlite
      .prepare(
        `UPDATE marketplace_tasks
         SET status = 'approved', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'in_progress'`
      )
      .run(id);
    return result.changes > 0;
  }

  cancel(id: number): boolean {
    const result = this.db.sqlite
      .prepare(
        `UPDATE marketplace_tasks
         SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('open', 'in_progress')`
      )
      .run(id);
    return result.changes > 0;
  }
}
