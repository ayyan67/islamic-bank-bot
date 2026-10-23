import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-access-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
    }
  }
}

describe('access and policy services', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];

  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  it('resolves global admin users and guild admin roles', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    container.accessService.addGlobalAdminUser('9001', '1');
    container.accessService.addGuildAdminRole('guild-1', 'role-99', '1');

    expect(container.accessService.isAdmin('9001', 'guild-1', [])).toBe(true);
    expect(container.accessService.isAdmin('1000', 'guild-1', ['role-99'])).toBe(true);
    expect(container.accessService.isAdmin('1000', 'guild-2', ['role-99'])).toBe(false);
  });

  it('applies deny before allow and enforces allowlist semantics', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = 'guild-1';
    const command = 'transfer';

    container.policyService.addPolicy({
      guildId,
      command,
      subcommand: null,
      action: 'allow',
      scope: 'role',
      targetId: 'role-allow',
      createdBy: 'owner'
    });

    const blockedByAllowlist = container.policyService.evaluate({
      guildId,
      command,
      subcommand: null,
      channelId: 'channel-1',
      userId: 'user-1',
      roleIds: ['role-other']
    });
    expect(blockedByAllowlist.allowed).toBe(false);
    expect(blockedByAllowlist.reason).toBe('allow_required');

    const allowedByRole = container.policyService.evaluate({
      guildId,
      command,
      subcommand: null,
      channelId: 'channel-1',
      userId: 'user-1',
      roleIds: ['role-allow']
    });
    expect(allowedByRole.allowed).toBe(true);

    container.policyService.addPolicy({
      guildId,
      command,
      subcommand: null,
      action: 'deny',
      scope: 'channel',
      targetId: 'channel-1',
      createdBy: 'owner'
    });

    const deniedByChannel = container.policyService.evaluate({
      guildId,
      command,
      subcommand: null,
      channelId: 'channel-1',
      userId: 'user-1',
      roleIds: ['role-allow']
    });
    expect(deniedByChannel.allowed).toBe(false);
    expect(deniedByChannel.reason).toBe('deny_match');
  });
});

describe('admin economy audit', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];

  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  it('writes ledger transactions for admin wallet and vault mutations', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const actor = { discordUserId: '5001', username: 'admin' };
    const target = { discordUserId: '5002', username: 'target' };

    const award = container.economyService.adminAward(actor, target, 250, 'initial grant');
    expect(award.ok).toBe(true);
    expect(container.economyService.getBalance(target)).toBe(250);

    const take = container.economyService.adminTake(actor, target, 75, 'fine');
    expect(take.ok).toBe(true);
    expect(container.economyService.getBalance(target)).toBe(175);

    const setWallet = container.economyService.adminSetBalance(actor, target, 200, 'normalize');
    expect(setWallet.ok).toBe(true);
    expect(container.economyService.getBalance(target)).toBe(200);

    const setVault = container.vaultService.adminSetBalance(actor, target, 90, 'vault correction');
    expect(setVault.ok).toBe(true);
    expect(container.vaultService.getBalance(target)).toBe(90);

    const recent = container.ledgerService.getRecentTransactionsByDiscordId(target.discordUserId, 1, 20);
    const walletSetTx = recent.find((tx) => tx.subtype === 'wallet_set');
    const vaultSetTx = recent.find((tx) => tx.subtype === 'vault_set');
    const awardTx = recent.find((tx) => tx.subtype === 'wallet_award');
    const takeTx = recent.find((tx) => tx.subtype === 'wallet_take');

    expect(walletSetTx?.kind).toBe('admin_award');
    expect(vaultSetTx?.kind).toBe('admin_award');
    expect(awardTx?.kind).toBe('admin_award');
    expect(takeTx?.kind).toBe('admin_take');
    expect(awardTx?.note).toBe('initial grant');
    expect(takeTx?.note).toBe('fine');
  });
});
