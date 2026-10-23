import { describe, expect, it } from 'vitest';
import { secondsUntilUtcDayReset } from '../infra/utils/time.js';

describe('secondsUntilUtcDayReset', () => {
  it('counts down to the next 00:00 UTC', () => {
    expect(secondsUntilUtcDayReset(new Date('2026-09-29T20:00:00Z'))).toBe(4 * 3600);
    expect(secondsUntilUtcDayReset(new Date('2026-09-29T23:59:30Z'))).toBe(30);
    expect(secondsUntilUtcDayReset(new Date('2026-09-29T00:00:00Z'))).toBe(24 * 3600);
  });

  it('rounds partial seconds up so it never shows 0s before the reset', () => {
    expect(secondsUntilUtcDayReset(new Date('2026-09-29T23:59:59.400Z'))).toBe(1);
  });

  it('handles month and year boundaries', () => {
    expect(secondsUntilUtcDayReset(new Date('2026-12-31T12:00:00Z'))).toBe(12 * 3600);
  });
});
