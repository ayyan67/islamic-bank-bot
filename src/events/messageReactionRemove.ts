import { createEvent } from 'seyfert';
import { handleReaction } from '../infra/discord/reactionRoles.js';
import { logger } from '../infra/logging/logger.js';

export default createEvent({
  data: { name: 'messageReactionRemove', once: false },
  run: async (reaction, client) => {
    try {
      await handleReaction('remove', reaction as any, client);
    } catch (error) {
      logger.error({ error }, 'messageReactionRemove handler failed');
    }
  }
});
