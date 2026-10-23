import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppContainer } from '../app/container.js';
import { deleteInvokingMessage, replyDetached } from '../commands/shared.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-drop-cleanup-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
}

function fakeCtx(overrides: Record<string, unknown> = {}): any {
  return {
    fullCommandName: 'drop',
    author: { id: 'u1', username: 'tester' },
    channelId: 'c1',
    message: { id: 'm1', content: '.drop 500' },
    client: {
      messages: {
        write: vi.fn(async () => ({ id: 'bot-msg' })),
        delete: vi.fn(async () => undefined)
      }
    },
    editOrReply: vi.fn(async () => ({ id: 'reply' })),
    ...overrides
  };
}

describe('deleteInvokingMessage', () => {
  it('deletes the prefix message and reports success', async () => {
    const ctx = fakeCtx();
    await expect(deleteInvokingMessage(ctx)).resolves.toBe(true);
    expect(ctx.client.messages.delete).toHaveBeenCalledWith('c1', 'm1', expect.any(String));
  });

  it('is a no-op for slash invocations (no message)', async () => {
    const ctx = fakeCtx({ message: undefined });
    await expect(deleteInvokingMessage(ctx)).resolves.toBe(false);
    expect(ctx.client.messages.delete).not.toHaveBeenCalled();
  });

  it('swallows API failures such as missing Manage Messages', async () => {
    const ctx = fakeCtx();
    ctx.client.messages.delete = vi.fn(async () => {
      throw new Error('Missing Permissions');
    });
    await expect(deleteInvokingMessage(ctx)).resolves.toBe(false);
  });
});

describe('replyDetached', () => {
  it('posts a standalone channel message for prefix invocations', async () => {
    const ctx = fakeCtx();
    await replyDetached(ctx, 'hello', { title: 'Currency Dropped!', tone: 'success' });
    expect(ctx.client.messages.write).toHaveBeenCalledTimes(1);
    const [channelId, payload] = ctx.client.messages.write.mock.calls[0];
    expect(channelId).toBe('c1');
    expect(payload.embeds[0].description).toBe('hello');
    expect(payload.embeds[0].title).toContain('Currency Dropped!');
    expect(ctx.editOrReply).not.toHaveBeenCalled();
  });

  it('falls back to editOrReply for slash invocations', async () => {
    const ctx = fakeCtx({ message: undefined });
    await replyDetached(ctx, 'hello');
    expect(ctx.editOrReply).toHaveBeenCalledTimes(1);
    expect(ctx.client.messages.write).not.toHaveBeenCalled();
  });
});

describe('dropDeleteCommand guild setting', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];

  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  it('defaults to on and can be turned off per guild', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });
    const svc = container.guildSettingsService;

    expect(svc.getEffectiveSettings('g1').dropDeleteCommand).toBe(true);
    expect(svc.getEffectiveSettings(null).dropDeleteCommand).toBe(true);

    const set = svc.setSetting('g1', 'dropDeleteCommand', 'false');
    expect(set.ok).toBe(true);
    expect(svc.getEffectiveSettings('g1').dropDeleteCommand).toBe(false);
    expect(svc.getEffectiveSettings('g2').dropDeleteCommand).toBe(true);

    expect(svc.resetSetting('g1', 'dropDeleteCommand').ok).toBe(true);
    expect(svc.getEffectiveSettings('g1').dropDeleteCommand).toBe(true);
  });
});
