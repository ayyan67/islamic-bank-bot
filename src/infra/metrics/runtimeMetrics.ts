type CommandOutcome = 'success' | 'error' | 'blocked';

interface CommandEvent {
  at: number;
  command: string;
  outcome: CommandOutcome;
  durationMs: number;
}

export class RuntimeMetrics {
  private readonly invalidRequestEvents: number[] = [];
  private readonly rateLimitedEvents: number[] = [];
  private readonly commandEvents: CommandEvent[] = [];

  recordInvalidRequest(): void {
    this.invalidRequestEvents.push(Date.now());
    this.prune();
  }

  recordRateLimited(): void {
    this.rateLimitedEvents.push(Date.now());
    this.prune();
  }

  recordCommandEvent(command: string, outcome: CommandOutcome, durationMs: number): void {
    this.commandEvents.push({
      at: Date.now(),
      command: command.trim().length > 0 ? command.trim() : 'unknown',
      outcome,
      durationMs: Math.max(0, Math.round(durationMs))
    });
    this.prune();
  }

  snapshot(): {
    invalidPerMinute: number;
    rateLimitedPerMinute: number;
    commandsPerMinute: number;
    commandErrorsPerMinute: number;
    blockedPerMinute: number;
    avgCommandLatencyMs: number;
  } {
    this.prune();
    const commandCount = this.commandEvents.length;
    const errorCount = this.commandEvents.filter((entry) => entry.outcome === 'error').length;
    const blockedCount = this.commandEvents.filter((entry) => entry.outcome === 'blocked').length;
    const totalLatency = this.commandEvents.reduce((sum, entry) => sum + entry.durationMs, 0);

    return {
      invalidPerMinute: this.invalidRequestEvents.length,
      rateLimitedPerMinute: this.rateLimitedEvents.length,
      commandsPerMinute: commandCount,
      commandErrorsPerMinute: errorCount,
      blockedPerMinute: blockedCount,
      avgCommandLatencyMs: commandCount > 0 ? Math.round(totalLatency / commandCount) : 0
    };
  }

  shouldApplyBackpressure(): boolean {
    const { invalidPerMinute, rateLimitedPerMinute } = this.snapshot();
    return invalidPerMinute >= 25 || rateLimitedPerMinute >= 20;
  }

  private prune(): void {
    const now = Date.now();
    const cutoff = now - 60_000;
    while (
      this.invalidRequestEvents.length > 0 &&
      (this.invalidRequestEvents[0] ?? Number.POSITIVE_INFINITY) < cutoff
    ) {
      this.invalidRequestEvents.shift();
    }
    while (
      this.rateLimitedEvents.length > 0 &&
      (this.rateLimitedEvents[0] ?? Number.POSITIVE_INFINITY) < cutoff
    ) {
      this.rateLimitedEvents.shift();
    }

    while (
      this.commandEvents.length > 0 &&
      (this.commandEvents[0]?.at ?? Number.POSITIVE_INFINITY) < cutoff
    ) {
      this.commandEvents.shift();
    }
  }
}
