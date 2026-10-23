import { createEvent } from 'seyfert';
import { logger } from '../infra/logging/logger.js';

export default createEvent({
  data: {
    name: 'resumed',
    once: false
  },
  run: (_payload, _client, shardId) => {
    logger.warn({ shardId }, 'Gateway shard resumed after disconnect');
  }
});
