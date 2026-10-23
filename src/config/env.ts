import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const boolFromString = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return false;
}, z.boolean());

const intString = (defaultValue: number) => z.coerce.number().int().default(defaultValue);
const csvStringArray = z.preprocess((value) => {
  // Zod applies .default() before preprocess, so an array default must pass through untouched.
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}, z.array(z.string()));

const schema = z.object({
  BOT_TOKEN: z.string().optional().default(''),
  APPLICATION_ID: z.string().optional(),
  OWNER_IDS: csvStringArray.default([]),
  DATABASE_PATH: z.string().default('./data/halal-economy.db'),
  COMMAND_UPLOAD_CACHE_PATH: z.string().default('./data/command-cache.json'),
  ENABLE_PREFIX_ALIASES: boolFromString,
  DEFAULT_PREFIX: z.string().default('.'),
  DEFAULT_LOCALE: z.string().default('en-US'),
  DEFAULT_TIMEZONE: z.string().default('UTC'),
  CURRENCY_NAME: z.string().default('Dinar'),
  CURRENCY_PLURAL: z.string().default('Dinars'),
  CURRENCY_SIGN: z.string().default('💰'),
  TIMELY_AMOUNT: intString(500),
  TIMELY_COOLDOWN_HOURS: intString(1),
  PRAYER_REWARD: intString(500),
  PRAYER_COOLDOWN_HOURS: intString(3),
  PRAYER_ALL_FIVE_BONUS: intString(2000),
  // Guilds where currency can be earned (claims, prayer, trivia, challenges). Wallets are global,
  // so earning anywhere else would let any server owner mint money for the home server.
  ECONOMY_GUILD_IDS: csvStringArray.default(['100000000000000001']),
  HOME_GUILD_NAME: z.string().default('muslim.chat'),
  TAG_REWARD_GUILD_ID: z.string().default('100000000000000001'),
  TAG_REWARD_AMOUNT: intString(3000),
  TAG_REWARD_COOLDOWN_HOURS: intString(24),
  TRIVIA_LISTS_PATH: z.string().default('./assets/trivia'),
  HANGMAN_WORDS_PATH: z.string().default('./assets/hangman'),
  TRIVIA_MAX_SCORE: intString(10),
  TRIVIA_DELAY_SECONDS: intString(15),
  TRIVIA_TIMEOUT_SECONDS: intString(120),
  TRIVIA_REVEAL_ANSWER: boolFromString.default(true),
  TRIVIA_BOT_PLAYS: boolFromString,
  TRIVIA_REWARD_PER_CORRECT: intString(25),
  TRIVIA_WIN_BONUS: intString(100),
  TRIVIA_REQUIRE_MULTIPLE_PLAYERS: boolFromString.default(true),
  TRIVIA_ISLAMIC_BONUS_MULTIPLIER: z.coerce.number().default(1.5),
  COMMAND_COOLDOWN_MS: intString(1500),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SHARD_TOTAL: z.coerce.number().int().positive().optional(),
  SHARD_START: z.coerce.number().int().nonnegative().optional(),
  SHARD_END: z.coerce.number().int().nonnegative().optional()
});

export const env = schema.parse(process.env);
