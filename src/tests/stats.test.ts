import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppContainer } from '../app/container.js';
import { buildReport, renderMarkdown } from '../tools/stats.js';

function createTempDbPath(): string {
  return path.join(os.tmpdir(), `halal-economy-stats-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}
function removeDbFiles(dbPath: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    const c = `${dbPath}${suffix}`;
    if (fs.existsSync(c)) fs.unlinkSync(c);
  }
}

describe('stats report', () => {
  const opened: Array<{ container: AppContainer; dbPath: string }> = [];
  afterEach(() => {
    for (const item of opened.splice(0)) {
      item.container.close();
      removeDbFiles(item.dbPath);
    }
  });

  it('runs every query against the current schema and renders markdown', () => {
    const dbPath = createTempDbPath();
    const container = new AppContainer(dbPath);
    opened.push({ container, dbPath });

    const alice = { discordUserId: '1', username: 'alice' };
    const bob = { discordUserId: '2', username: 'bob' };
    container.worshipService.claimTimely(alice, 500, 1, {});
    container.worshipService.claimTimely(bob, 500, 1, {});
    container.economyService.transfer(alice, bob, 100);

    const report = buildReport(dbPath, 7);
    expect(report.users.activeNow).toBe(2);
    expect(report.economy.minted).toBeGreaterThanOrEqual(1000);
    expect(report.activity.timelyClaims).toBe(2);
    expect(report.activity.transfers.n).toBe(1);
    expect(report.integrity.automation).toEqual([]);

    const md = renderMarkdown(report);
    expect(md).toContain('# Islamic Bank stats');
    expect(md).toContain('Timely claims 2');
  });
});
