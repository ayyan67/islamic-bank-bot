import { RACE_ANIMALS, RaceSession, TRACK_LENGTH, JOIN_WINDOW_SECONDS } from './types.js';

type SendFn = (channelId: string, payload: { content: string }) => Promise<{ id: string } | any>;
type EditFn = (channelId: string, messageId: string, payload: { content: string }) => Promise<void>;

export class RaceService {
  private readonly sessions = new Map<string, RaceSession>();
  private readonly animalPool = new Map<string, string[]>(); // channelId → remaining animals

  startRace(
    channelId: string,
    guildId: string,
    hostUserId: string,
    hostUsername: string
  ): { ok: true; session: RaceSession } | { ok: false; reason: string } {
    if (this.sessions.has(channelId)) {
      return { ok: false, reason: 'A race is already in progress in this channel. Join with `.joinrace`!' };
    }

    const pool = [...RACE_ANIMALS];
    const animal = pool.splice(Math.floor(Math.random() * pool.length), 1)[0] ?? '🐎';
    this.animalPool.set(channelId, pool);

    const session: RaceSession = {
      channelId,
      guildId,
      hostUserId,
      racers: new Map([[hostUserId, { discordUserId: hostUserId, username: hostUsername, animal, position: 0 }]]),
      joinWindowMs: JOIN_WINDOW_SECONDS * 1000,
      joinWindowEndsAt: Date.now() + JOIN_WINDOW_SECONDS * 1000,
      messageId: null,
      started: false
    };

    this.sessions.set(channelId, session);
    return { ok: true, session };
  }

  joinRace(
    channelId: string,
    userId: string,
    username: string
  ): { ok: true; animal: string } | { ok: false; reason: string } {
    const session = this.sessions.get(channelId);
    if (!session) return { ok: false, reason: 'No race is open to join. Start one with `.race`!' };
    if (session.started) return { ok: false, reason: 'The race has already started!' };
    if (Date.now() > session.joinWindowEndsAt) {
      this.sessions.delete(channelId);
      return { ok: false, reason: 'The join window has closed. Wait for the next race.' };
    }
    if (session.racers.has(userId)) return { ok: false, reason: "You've already joined this race." };
    if (session.racers.size >= RACE_ANIMALS.length) return { ok: false, reason: 'Race is full!' };

    const pool = this.animalPool.get(channelId) ?? [];
    const animal = pool.splice(Math.floor(Math.random() * Math.max(pool.length, 1)), 1)[0] ?? '🏃';
    this.animalPool.set(channelId, pool);

    session.racers.set(userId, { discordUserId: userId, username, animal, position: 0 });
    return { ok: true, animal };
  }

  async runRace(channelId: string, send: SendFn, edit: EditFn): Promise<string | null> {
    const session = this.sessions.get(channelId);
    if (!session || session.started) return null;

    session.started = true;

    // Animate the race over several ticks
    const TICKS = 10;
    const TICK_MS = 800;

    for (let tick = 0; tick < TICKS; tick++) {
      for (const racer of session.racers.values()) {
        racer.position = Math.min(TRACK_LENGTH, racer.position + Math.floor(Math.random() * 4) + 1);
      }

      const content = this.buildRaceDisplay(session, false);
      if (tick === 0) {
        const msg = await send(channelId, { content });
        if (msg?.id) session.messageId = msg.id;
      } else if (session.messageId) {
        try {
          await edit(channelId, session.messageId, { content });
        } catch {
          const msg = await send(channelId, { content });
          if (msg?.id) session.messageId = msg.id;
        }
      }

      await new Promise((r) => setTimeout(r, TICK_MS));

      // Check if someone finished
      const finishers = [...session.racers.values()].filter((r) => r.position >= TRACK_LENGTH);
      if (finishers.length > 0) break;
    }

    // Find winner (highest position)
    const sorted = [...session.racers.values()].sort((a, b) => b.position - a.position);
    const winner = sorted[0] ?? null;

    this.sessions.delete(channelId);
    this.animalPool.delete(channelId);

    if (!winner) return null;

    const finalContent =
      this.buildRaceDisplay(
        { ...session, racers: new Map(sorted.map((r) => [r.discordUserId, r])) },
        true
      ) + `\n\n🏆 **${winner.animal} ${winner.username}** wins the race!`;

    if (session.messageId) {
      try {
        await edit(channelId, session.messageId, { content: finalContent });
      } catch {
        await send(channelId, { content: finalContent });
      }
    } else {
      await send(channelId, { content: finalContent });
    }

    return winner.discordUserId;
  }

  private buildRaceDisplay(session: RaceSession, final: boolean): string {
    const header = final ? '🏁 **Race Finished!**' : '🏁 **Race in progress...**';
    const tracks = [...session.racers.values()].map((r) => {
      const filled = Math.min(r.position, TRACK_LENGTH);
      const track = '▬'.repeat(filled) + r.animal + '▬'.repeat(TRACK_LENGTH - filled);
      return `${track} ${r.username}`;
    });
    return `${header}\n\`\`\`\n${tracks.join('\n')}\n\`\`\``;
  }

  hasOpenSession(channelId: string): boolean {
    return this.sessions.has(channelId);
  }

  stopAllGames(): void {
    this.sessions.clear();
    this.animalPool.clear();
  }
}
