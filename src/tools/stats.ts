/**
 * Read-only analytics report for the bot database.
 *
 *   pnpm stats [--days 30] [--db path] [--json]
 *   node dist/src/tools/stats.js --days 7      (production)
 *
 * Definitions live in docs/DATA_MAP.md. Keep this script and that doc in sync.
 */
import Database from 'better-sqlite3';
import path from 'node:path';

const BOT_USERNAMES = new Set(['MEE6', 'Dyno', 'Carl-bot', 'Arcane', 'ProBot']);
const SOURCE_KINDS = ['claim_timely', 'claim_prayer', 'claim_eid', 'claim_tag_reward', 'claim_trivia', 'challenge_reward', 'admin_award'];
const HOME_GUILD = '100000000000000001';

interface Args {
  days: number;
  db: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { days: 30, db: process.env['DATABASE_PATH'] ?? path.join(process.cwd(), 'data', 'halal-economy.db'), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') args.days = Number(argv[++i] ?? 30);
    else if (a === '--db') args.db = String(argv[++i] ?? args.db);
    else if (a === '--json') args.json = true;
  }
  if (!Number.isFinite(args.days) || args.days <= 0) args.days = 30;
  return args;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '0';
  return Math.round(n).toLocaleString('en-US');
}

function pct(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function buildReport(dbPath: string, days: number) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const since = `datetime('now', '-${days} days')`;
  const prevSince = `datetime('now', '-${days * 2} days')`;
  // Tolerate older schemas (dev DBs, old backups): a missing table yields empty results, not a crash.
  const q = <T = any>(sql: string, ...params: unknown[]): T[] => {
    try {
      return db.prepare(sql).all(...params) as T[];
    } catch {
      return [];
    }
  };
  const one = <T = any>(sql: string, ...params: unknown[]): T => {
    try {
      return (db.prepare(sql).get(...params) ?? {}) as T;
    } catch {
      return {} as T;
    }
  };
  const inList = (xs: string[]) => xs.map((x) => `'${x}'`).join(',');

  const activeNow = one<{ n: number }>(`SELECT count(DISTINCT user_id) n FROM transactions WHERE kind != 'legacy' AND created_at > ${since}`).n;
  const activePrev = one<{ n: number }>(
    `SELECT count(DISTINCT user_id) n FROM transactions WHERE kind != 'legacy' AND created_at > ${prevSince} AND created_at <= ${since}`
  ).n;
  const dau = one<{ n: number }>(`SELECT count(DISTINCT user_id) n FROM transactions WHERE kind != 'legacy' AND created_at > datetime('now','-1 day')`).n;
  const mau = one<{ n: number }>(`SELECT count(DISTINCT user_id) n FROM transactions WHERE kind != 'legacy' AND created_at > datetime('now','-30 days')`).n;
  const newUsers = one<{ n: number }>(
    `SELECT count(*) n FROM users u WHERE u.created_at NOT LIKE '1970%' AND u.created_at > ${since}`
  ).n;

  const minted = one<{ s: number }>(
    `SELECT coalesce(sum(amount),0) s FROM transactions WHERE amount > 0 AND kind IN (${inList(SOURCE_KINDS)}) AND created_at > ${since}`
  ).s;
  const purchases = one<{ n: number; s: number }>(
    `SELECT count(*) n, coalesce(sum(-amount),0) s FROM transactions WHERE kind='shop_purchase' AND created_at > ${since}`
  );
  const refunds = one<{ n: number; s: number }>(`SELECT count(*) n, coalesce(sum(amount),0) s FROM transactions WHERE kind='shop_refund' AND created_at > ${since}`);
  const adminTake = one<{ s: number }>(`SELECT coalesce(sum(-amount),0) s FROM transactions WHERE kind='admin_take' AND created_at > ${since}`).s;
  const burned = purchases.s - refunds.s + adminTake;

  const supply = one<{ wallets: number; vaults: number }>(
    `SELECT (SELECT coalesce(sum(balance),0) FROM wallets) wallets, (SELECT coalesce(sum(balance),0) FROM vault_accounts) vaults`
  );
  const totalSupply = supply.wallets + supply.vaults;
  const topWallets = q<{ username: string; balance: number }>(
    `SELECT u.username, w.balance + coalesce(v.balance,0) balance FROM wallets w JOIN users u ON u.id=w.user_id LEFT JOIN vault_accounts v ON v.user_id=w.user_id
     WHERE u.username NOT IN (${inList([...BOT_USERNAMES])}) ORDER BY balance DESC LIMIT 10`
  );
  const top10Share = topWallets.reduce((a, r) => a + r.balance, 0);

  const kinds = q<{ kind: string; n: number; s: number }>(
    `SELECT kind, count(*) n, coalesce(sum(amount),0) s FROM transactions WHERE kind != 'legacy' AND created_at > ${since} GROUP BY kind ORDER BY n DESC`
  );
  const timelyClaims = one<{ n: number }>(`SELECT count(*) n FROM transactions WHERE kind='claim_timely' AND subtype='timely' AND created_at > ${since}`).n;
  const prayers = q<{ prayer_name: string; n: number; users: number }>(
    `SELECT prayer_name, count(*) n, count(DISTINCT user_id) users FROM prayer_checkins WHERE checked_in_at > ${since} GROUP BY prayer_name ORDER BY n DESC`
  );
  const allFive = one<{ n: number }>(
    `SELECT count(*) n FROM (SELECT user_id, date(checked_in_at) d FROM prayer_checkins WHERE checked_in_at > ${since} AND prayer_name IN ('fajr','dhuhr','asr','maghrib','isha') GROUP BY 1,2 HAVING count(DISTINCT prayer_name) = 5)`
  ).n;

  const transfers = one<{ n: number; s: number; senders: number; recipients: number }>(
    `SELECT count(*) n, coalesce(sum(-amount),0) s, count(DISTINCT user_id) senders, count(DISTINCT other_user_id) recipients FROM transactions WHERE kind='transfer' AND subtype='sent' AND created_at > ${since}`
  );
  const funnels = q<{ recipient: string; senders: number; total: number }>(
    `SELECT r.username recipient, count(DISTINCT t.user_id) senders, coalesce(sum(-t.amount),0) total
     FROM transactions t JOIN users r ON r.id=t.other_user_id
     WHERE t.kind='transfer' AND t.subtype='sent' AND t.created_at > ${since}
     GROUP BY t.other_user_id HAVING senders >= 3 ORDER BY total DESC LIMIT 5`
  );

  const drops = one<{ n: number; s: number; picked: number; median_latency: number | null }>(
    `SELECT count(*) n, coalesce(sum(amount),0) s, sum(picked_at IS NOT NULL) picked,
       (SELECT (julianday(picked_at)-julianday(created_at))*86400 FROM drops WHERE picked_at IS NOT NULL AND created_at > ${since} ORDER BY 1 LIMIT 1 OFFSET (SELECT count(*)/2 FROM drops WHERE picked_at IS NOT NULL AND created_at > ${since})) median_latency
     FROM drops WHERE created_at > ${since}`
  );

  const shopTop = q<{ item: string; n: number }>(
    `SELECT substr(note, 6) item, count(*) n FROM transactions WHERE kind='shop_purchase' AND created_at > ${since} GROUP BY 1 ORDER BY n DESC LIMIT 5`
  );

  const trivia = one<{ rewards: number; users: number }>(
    `SELECT count(*) rewards, count(DISTINCT user_id) users FROM transactions WHERE kind='claim_trivia' AND created_at > ${since}`
  );
  const challenges = one<{ n: number }>(`SELECT count(*) n FROM daily_challenge_completions WHERE completed_at > ${since}`).n;

  const streaks = q<{ kind: string; active: number; over7: number; over30: number; over100: number; best: number }>(
    `SELECT kind, count(*) active, sum(count>=7) over7, sum(count>=30) over30, sum(count>=100) over100, max(count) best FROM streaks WHERE count > 0 GROUP BY kind`
  );

  const multiFeature = one<{ n: number }>(
    `SELECT count(*) n FROM (SELECT user_id FROM transactions WHERE kind != 'legacy' AND created_at > ${since} GROUP BY user_id HAVING count(DISTINCT kind) >= 2)`
  ).n;

  // Automation signal: last 48 timely claims all within 90s of the previous claim + 1h (the default cooldown).
  const claimers = q<{ user_id: number; username: string }>(
    `SELECT DISTINCT t.user_id, u.username FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.kind='claim_timely' AND t.subtype='timely' AND t.created_at > datetime('now','-3 days')`
  );
  const automation: Array<{ username: string; claims: number; maxJitterSec: number }> = [];
  const claimTimes = db.prepare(
    `SELECT created_at FROM transactions WHERE user_id=? AND kind='claim_timely' AND subtype='timely' ORDER BY created_at DESC LIMIT 48`
  );
  for (const c of claimers) {
    const rows = claimTimes.all(c.user_id) as Array<{ created_at: string }>;
    if (rows.length < 48) continue;
    let maxJitter = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      const gap = (Date.parse(rows[i]!.created_at) - Date.parse(rows[i + 1]!.created_at)) / 1000;
      maxJitter = Math.max(maxJitter, Math.abs(gap - 3600));
    }
    if (maxJitter <= 90) automation.push({ username: c.username, claims: rows.length, maxJitterSec: Math.round(maxJitter) });
  }

  const guildSpread = q<{ guild_id: string; n: number }>(
    `SELECT guild_id, count(*) n FROM tag_reward_claims WHERE claimed_at > ${since} GROUP BY guild_id ORDER BY n DESC LIMIT 5`
  );
  const trend = q<{ date: string; metric: string; value: number }>(
    `SELECT date, metric, value FROM daily_stats WHERE guild_id = '' AND metric IN ('active_users','minted','burned','timely_claims') AND date >= date('now', '-${days} days') ORDER BY date`
  );

  const outbox = q<{ status: string; n: number }>(`SELECT status, count(*) n FROM notification_outbox WHERE created_at > ${since} GROUP BY status`);

  db.close();

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    users: { activeNow, activePrev, dau, mau, stickiness: mau ? dau / mau : 0, newUsers, multiFeature },
    economy: { minted, burned, purchases, refunds, adminTake, supply: { ...supply, total: totalSupply }, top10Share, topWallets },
    activity: { kinds, timelyClaims, prayers, allFiveDays: allFive, transfers, funnels, drops, shopTop, trivia, challenges, streaks },
    integrity: { automation },
    ops: { guildSpread, outbox, homeGuild: HOME_GUILD },
    trend
  };
}

