import { Database } from '../../infra/db/database.js';
import type { TriviaLeaderboardRow } from './types.js';

export class TriviaRepository {
  constructor(private readonly db: Database) {}

  recordCorrectAnswer(userId: number, guildId: string, listName: string): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO trivia_scores (user_id, guild_id, list_name, correct_answers, games_played, updated_at)
        VALUES (?, ?, ?, 1, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, guild_id, list_name)
        DO UPDATE SET
          correct_answers = trivia_scores.correct_answers + 1,
          updated_at = CURRENT_TIMESTAMP
      `
      )
      .run(userId, guildId, listName);
  }

  recordGamePlayed(userId: number, guildId: string, listName: string): void {
    this.db.sqlite
      .prepare(
        `
        INSERT INTO trivia_scores (user_id, guild_id, list_name, games_played, updated_at)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, guild_id, list_name)
        DO UPDATE SET
          games_played = trivia_scores.games_played + 1,
          updated_at = CURRENT_TIMESTAMP
      `
      )
      .run(userId, guildId, listName);
  }

  recordGameWon(userId: number, guildId: string, listName: string): void {
    this.db.sqlite
      .prepare(
        `
        UPDATE trivia_scores
        SET games_won = games_won + 1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND guild_id = ? AND list_name = ?
      `
      )
      .run(userId, guildId, listName);
  }

  getLeaderboard(guildId: string, limit = 10): TriviaLeaderboardRow[] {
    return this.db.sqlite
      .prepare(
        `
        SELECT
          u.discord_user_id,
          u.username,
          SUM(ts.correct_answers) AS total_correct,
          SUM(ts.games_won) AS total_wins,
          SUM(ts.games_played) AS total_games
        FROM trivia_scores ts
        INNER JOIN users u ON u.id = ts.user_id
        WHERE ts.guild_id = ?
        GROUP BY ts.user_id
        ORDER BY total_wins DESC, total_correct DESC
        LIMIT ?
      `
      )
      .all(guildId, limit) as TriviaLeaderboardRow[];
  }

  getLeaderboardByList(guildId: string, listName: string, limit = 10): TriviaLeaderboardRow[] {
    return this.db.sqlite
      .prepare(
        `
        SELECT
          u.discord_user_id,
          u.username,
          ts.correct_answers AS total_correct,
          ts.games_won AS total_wins,
          ts.games_played AS total_games
        FROM trivia_scores ts
        INNER JOIN users u ON u.id = ts.user_id
        WHERE ts.guild_id = ? AND ts.list_name = ?
        ORDER BY ts.games_won DESC, ts.correct_answers DESC
        LIMIT ?
      `
      )
      .all(guildId, listName, limit) as TriviaLeaderboardRow[];
  }
}
