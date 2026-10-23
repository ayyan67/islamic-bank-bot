import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Where a command is running. Set once at the gateway entry points
 * (interaction + message dispatch) and readable anywhere below without
 * threading ctx through every service signature. Used to stamp ledger rows
 * with guild_id/channel_id for per-server analytics.
 */
export interface CommandScope {
  guildId: string | null;
  channelId: string | null;
}

const storage = new AsyncLocalStorage<CommandScope>();

export function runInCommandScope<T>(scope: CommandScope, fn: () => T): T {
  return storage.run(scope, fn);
}

export function getCommandScope(): CommandScope | undefined {
  return storage.getStore();
}

/** Wrap Seyfert's dispatch entry points so every command/component/prefix run is scoped. */
export function installCommandScope(client: any): void {
  const handler = client?.handleCommand;
  if (!handler) return;

  if (typeof handler.interaction === 'function') {
    const originalInteraction = handler.interaction.bind(handler);
    handler.interaction = (body: any, ...rest: unknown[]) =>
      runInCommandScope(
        { guildId: body?.guild_id ?? body?.guild?.id ?? null, channelId: body?.channel_id ?? body?.channel?.id ?? null },
        () => originalInteraction(body, ...rest)
      );
  }

  if (typeof handler.message === 'function') {
    const originalMessage = handler.message.bind(handler);
    handler.message = (rawMessage: any, ...rest: unknown[]) =>
      runInCommandScope(
        { guildId: rawMessage?.guild_id ?? null, channelId: rawMessage?.channel_id ?? null },
        () => originalMessage(rawMessage, ...rest)
      );
  }
}
