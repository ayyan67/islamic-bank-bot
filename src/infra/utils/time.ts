export function nowIso(): string {
  return new Date().toISOString();
}

export function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

export function endOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export function isRamadan(): boolean {
  // Disabled for Eid al-Fitr 1447 (2026-03-20). Re-enable for next Ramadan.
  // Original signature: isRamadan(date = new Date()) — restore when re-enabling.
  return false;
}

// Eid al-Adha 1447 event window: 48 hours from 2026-05-26 20:54 UTC.
const EID_EVENT_START = new Date('2026-05-26T20:54:00.000Z');
const EID_EVENT_END = new Date(EID_EVENT_START.getTime() + 48 * 60 * 60 * 1000);

export function isEidEvent(now = new Date()): boolean {
  return now >= EID_EVENT_START && now < EID_EVENT_END;
}

export const EID_MULTIPLIER = 3;
export const EID_BONUS_AMOUNT = 40_000;
export const EID_BONUS_SUBTYPE = 'eid_al_adha_1447';
export const EID_GREETING = '🐏 Eid Mubarak! May Allah accept your sacrifices and good deeds.';
export const EID_BONUS_GREETING =
  '🐏 Eid Mubarak! May Allah accept your sacrifices and bless your year ahead.';

/** Seconds until the next 00:00 UTC, when the prayer checklist and all-five bonus reset. */
export function secondsUntilUtcDayReset(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, Math.ceil((next - now.getTime()) / 1000));
}
