import { OnModuleDestroy } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  YoutubeOAuthFlow,
  YoutubeOAuthStateStore,
} from '../../domain/credential/youtube-oauth-state-store';

export const YOUTUBE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

interface Entry {
  flow: YoutubeOAuthFlow;
  expiresAt: number;
}

/**
 * In memory only: the service is a single instance (SQLite) and a restart
 * merely forces the user to restart a flow that lives at most 10 minutes.
 * Keyed by sha256(state) so the raw secret is not retained in the heap.
 */
export class InMemoryYoutubeOAuthStateStore
  extends YoutubeOAuthStateStore
  implements OnModuleDestroy
{
  /** Insertion order is expiry order (constant TTL): purging stops at the first live entry. */
  private readonly entries = new Map<string, Entry>();
  private readonly keyByUser = new Map<string, string>();
  private readonly sweepTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly ttlMs: number = YOUTUBE_OAUTH_STATE_TTL_MS,
    private readonly now: () => number = Date.now,
    sweepIntervalMs: number = ttlMs,
  ) {
    super();
    // Purge on access alone would leave the encrypted client secrets of an idle service in the
    // heap past their TTL. unref(): the timer never keeps the process alive.
    if (sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(
        () => this.purge(this.now()),
        sweepIntervalMs,
      );
      this.sweepTimer.unref();
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  get size(): number {
    return this.entries.size;
  }

  issue(flow: YoutubeOAuthFlow): Promise<string> {
    const at = this.now();
    this.purge(at);
    const previous = this.keyByUser.get(flow.userId);
    if (previous) {
      this.entries.delete(previous);
    }
    const state = randomBytes(32).toString('base64url');
    const key = hash(state);
    this.entries.set(key, { flow, expiresAt: at + this.ttlMs });
    this.keyByUser.set(flow.userId, key);
    return Promise.resolve(state);
  }

  // get + delete happen in one synchronous tick: two concurrent callbacks
  // with the same state cannot both succeed.
  consume(state: string): Promise<YoutubeOAuthFlow | null> {
    const at = this.now();
    this.purge(at);
    const key = hash(state);
    const entry = this.entries.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }
    this.entries.delete(key);
    if (this.keyByUser.get(entry.flow.userId) === key) {
      this.keyByUser.delete(entry.flow.userId);
    }
    return Promise.resolve(entry.flow);
  }

  private purge(at: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > at) {
        break;
      }
      this.entries.delete(key);
      if (this.keyByUser.get(entry.flow.userId) === key) {
        this.keyByUser.delete(entry.flow.userId);
      }
    }
  }
}

function hash(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}
