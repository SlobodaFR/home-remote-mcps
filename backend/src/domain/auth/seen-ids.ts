/**
 * Ids seen recently, in memory only (lost on restart: the 120 s timestamp window bounds what a
 * restart can let through). Used to refuse a replayed webhook delivery (contract PC7: an id
 * already seen in the last 10 minutes).
 */
export class RecentIds {
  /** Insertion order is expiry order (constant TTL), so purging stops at the first live entry. */
  private readonly expiries = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.expiries.size;
  }

  private purge(at: number): void {
    for (const [known, expiresAt] of this.expiries) {
      if (expiresAt > at) {
        break;
      }
      this.expiries.delete(known);
    }
  }

  /** True when the id was remembered within the window (nothing is recorded). */
  has(id: string): boolean {
    this.purge(this.now());
    return this.expiries.has(id);
  }

  /** True the first time an id is seen within the window, false for a repeat. */
  remember(id: string): boolean {
    const at = this.now();
    this.purge(at);
    if (this.expiries.has(id)) {
      return false;
    }
    this.expiries.set(id, at + this.ttlMs);
    return true;
  }
}
