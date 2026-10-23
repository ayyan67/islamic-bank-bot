import type { AppContainer } from '../../app/container.js';
import { logger } from '../logging/logger.js';
import { isDeletedDiscordAccount, type RawDiscordUserLike } from './userValidation.js';

const GUILD_PRESENCE_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface RawAPIMember {
  user?: RawDiscordUserLike;
}

interface SyncClient {
  proxy: {
    guilds(guildId: string): {
      members: {
        get(input: { query: { limit: number; after?: string } }): Promise<RawAPIMember[]>;
      };
    };
    users(userId: string): {
      guilds: {
        get(input: object): Promise<Array<{ id: string }>>;
      };
    };
  };
}

let syncLoopStarted = false;
let syncInFlight = false;

async function fetchAllMemberIds(client: SyncClient, guildId: string): Promise<Set<string>> {
  const memberIds = new Set<string>();
  let after: string | undefined;
  let totalFetched = 0;
  let filtered = 0;

  while (true) {
    const query: { limit: number; after?: string } = { limit: 1000 };
    if (after) {
      query.after = after;
    }

    const raw = await client.proxy.guilds(guildId).members.get({ query });
    if (!raw || raw.length === 0) {
      break;
    }

    totalFetched += raw.length;
    for (const member of raw) {
      if (member.user?.id && !isDeletedDiscordAccount(member.user)) {
        memberIds.add(member.user.id);
      } else {
        filtered++;
      }
    }

    if (raw.length < 1000) {
      break;
    }

    after = raw[raw.length - 1]?.user?.id;
    if (!after) {
      break;
    }
  }

  if (filtered > 0) {
    logger.info(
      { guildId, totalFetched, filtered },
      'Filtered deleted or invalid users from guild presence sync'
    );
  }

  return memberIds;
}

export async function syncAllGuildPresences(
  client: SyncClient,
  app: AppContainer,
  reason: 'startup' | 'interval'
): Promise<void> {
  if (syncInFlight) {
    logger.info({ reason }, 'Skipping user_guilds sync because a previous run is still active');
    return;
  }

  syncInFlight = true;
  const startedAt = Date.now();

  try {
    const guilds = await client.proxy.users('@me').guilds.get({});
    if (!guilds || guilds.length === 0) {
      logger.warn({ reason }, 'No guilds found for user_guilds sync');
      return;
    }

    logger.info({ guildCount: guilds.length, reason }, 'Starting user_guilds sync');

    for (const guild of guilds) {
      const guildId = guild.id;

      try {
        const memberIds = await fetchAllMemberIds(client, guildId);
        app.identityRepo.syncGuildMembers(guildId, memberIds);
        logger.info({ guildId, memberCount: memberIds.size, reason }, 'Synced user_guilds for guild');
      } catch (err) {
        logger.warn({ err, guildId, reason }, 'Failed to sync guild members');
      }
    }

    logger.info(
      { durationMs: Date.now() - startedAt, guildCount: guilds.length, reason },
      'Completed user_guilds sync'
    );
  } finally {
    syncInFlight = false;
  }
}

export function startGuildPresenceSyncLoop(client: SyncClient, app: AppContainer): void {
  if (syncLoopStarted) {
    return;
  }

  syncLoopStarted = true;
  void syncAllGuildPresences(client, app, 'startup');

  const interval = setInterval(() => {
    void syncAllGuildPresences(client, app, 'interval');
  }, GUILD_PRESENCE_SYNC_INTERVAL_MS);

  interval.unref();
}
