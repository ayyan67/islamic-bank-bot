import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-shop-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
    }
  }
}

describe('shop service', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];

  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  it('supports role item purchase and wallet deduction', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = 'guild-1';
    const user = { discordUserId: '91001', username: 'buyer' };

    container.economyService.creditUser(user, 1000, 'claim_timely', 'seed');

    const created = container.shopService.addRoleItem({
      guildId,
      roleId: 'role-1',
      displayName: 'Helper',
      itemKey: 'helper-role',
      price: 300,
      createdBy: 'owner'
    });
    expect(created.ok).toBe(true);

    const purchase = container.shopService.purchase(user, {
      guildId,
      itemQuery: 'helper-role',
      memberRoleIds: []
    });
    expect(purchase.ok).toBe(true);
    expect(container.economyService.getBalance(user)).toBe(700);

    const inventory = container.shopService.listInventory(user, guildId);
    const owned = inventory.find((entry) => entry.itemKey === 'helper-role');
    expect(owned?.quantity).toBe(1);

    const recent = container.ledgerService.getRecentTransactionsByDiscordId(user.discordUserId, 1, 5);
    const purchaseTx = recent.find((tx) => tx.kind === 'shop_purchase');
    expect(purchaseTx?.amount).toBe(-300);
  });

  it('enforces role requirement for purchase', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = 'guild-1';
    const user = { discordUserId: '91002', username: 'buyer' };

    container.economyService.creditUser(user, 1000, 'claim_timely', 'seed');

    const created = container.shopService.addRoleItem({
      guildId,
      roleId: 'role-2',
      displayName: 'Scholar',
      itemKey: 'scholar-role',
      roleRequirementId: 'role-required',
      price: 200,
      createdBy: 'owner'
    });
    expect(created.ok).toBe(true);

    const purchase = container.shopService.purchase(user, {
      guildId,
      itemQuery: 'scholar-role',
      memberRoleIds: []
    });

    expect(purchase.ok).toBe(false);
    expect(purchase.reason).toContain('need role');
    expect(container.economyService.getBalance(user)).toBe(1000);
  });

  it('refunds failed role purchase compensation path', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = 'guild-1';
    const user = { discordUserId: '91003', username: 'buyer' };

    container.economyService.creditUser(user, 1000, 'claim_timely', 'seed');

    const created = container.shopService.addRoleItem({
      guildId,
      roleId: 'role-3',
      displayName: 'Muadhin',
      itemKey: 'muadhin-role',
      price: 450,
      createdBy: 'owner'
    });
    expect(created.ok).toBe(true);

    const purchase = container.shopService.purchase(user, {
      guildId,
      itemQuery: 'muadhin-role',
      memberRoleIds: []
    });
    expect(purchase.ok).toBe(true);
    expect(container.economyService.getBalance(user)).toBe(550);

    const refund = container.shopService.refundFailedRolePurchase(
      user,
      guildId,
      'muadhin-role',
      'test-role-grant-failure'
    );
    expect(refund.ok).toBe(true);
    expect(container.economyService.getBalance(user)).toBe(1000);

    const inventory = container.shopService.listInventory(user, guildId);
    const owned = inventory.find((entry) => entry.itemKey === 'muadhin-role');
    expect(owned?.quantity).toBe(0);

    const recent = container.ledgerService.getRecentTransactionsByDiscordId(user.discordUserId, 1, 10);
    const refundTx = recent.find((tx) => tx.kind === 'shop_refund');
    expect(refundTx?.amount).toBe(450);
  });

  it('allows user-initiated refund for role items', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = 'guild-1';
    const user = { discordUserId: '91004', username: 'buyer' };

    container.economyService.creditUser(user, 1000, 'claim_timely', 'seed');

    const created = container.shopService.addRoleItem({
      guildId,
      roleId: 'role-4',
      displayName: 'Guardian',
      itemKey: 'guardian-role',
      price: 400,
      createdBy: 'owner'
    });
    expect(created.ok).toBe(true);

    const purchase = container.shopService.purchase(user, {
      guildId,
      itemQuery: 'guardian-role',
      memberRoleIds: []
    });
    expect(purchase.ok).toBe(true);
    expect(container.economyService.getBalance(user)).toBe(600);

    const refund = container.shopService.refund(user, guildId, 'guardian-role', ['role-4']);
    expect(refund.ok).toBe(true);
    expect(refund.refundedAmount).toBe(400);
    expect(refund.newBalance).toBe(1000);
    expect(container.economyService.getBalance(user)).toBe(1000);

    const inventory = container.shopService.listInventory(user, guildId);
    const owned = inventory.find((entry) => entry.itemKey === 'guardian-role');
    expect(owned?.quantity).toBe(0);

    const recent = container.ledgerService.getRecentTransactionsByDiscordId(user.discordUserId, 1, 10);
    const refundTx = recent.find((tx) => tx.kind === 'shop_refund' && tx.note?.includes('user_refund'));
    expect(refundTx?.amount).toBe(400);
  });

  it('rejects refund for non-role items', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = 'guild-1';
    const user = { discordUserId: '91005', username: 'buyer' };

    container.economyService.creditUser(user, 1000, 'claim_timely', 'seed');

    const created = container.shopService.addTextItem({
      guildId,
      itemKey: 'badge-item',
      displayName: 'Special Badge',
      price: 100,
      createdBy: 'owner'
    });
    expect(created.ok).toBe(true);

    const purchase = container.shopService.purchase(user, {
      guildId,
      itemQuery: 'badge-item',
      memberRoleIds: []
    });
    expect(purchase.ok).toBe(true);

    const refund = container.shopService.refund(user, guildId, 'badge-item', []);
    expect(refund.ok).toBe(false);
    expect(refund.reason).toContain('Only role items');
  });

  it('rejects refund when user has neither inventory nor the role', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = 'guild-1';
    const user = { discordUserId: '91006', username: 'buyer' };

    container.economyService.creditUser(user, 1000, 'claim_timely', 'seed');

    container.shopService.addRoleItem({
      guildId,
      roleId: 'role-5',
      displayName: 'Elite',
      itemKey: 'elite-role',
      price: 500,
      createdBy: 'owner'
    });

    // No inventory record AND does not have the Discord role
    const refund = container.shopService.refund(user, guildId, 'elite-role', []);
    expect(refund.ok).toBe(false);
    expect(refund.reason).toContain('do not own');
  });

  it('allows legacy refund when user has the role but no inventory record', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = 'guild-1';
    const user = { discordUserId: '91008', username: 'legacy-buyer' };

    container.economyService.creditUser(user, 500, 'claim_timely', 'seed');

    container.shopService.addRoleItem({
      guildId,
      roleId: 'role-legacy',
      displayName: 'Legacy Knight',
      itemKey: 'legacy-knight',
      price: 350,
      createdBy: 'owner'
    });

    // No purchase through the system — user has the role from before migration
    const refund = container.shopService.refund(user, guildId, 'legacy-knight', ['role-legacy']);
    expect(refund.ok).toBe(true);
    expect(refund.refundedAmount).toBe(350);
    expect(refund.newBalance).toBe(850);
    expect(container.economyService.getBalance(user)).toBe(850);

    // No inventory record should have been created
    const inventory = container.shopService.listInventory(user, guildId);
    const owned = inventory.find((entry) => entry.itemKey === 'legacy-knight');
    expect(owned).toBeUndefined();

    const recent = container.ledgerService.getRecentTransactionsByDiscordId(user.discordUserId, 1, 10);
    const refundTx = recent.find((tx) => tx.kind === 'shop_refund' && tx.note?.includes('legacy_refund'));
    expect(refundTx?.amount).toBe(350);
  });

  it('rejects refund when user no longer has the role', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const guildId = 'guild-1';
    const user = { discordUserId: '91007', username: 'buyer' };

    container.economyService.creditUser(user, 1000, 'claim_timely', 'seed');

    container.shopService.addRoleItem({
      guildId,
      roleId: 'role-6',
      displayName: 'Warrior',
      itemKey: 'warrior-role',
      price: 300,
      createdBy: 'owner'
    });

    container.shopService.purchase(user, {
      guildId,
      itemQuery: 'warrior-role',
      memberRoleIds: []
    });

    // User no longer has the role (empty memberRoleIds)
    const refund = container.shopService.refund(user, guildId, 'warrior-role', []);
    expect(refund.ok).toBe(false);
    expect(refund.reason).toContain('no longer have this role');
  });
});
