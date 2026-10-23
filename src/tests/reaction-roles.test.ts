import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppContainer } from '../app/container.js';
import { handleReaction } from '../infra/discord/reactionRoles.js';
import {
  emojiKeyFromReaction,
  parseEmojiInput,
  parseMessageRef,
  parsePanelLines,
  resolvableFromBinding,
  roleNameKey
} from '../modules/reaction-roles/parse.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-rr-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}
function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const c = `${dbPath}${suffix}`;
    if (fs.existsSync(c)) fs.unlinkSync(c);
  }
}

describe('emoji parsing', () => {
  it('normalises unicode emoji with and without variation selectors to one key', () => {
    expect(parseEmojiInput('📈')?.key).toBe('u:📈');
    expect(parseEmojiInput('📈️')?.key).toBe('u:📈');
    expect(emojiKeyFromReaction({ id: null, name: '📈️' })).toBe('u:📈');
  });

  it('handles keycap and ZWJ sequences', () => {
    expect(parseEmojiInput('1️⃣')?.key).toBe('u:1⃣');
    expect(parseEmojiInput('👨‍💻')).not.toBeNull();
    expect(parseEmojiInput('🇵🇰')).not.toBeNull();
  });

  it('parses custom emoji tags', () => {
    const e = parseEmojiInput('<a:party:123456789012345678>');
    expect(e?.key).toBe('c:123456789012345678');
    expect(e?.resolvable).toEqual({ id: '123456789012345678', name: 'party', animated: true });
    expect(emojiKeyFromReaction({ id: '123456789012345678', name: 'party' })).toBe('c:123456789012345678');
  });

  it('rejects text and multi-emoji input', () => {
    expect(parseEmojiInput('hello')).toBeNull();
    expect(parseEmojiInput('💻📚')).toBeNull();
    expect(parseEmojiInput('')).toBeNull();
  });

  it('rebuilds a REST resolvable from a stored binding', () => {
    expect(resolvableFromBinding({ emojiKey: 'u:💻', emojiDisplay: '💻' })).toBe('💻');
    expect(resolvableFromBinding({ emojiKey: 'c:1', emojiDisplay: '<:x:1>' })).toEqual({ id: '1', name: 'x', animated: false });
  });
});

describe('message refs', () => {
  it('parses links and bare ids', () => {
    expect(parseMessageRef('https://discord.com/channels/100000000000000001/111/222')).toEqual({
      guildId: '100000000000000001',
      channelId: '111',
      messageId: '222'
    });
    expect(parseMessageRef('1384000000000000000')).toEqual({ guildId: null, channelId: null, messageId: '1384000000000000000' });
    expect(parseMessageRef('nope')).toBeNull();
  });
});

describe('panel parsing (legacy Nadeko layout)', () => {
  const panel = [
    'Computer-Programming 💻',
    'Math 🔢',
    'Statistics 📈',
    'Computer-Networking 🖥️',
    'Physics 🔭',
    'Study-Break 📚 (This will mute and block you from all text channels)',
    'Discussion ☕',
    '',
    'These roles are only there for you to be pinged when someone needs help.',
    '📝 - Literature',
    '🎙️: Lecture'
  ].join('\n');

  it('extracts role names and emoji from every valid line', () => {
    const lines = parsePanelLines(panel);
    expect(lines.map((l) => l.roleName)).toEqual([
      'Computer-Programming',
      'Math',
      'Statistics',
      'Computer-Networking',
      'Physics',
      'Study-Break',
      'Discussion',
      'Literature',
      'Lecture'
    ]);
    expect(lines.find((l) => l.roleName === 'Computer-Networking')?.emoji.key).toBe('u:🖥');
    expect(lines.find((l) => l.roleName === 'Computer-Programming')?.emoji.key).toBe('u:💻');
  });

  it('matches role names loosely', () => {
    expect(roleNameKey('Computer-Programming')).toBe(roleNameKey('computer programming'));
    expect(roleNameKey('Study_Break')).toBe(roleNameKey('Study-Break'));
  });
});

