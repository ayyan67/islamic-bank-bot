export interface GuildSettings {
  guildId: string;
  timelyAmount: number;
  timelyCooldownHours: number;
  prayerReward: number;
  prayerCooldownHours: number;
  prayerAllFiveBonus: number;
  triviaMaxScore: number;
  triviaDelaySeconds: number;
  triviaRewardPerCorrect: number;
  triviaWinBonus: number;
  triviaRevealAnswer: boolean;
  triviaRequireMultiplePlayers: boolean;
  challengeReward: number;
  vaultPrivate: boolean;
  dropDeleteCommand: boolean;
}

export type GuildSettingKey = keyof Omit<GuildSettings, 'guildId'>;

export interface GuildSettingMeta {
  key: GuildSettingKey;
  dbColumn: string;
  label: string;
  type: 'integer' | 'boolean';
  min?: number;
  max?: number;
}

export const GUILD_SETTING_DEFS: readonly GuildSettingMeta[] = [
  { key: 'timelyAmount', dbColumn: 'timely_amount', label: 'Timely reward amount', type: 'integer', min: 0, max: 1_000_000 },
  { key: 'timelyCooldownHours', dbColumn: 'timely_cooldown_hours', label: 'Timely cooldown (hours)', type: 'integer', min: 0, max: 720 },
  { key: 'prayerReward', dbColumn: 'prayer_reward', label: 'Prayer reward amount', type: 'integer', min: 0, max: 1_000_000 },
  { key: 'prayerCooldownHours', dbColumn: 'prayer_cooldown_hours', label: 'Prayer cooldown (hours)', type: 'integer', min: 0, max: 720 },
  { key: 'prayerAllFiveBonus', dbColumn: 'prayer_all_five_bonus', label: 'All-five-prayers bonus', type: 'integer', min: 0, max: 1_000_000 },
  { key: 'triviaMaxScore', dbColumn: 'trivia_max_score', label: 'Trivia win score', type: 'integer', min: 1, max: 100 },
  { key: 'triviaDelaySeconds', dbColumn: 'trivia_delay_seconds', label: 'Trivia answer time (seconds)', type: 'integer', min: 5, max: 300 },
  { key: 'triviaRewardPerCorrect', dbColumn: 'trivia_reward_per_correct', label: 'Trivia reward per correct', type: 'integer', min: 0, max: 1_000_000 },
  { key: 'triviaWinBonus', dbColumn: 'trivia_win_bonus', label: 'Trivia win bonus', type: 'integer', min: 0, max: 1_000_000 },
  { key: 'triviaRevealAnswer', dbColumn: 'trivia_reveal_answer', label: 'Reveal answer on timeout', type: 'boolean' },
  { key: 'triviaRequireMultiplePlayers', dbColumn: 'trivia_require_multiple_players', label: 'Require 2+ players for trivia rewards', type: 'boolean' },
  { key: 'challengeReward', dbColumn: 'challenge_reward', label: 'Daily challenge reward', type: 'integer', min: 100, max: 1_000_000 },
  { key: 'vaultPrivate', dbColumn: 'vault_private', label: 'Hide vault balances from other users', type: 'boolean' },
  { key: 'dropDeleteCommand', dbColumn: 'drop_delete_command', label: 'Delete the .drop message after a successful drop', type: 'boolean' }
] as const;
