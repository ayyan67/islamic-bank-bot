import { Client, LimitedMemoryAdapter } from 'seyfert';
import { env } from '../config/env.js';
import { buildMiddlewares } from '../infra/discord/middlewares.js';
import { rewritePrefixContent } from '../infra/discord/prefixRewrite.js';
import { AppContainer } from './container.js';

function isInteractionWindowError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Unknown interaction') ||
    message.includes('Unknown Webhook') ||
    message.includes('Invalid Webhook Token') ||
    message.includes('10062')
  );
}

function getCommandStartedAt(context: any): number {
  const startedAt = (context as { __commandStartedAt?: unknown }).__commandStartedAt;
  return typeof startedAt === 'number' ? startedAt : Date.now();
}

async function safeReplyOnError(context: any, content: string): Promise<void> {
  try {
    await context.editOrReply({ content });
  } catch {
    // Interaction token may already be invalid or expired.
  }
}

export function createBotClient(app: AppContainer): Client {
  const shardConfig =
    typeof env.SHARD_TOTAL === 'number'
      ? {
          start: env.SHARD_START ?? 0,
          end: env.SHARD_END ?? env.SHARD_TOTAL - 1,
          total: env.SHARD_TOTAL
        }
      : undefined;

  const client = new Client({
    shards: shardConfig,
    context: () => ({ app }),
    globalMiddlewares: [
      'authz',
      'idempotency',
      'interactionSla',
      'backpressure',
      'commandPolicy',
      'cooldown',
      'audit'
    ],
    commands: {
      prefix: async () => (env.ENABLE_PREFIX_ALIASES ? [env.DEFAULT_PREFIX] : []),
      deferReplyResponse: async () => ({ content: 'Working on it...' }),
      reply: async () => true,
      defaults: {
        async onOptionsError(context, metadata) {
          const missing = Object.entries(metadata as Record<string, { failed: boolean }>)
            .filter(([, v]) => v.failed)
            .map(([k]) => k);
          const msg =
            missing.length > 0
              ? `Missing or invalid options: ${missing.join(', ')}. Use /help for usage info.`
              : 'Invalid command options.';
          await safeReplyOnError(context, msg);
        },
        async onPermissionsFail(context) {
          await safeReplyOnError(
            context,
            'You do not have the required permissions for this command.'
          );
        },
        async onRunError(context, error) {
          app.metrics.recordCommandEvent(
            context.fullCommandName ?? context.command?.name ?? 'unknown',
            'error',
            Math.max(0, Date.now() - getCommandStartedAt(context))
          );

          app.logger.error(
            {
              command: context.fullCommandName,
              userId: context.author.id,
              guildId: context.guildId ?? null,
              error
            },
            'Command execution failed'
          );

          if (isInteractionWindowError(error)) {
            app.logger.warn(
              {
                command: context.fullCommandName,
                userId: context.author.id
              },
              'Interaction token expired or invalid while replying'
            );
            return;
          }

          await safeReplyOnError(context, 'Something went wrong while executing that command.');
        },
        async onMiddlewaresError(context, error) {
          app.metrics.recordCommandEvent(
            context.fullCommandName ?? context.command?.name ?? 'unknown',
            'error',
            Math.max(0, Date.now() - getCommandStartedAt(context))
          );

          app.logger.warn(
            {
              command: context.fullCommandName,
              userId: context.author.id,
              error
            },
            'Command middleware blocked execution'
          );

          await safeReplyOnError(context, 'Command request was blocked by runtime safety checks.');
        },
        async onInternalError(_client, command, error) {
          app.logger.error({ command: command.name, error }, 'Internal command runtime error');
        }
      }
    }
  });

  // Attach app to client for access in autocomplete callbacks
  (client as any).__app = app;

  client.setServices({
    middlewares: buildMiddlewares(app),
    cache: {
      adapter: new LimitedMemoryAdapter<string>({
        default: { limit: 1000, expire: 60_000 },
        guild: { limit: 200, expire: 300_000 },
        user: { limit: 2000, expire: 300_000 },
        member: { limit: 1000, expire: 120_000 },
        role: { limit: 500, expire: 300_000 },
        channel: { limit: 1000, expire: 300_000 }
      }),
      disabledCache: {
        messages: true,
        presences: true,
        voiceStates: true,
        bans: true,
        emojis: true,
        overwrites: true,
        stageInstances: true,
        stickers: true
      }
    }
  });

  const originalParseError = client.rest.parseError.bind(client.rest);
  client.rest.parseError = (method, route, response, result) => {
    if ([401, 403, 429].includes(response.status)) {
      app.metrics.recordInvalidRequest();
    }

    return originalParseError(method, route, response, result);
  };

  client.rest.onRatelimit = async (response, request) => {
    app.metrics.recordRateLimited();
    app.metrics.recordInvalidRequest();

    const retryAfter = response.headers.get('retry-after') ?? 'unknown';
    app.logger.warn(
      {
        status: response.status,
        retryAfter,
        route: request.route ?? null
      },
      'Discord REST rate limit encountered'
    );
  };

  return client;
}

export function installPrefixAliases(client: Client): void {
  if (!env.ENABLE_PREFIX_ALIASES) return;

  const handler = (client as any).handleCommand;
  if (!handler) return;

  const prefix = env.DEFAULT_PREFIX;
  const originalMessage = handler.message.bind(handler);
  handler.message = async (rawMessage: any, shardId: number) => {
    if (rawMessage.content?.startsWith(prefix)) {
      rawMessage.content = rewritePrefixContent(rawMessage.content, prefix);
    }
    return originalMessage(rawMessage, shardId);
  };
}