describe('reaction role service + handler', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];
  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  function boot() {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });
    return container;
  }

  function fakeClient(app: AppContainer) {
    return {
      botId: 'bot',
      options: { context: () => ({ app }) },
      members: { addRole: vi.fn(async () => undefined), removeRole: vi.fn(async () => undefined) }
    };
  }

  it('binds, lists, resolves and unbinds', () => {
    const svc = boot().reactionRolesService;
    const r = svc.bind({ guildId: 'g', channelId: 'c', messageId: 'm', emojiKey: 'u:💻', emojiDisplay: '💻', roleId: 'r1', createdBy: 'admin' });
    expect(r.ok).toBe(true);
    expect(svc.listForMessage('g', 'm')).toHaveLength(1);

    const again = svc.bind({ guildId: 'g', channelId: 'c', messageId: 'm', emojiKey: 'u:💻', emojiDisplay: '💻', roleId: 'r2', createdBy: 'admin' });
    expect(again.ok && again.replaced).toBe(true);
    expect(svc.listForMessage('g', 'm')[0]?.roleId).toBe('r2');

    expect(svc.resolve({ guildId: 'g', messageId: 'm', emojiKey: 'u:💻', userId: 'u', isBot: false, botId: 'bot' })).toMatchObject({ action: 'apply' });
    expect(svc.resolve({ guildId: 'g', messageId: 'm', emojiKey: 'u:📚', userId: 'u', isBot: false, botId: 'bot' })).toMatchObject({ action: 'ignore', reason: 'unbound' });
    expect(svc.resolve({ guildId: 'g', messageId: 'm', emojiKey: 'u:💻', userId: 'bot', isBot: false, botId: 'bot' })).toMatchObject({ action: 'ignore', reason: 'bot' });
    expect(svc.resolve({ guildId: null, messageId: 'm', emojiKey: 'u:💻', userId: 'u', isBot: false, botId: 'bot' })).toMatchObject({ action: 'ignore', reason: 'no_guild' });

    expect(svc.unbind('g', 'm', 'u:💻')).toBe(true);
    expect(svc.listForGuild('g')).toHaveLength(0);
  });

  it('caps bindings per message at Discord’s reaction limit', () => {
    const svc = boot().reactionRolesService;
    for (let i = 0; i < 20; i++) {
      expect(svc.bind({ guildId: 'g', channelId: 'c', messageId: 'm', emojiKey: `u:${i}`, emojiDisplay: String(i), roleId: `r${i}`, createdBy: 'a' }).ok).toBe(true);
    }
    expect(svc.bind({ guildId: 'g', channelId: 'c', messageId: 'm', emojiKey: 'u:x', emojiDisplay: 'x', roleId: 'rx', createdBy: 'a' }).ok).toBe(false);
  });

  it('adds and removes roles from gateway reaction payloads', async () => {
    const app = boot();
    app.reactionRolesService.bind({ guildId: 'g', channelId: 'c', messageId: 'm', emojiKey: 'u:💻', emojiDisplay: '💻', roleId: 'r1', createdBy: 'a' });
    const client = fakeClient(app);
    const base = { guildId: 'g', messageId: 'm', channelId: 'c', userId: 'u1', emoji: { id: null, name: '💻️' } };

    await handleReaction('add', { ...base, member: { user: { bot: false }, roles: [] } }, client);
    expect(client.members.addRole).toHaveBeenCalledWith('g', 'u1', 'r1');

    await handleReaction('remove', base, client);
    expect(client.members.removeRole).toHaveBeenCalledWith('g', 'u1', 'r1');
  });

  it('skips bots, users who already have the role, and unbound emoji', async () => {
    const app = boot();
    app.reactionRolesService.bind({ guildId: 'g', channelId: 'c', messageId: 'm', emojiKey: 'u:💻', emojiDisplay: '💻', roleId: 'r1', createdBy: 'a' });
    const client = fakeClient(app);
    const base = { guildId: 'g', messageId: 'm', channelId: 'c', emoji: { id: null, name: '💻' } };

    await handleReaction('add', { ...base, userId: 'b', member: { user: { bot: true }, roles: [] } }, client);
    await handleReaction('add', { ...base, userId: 'u1', member: { user: { bot: false }, roles: ['r1'] } }, client);
    await handleReaction('add', { ...base, userId: 'u1', emoji: { id: null, name: '📚' }, member: { user: { bot: false }, roles: [] } }, client);
    expect(client.members.addRole).not.toHaveBeenCalled();
  });

  it('survives API failures without throwing', async () => {
    const app = boot();
    app.reactionRolesService.bind({ guildId: 'g', channelId: 'c', messageId: 'm', emojiKey: 'u:💻', emojiDisplay: '💻', roleId: 'r1', createdBy: 'a' });
    const client = fakeClient(app);
    client.members.addRole = vi.fn(async () => {
      throw new Error('Missing Permissions');
    });
    await expect(handleReaction('add', { guildId: 'g', messageId: 'm', channelId: 'c', userId: 'u1', emoji: { name: '💻' }, member: { user: {}, roles: [] } }, client)).resolves.toBeUndefined();
  });
});
