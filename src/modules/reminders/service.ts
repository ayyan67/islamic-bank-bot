import { ReminderRepository } from './repository.js';
import { IdentityRepository } from '../../infra/db/repositories/identityRepository.js';
import type { ParsedDuration, ReminderRow } from './types.js';
import type { UserProfileInput } from '../../infra/db/types.js';

const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_PER_USER = 10;

export class ReminderService {
  constructor(
    private readonly reminderRepo: ReminderRepository,
    private readonly identityRepo: IdentityRepository
  ) {}

  parseDuration(input: string): ParsedDuration | null {
    const regex = /(\d+)\s*(d|h|m)/gi;
    let ms = 0;
    const parts: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      const value = parseInt(match[1] ?? '0', 10);
      const unit = (match[2] ?? '').toLowerCase();
      if (unit === 'd') {
        ms += value * 24 * 60 * 60 * 1000;
        parts.push(`${value}d`);
      } else if (unit === 'h') {
        ms += value * 60 * 60 * 1000;
        parts.push(`${value}h`);
      } else if (unit === 'm') {
        ms += value * 60 * 1000;
        parts.push(`${value}m`);
      }
    }

    if (ms === 0) return null;
    return { ms, label: parts.join(' ') };
  }

  set(
    profile: UserProfileInput,
    channelId: string,
    guildId: string | null,
    timeInput: string,
    message: string
  ): { ok: true; id: number; label: string; remindAt: number } | { ok: false; reason: string } {
    const duration = this.parseDuration(timeInput);
    if (!duration) {
      return { ok: false, reason: 'Could not parse duration. Use formats like `30m`, `2h`, `1d`, `1d6h30m`.' };
    }
    if (duration.ms > MAX_DURATION_MS) {
      return { ok: false, reason: 'Reminders can be at most 30 days in the future.' };
    }
    if (duration.ms < 60_000) {
      return { ok: false, reason: 'Minimum reminder time is 1 minute.' };
    }

    const user = this.identityRepo.ensureUser(profile);
    const existing = this.reminderRepo.getByUser(user.id);
    if (existing.length >= MAX_PER_USER) {
      return { ok: false, reason: `You already have ${MAX_PER_USER} pending reminders. Cancel one first.` };
    }

    const remindAt = Date.now() + duration.ms;
    const id = this.reminderRepo.create(user.id, profile.discordUserId, channelId, guildId, remindAt, message);
    return { ok: true, id, label: duration.label, remindAt };
  }

  list(profile: UserProfileInput): ReminderRow[] {
    const user = this.identityRepo.getUserByDiscordId(profile.discordUserId);
    if (!user) return [];
    return this.reminderRepo.getByUser(user.id);
  }

  cancel(
    profile: UserProfileInput,
    id: number
  ): { ok: true } | { ok: false; reason: string } {
    const user = this.identityRepo.getUserByDiscordId(profile.discordUserId);
    if (!user) return { ok: false, reason: 'No reminders found.' };

    const deleted = this.reminderRepo.delete(id, user.id);
    if (!deleted) return { ok: false, reason: `Reminder #${id} not found or does not belong to you.` };
    return { ok: true };
  }

  getDue(): ReminderRow[] {
    return this.reminderRepo.getDue(Date.now());
  }

  claimDue(limit: number, staleProcessingMs: number): ReminderRow[] {
    return this.reminderRepo.claimDue(Date.now(), limit, staleProcessingMs);
  }

  deleteById(id: number): void {
    this.reminderRepo.deleteById(id);
  }

  markFailed(id: number, errorMessage: string): void {
    const normalized = errorMessage.trim().slice(0, 300);
    this.reminderRepo.markFailed(id, normalized || 'unknown delivery error');
  }
}
