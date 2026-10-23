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
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
}

describe('bounty board', () => {
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

  const guildId = 'g-bounty';
  const owner = { discordUserId: '7101', username: 'poster' };
  const worker = { discordUserId: '7102', username: 'worker' };

  it('post escrows the amount', () => {
    const container = boot();
    container.economyService.creditUser(owner, 5000, 'claim_timely', 'seed');

    const posted = container.bountyService.post(owner, guildId, 'chan', 'fix the icon', 2000);
    expect(posted.ok).toBe(true);
    expect(container.economyService.getBalance(owner)).toBe(3000);
  });

  it('rejects posting with insufficient funds', () => {
    const container = boot();
    const posted = container.bountyService.post(owner, guildId, 'chan', 'too rich', 500);
    expect(posted.ok).toBe(false);
  });

  it('full happy path: post → take → pay', () => {
    const container = boot();
    container.economyService.creditUser(owner, 5000, 'claim_timely', 'seed');

    const posted = container.bountyService.post(owner, guildId, 'chan', 'quick job', 1000);
    if (!posted.ok) throw new Error('post failed');

    const taken = container.bountyService.take(worker, guildId, posted.id);
    expect(taken.ok).toBe(true);
    if (taken.ok) expect(taken.bounty.status).toBe('in_progress');

    const paid = container.bountyService.pay(owner, guildId, posted.id);
    expect(paid.ok).toBe(true);
    expect(container.economyService.getBalance(worker)).toBe(1000);
  });

  it('cannot take your own bounty or a taken one', () => {
    const container = boot();
    container.economyService.creditUser(owner, 5000, 'claim_timely', 'seed');
    const posted = container.bountyService.post(owner, guildId, 'chan', 'job', 500);
    if (!posted.ok) throw new Error('post failed');

    expect(container.bountyService.take(owner, guildId, posted.id).ok).toBe(false);
    expect(container.bountyService.take(worker, guildId, posted.id).ok).toBe(true);
    const third = { discordUserId: '7103', username: 'late' };
    expect(container.bountyService.take(third, guildId, posted.id).ok).toBe(false);
  });

  it('only the poster can pay or cancel; cancel refunds', () => {
    const container = boot();
    container.economyService.creditUser(owner, 5000, 'claim_timely', 'seed');
    const posted = container.bountyService.post(owner, guildId, 'chan', 'job', 1500);
    if (!posted.ok) throw new Error('post failed');

    expect(container.bountyService.cancel(worker, guildId, posted.id).ok).toBe(false);
    const cancelled = container.bountyService.cancel(owner, guildId, posted.id);
    expect(cancelled.ok).toBe(true);
    expect(container.economyService.getBalance(owner)).toBe(5000);
    // cancelled bounty cannot be taken
    expect(container.bountyService.take(worker, guildId, posted.id).ok).toBe(false);
  });

  it('admin can force refund a taken bounty', () => {
    const container = boot();
    container.economyService.creditUser(owner, 5000, 'claim_timely', 'seed');
    const posted = container.bountyService.post(owner, guildId, 'chan', 'stuck job', 1000);
    if (!posted.ok) throw new Error('post failed');
    container.bountyService.take(worker, guildId, posted.id);

    const adminUser = { discordUserId: '7999', username: 'admin' };
    const refunded = container.bountyService.cancel(adminUser, guildId, posted.id, true);
    expect(refunded.ok).toBe(true);
    expect(container.economyService.getBalance(owner)).toBe(5000);
  });

  it('daily post rate limit applies', () => {
    const container = boot();
    container.economyService.creditUser(owner, 100000, 'claim_timely', 'seed');
    for (let i = 0; i < 5; i++) {
      expect(container.bountyService.post(owner, guildId, 'chan', `job ${i}`, 10).ok).toBe(true);
    }
    expect(container.bountyService.post(owner, guildId, 'chan', 'one too many', 10).ok).toBe(false);
  });
});
