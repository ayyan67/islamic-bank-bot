import { describe, expect, it } from 'vitest';
import { parseAmount } from '../commands/shared.js';

describe('parseAmount', () => {
  it('parses plain integers', () => {
    expect(parseAmount('500')).toBe(500);
    expect(parseAmount(' 42 ')).toBe(42);
  });

  it('parses all', () => {
    expect(parseAmount('all')).toBe('all');
    expect(parseAmount('ALL')).toBe('all');
  });

  it('parses k suffix', () => {
    expect(parseAmount('500k')).toBe(500_000);
    expect(parseAmount('1.5k')).toBe(1_500);
    expect(parseAmount('1.5K')).toBe(1_500);
  });

  it('parses m suffix', () => {
    expect(parseAmount('2m')).toBe(2_000_000);
    expect(parseAmount('1.5m')).toBe(1_500_000);
    expect(parseAmount('0.5m')).toBe(500_000);
  });

  it('ignores commas', () => {
    expect(parseAmount('1,000,000')).toBe(1_000_000);
  });

  it('rejects invalid input', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('0.4')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('5b')).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});
