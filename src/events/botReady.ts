import { createEvent } from 'seyfert';
import type { AppContainer } from '../app/container.js';
import { startGuildPresenceSyncLoop } from '../infra/discord/guildPresenceSync.js';
import { logger } from '../infra/logging/logger.js';

export default createEvent({
  data: {
    name: 'botReady',
    once: true
  },
  run: (_me, client) => {
    logger.info(
      {
        userId: client.botId
      },
      'Bot reported ready'
    );

    const ctxFn = (client as any).options?.context ?? (client as any).context;
    const ctx = typeof ctxFn === 'function' ? (ctxFn() as { app?: AppContainer }) : undefined;
    const app = ctx?.app;

    if (!app) {
      logger.warn('Skipping user_guilds sync because app context is unavailable');
      return;
    }

    startGuildPresenceSyncLoop(client, app);
  }
});
