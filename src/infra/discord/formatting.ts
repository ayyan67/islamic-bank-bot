import { env } from '../../config/env.js';

export function formatCurrency(amount: number): string {
  const label = Math.abs(amount) === 1 ? env.CURRENCY_NAME : env.CURRENCY_PLURAL;
  return `${env.CURRENCY_SIGN} ${amount.toLocaleString('en-US')} ${label}`;
}

export function formatCooldown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (remaining > 0 || parts.length === 0) {
    parts.push(`${remaining}s`);
  }

  return parts.join(' ');
}

export function sanitizeInline(value: string): string {
  return value.replace(/`/g, "'").trim();
}

/**
 * Build a visual progress bar using block characters.
 * @param current Current value
 * @param max Maximum value (if 0 or negative, shows empty bar)
 * @param length Number of bar segments (default 10)
 * @returns e.g. "████████░░ 80%"
 */
export function progressBar(current: number, max: number, length = 10): string {
  if (max <= 0) return `${'░'.repeat(length)} 0%`;
  const ratio = Math.min(Math.max(current / max, 0), 1);
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const percent = Math.round(ratio * 100);
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${percent}%`;
}