export function renderMarkdown(r: ReturnType<typeof buildReport>): string {
  const L: string[] = [];
  const d = r.windowDays;
  L.push(`# Islamic Bank stats — last ${d} days`, `_${r.generatedAt}_`, '');
  L.push('## Users');
  L.push(`- Active (${d}d): **${fmt(r.users.activeNow)}** (previous ${d}d: ${fmt(r.users.activePrev)}, ${pct(r.users.activeNow - r.users.activePrev, r.users.activePrev)} change)`);
  L.push(`- DAU ${fmt(r.users.dau)} · MAU ${fmt(r.users.mau)} · stickiness ${pct(r.users.dau, r.users.mau)}`);
  L.push(`- New users: ${fmt(r.users.newUsers)} · used 2+ features: ${fmt(r.users.multiFeature)} (${pct(r.users.multiFeature, r.users.activeNow)} of active)`);
  L.push('', '## Economy');
  L.push(`- Minted ${fmt(r.economy.minted)} · burned ${fmt(r.economy.burned)} · net inflation **${fmt(r.economy.minted - r.economy.burned)}** (burn rate ${pct(r.economy.burned, r.economy.minted)})`);
  L.push(`- Shop: ${fmt(r.economy.purchases.n)} purchases (${fmt(r.economy.purchases.s)}), ${fmt(r.economy.refunds.n)} refunds (${fmt(r.economy.refunds.s)}) → refund rate ${pct(r.economy.refunds.n, r.economy.purchases.n)}`);
  L.push(`- Supply ${fmt(r.economy.supply.total)} (wallets ${fmt(r.economy.supply.wallets)}, vaults ${fmt(r.economy.supply.vaults)}) · top-10 hold ${pct(r.economy.top10Share, r.economy.supply.total)}`);
  L.push(`- Top wallets: ${r.economy.topWallets.slice(0, 5).map((w) => `${w.username} ${fmt(w.balance)}`).join(' · ')}`);
  L.push('', '## Activity');
  L.push(`- Timely claims ${fmt(r.activity.timelyClaims)} · trivia rewards ${fmt(r.activity.trivia.rewards)} (${fmt(r.activity.trivia.users)} users) · challenge completions ${fmt(r.activity.challenges)}`);
  L.push(`- Prayer check-ins: ${r.activity.prayers.map((p) => `${p.prayer_name} ${fmt(p.n)}`).join(' · ')} · all-five days ${fmt(r.activity.allFiveDays)}`);
  L.push(`- Transfers ${fmt(r.activity.transfers.n)} worth ${fmt(r.activity.transfers.s)} (${fmt(r.activity.transfers.senders)} senders → ${fmt(r.activity.transfers.recipients)} recipients)`);
  L.push(`- Drops ${fmt(r.activity.drops.n)} worth ${fmt(r.activity.drops.s)}, ${pct(r.activity.drops.picked, r.activity.drops.n)} picked, median pick latency ${r.activity.drops.median_latency == null ? 'n/a' : `${Math.round(r.activity.drops.median_latency)}s`}`);
  if (r.activity.shopTop.length) L.push(`- Top shop items: ${r.activity.shopTop.map((s) => `${s.item} ×${s.n}`).join(' · ')}`);
  for (const s of r.activity.streaks) L.push(`- ${s.kind} streaks: ${fmt(s.active)} active · ≥7: ${fmt(s.over7)} · ≥30: ${fmt(s.over30)} · ≥100: ${fmt(s.over100)} · best ${fmt(s.best)}`);
  L.push('', '## Ledger by kind');
  L.push('| kind | rows | net amount |', '|---|---:|---:|');
  for (const k of r.activity.kinds) L.push(`| ${k.kind} | ${fmt(k.n)} | ${fmt(k.s)} |`);
  L.push('', '## Integrity');
  if (r.integrity.automation.length === 0) L.push('- No automation signals (no account with 48 consecutive hourly claims within 90s jitter).');
  else L.push(`- ⚠️ Metronomic claimers: ${r.integrity.automation.map((a) => `${a.username} (jitter ≤${a.maxJitterSec}s)`).join(', ')}`);
  if (r.activity.funnels.length) L.push(`- Recipients from 3+ senders: ${r.activity.funnels.map((f) => `${f.recipient} ← ${f.senders} senders, ${fmt(f.total)}`).join(' · ')}`);
  if (r.trend.length) {
    const byDate = new Map<string, Record<string, number>>();
    for (const t of r.trend) byDate.set(t.date, { ...(byDate.get(t.date) ?? {}), [t.metric]: t.value });
    L.push('', '## Daily trend (from daily_stats)');
    L.push('| date | active | claims | minted | burned |', '|---|---:|---:|---:|---:|');
    for (const [date, m] of byDate) {
      L.push(`| ${date} | ${fmt(m['active_users'])} | ${fmt(m['timely_claims'])} | ${fmt(m['minted'])} | ${fmt(m['burned'])} |`);
    }
  }
  L.push('', '## Ops');
  if (r.ops.outbox.length) L.push(`- Notification outbox: ${r.ops.outbox.map((o) => `${o.status} ${fmt(o.n)}`).join(' · ')}`);
  if (r.ops.guildSpread.length) L.push(`- Tag-reward claims by guild: ${r.ops.guildSpread.map((g) => `${g.guild_id === r.ops.homeGuild ? 'home' : g.guild_id} ${fmt(g.n)}`).join(' · ')}`);
  L.push('', '_Definitions: docs/DATA_MAP.md_');
  return L.join('\n');
}

const isMain = process.argv[1] && /stats\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args.db, args.days);
  process.stdout.write(args.json ? JSON.stringify(report, null, 2) : renderMarkdown(report));
  process.stdout.write('\n');
}
