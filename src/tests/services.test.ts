import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
    }
  }
}

describe('core economy services', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];

  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  it('transfers funds between users', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const alice = { discordUserId: '1001', username: 'alice' };
    const bob = { discordUserId: '1002', username: 'bob' };

    container.economyService.creditUser(alice, 1000, 'claim_timely', 'seed');

    const result = container.economyService.transfer(alice, bob, 450);
    expect(result.ok).toBe(true);

    expect(container.economyService.getBalance(alice)).toBe(550);
    expect(container.economyService.getBalance(bob)).toBe(450);
  });

  it('supports vault deposit and withdraw', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const user = { discordUserId: '2001', username: 'user' };

    container.economyService.creditUser(user, 1000, 'claim_timely', 'seed');

    const deposit = container.vaultService.deposit(user, 400);
    expect(deposit.ok).toBe(true);
    expect(container.economyService.getBalance(user)).toBe(600);
    expect(container.vaultService.getBalance(user)).toBe(400);

    const withdraw = container.vaultService.withdraw(user, 150);
    expect(withdraw.ok).toBe(true);
    expect(container.economyService.getBalance(user)).toBe(750);
    expect(container.vaultService.getBalance(user)).toBe(250);
  });

  it('allows one Eid bonus per subtype but blocks repeat claims of the same subtype', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const user = { discordUserId: '5001', username: 'user' };

    const fitr = container.worshipService.claimEid(user, 40_000, 'eid_al_fitr_1447');
    expect(fitr.ok).toBe(true);

    const adha = container.worshipService.claimEid(user, 40_000, 'eid_al_adha_1447');
    expect(adha.ok).toBe(true);

    const adhaAgain = container.worshipService.claimEid(user, 40_000, 'eid_al_adha_1447');
    expect(adhaAgain.ok).toBe(false);

    expect(container.economyService.getBalance(user)).toBe(80_000);
  });

  it('enforces timely cooldown', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const user = { discordUserId: '3001', username: 'user' };

    const first = container.worshipService.claimTimely(user, 500, 1);
    expect(first.ok).toBe(true);

    const second = container.worshipService.claimTimely(user, 500, 1);
    expect(second.ok).toBe(false);
    if (second.ok) {
      throw new Error('Expected timely cooldown to block second claim');
    }
    expect(second.remainingSeconds).toBeGreaterThan(0);
  });
});
