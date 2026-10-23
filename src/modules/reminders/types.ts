export interface ReminderRow {
  id: number;
  user_id: number;
  discord_user_id: string;
  channel_id: string;
  guild_id: string | null;
  remind_at: number;
  message: string;
  status: 'pending' | 'processing';
  attempt_count: number;
  last_attempt_at: number | null;
  last_error: string | null;
  created_at: string;
}

export interface ParsedDuration {
  ms: number;
  label: string;
}
