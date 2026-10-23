import 'dotenv/config';
import { config } from 'seyfert';
import { GatewayIntentBits } from 'seyfert/lib/types/index.js';

const baseIntents =
  GatewayIntentBits.Guilds | GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildMessageReactions;
const prefixIntents =
  GatewayIntentBits.GuildMessages |
  GatewayIntentBits.MessageContent |
  GatewayIntentBits.DirectMessages;

// Always include message intents — required for trivia answer detection
// GuildMembers — required for startup guild member sync (user_guilds)
// GuildMessageReactions — required for reaction roles (/roles)
const intents = baseIntents | prefixIntents;

export default config.bot({
  token: process.env['BOT_TOKEN'] ?? '',
  applicationId: process.env['APPLICATION_ID'],
  intents,
  debug: process.env['NODE_ENV'] !== 'production',
  locations: {
    base: process.env['NODE_ENV'] === 'production' ? 'dist/src' : 'src',
    commands: 'commands',
    events: 'events'
  }
});
