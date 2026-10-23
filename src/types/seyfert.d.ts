import type { CommandContext, MiddlewareContext } from 'seyfert';
import type { AppContainer } from '../app/container.js';

declare module 'seyfert' {
  interface ExtendContext {
    app: AppContainer;
  }

  interface RegisteredMiddlewares {
    authz: MiddlewareContext<void, CommandContext>;
    idempotency: MiddlewareContext<{ interactionId: string }, CommandContext>;
    interactionSla: MiddlewareContext<void, CommandContext>;
    backpressure: MiddlewareContext<void, CommandContext>;
    cooldown: MiddlewareContext<{ blockedUntil: number }, CommandContext>;
    permissionPolicy: MiddlewareContext<void, CommandContext>;
    commandPolicy: MiddlewareContext<void, CommandContext>;
    audit: MiddlewareContext<void, CommandContext>;
  }
}
