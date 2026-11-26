import { InMemoryYoutubeOAuthStateStore } from './in-memory-youtube-oauth-state-store';

describe('InMemoryYoutubeOAuthStateStore', () => {
  let nowMs: number;
  let store: InMemoryYoutubeOAuthStateStore;
  const flow = { userId: 'u1', credentialId: 'c1' };

  beforeEach(() => {
    nowMs = 1_000_000;
    store = new InMemoryYoutubeOAuthStateStore(60_000, () => nowMs);
  });

  it('issues unpredictable, distinct states unrelated to the credential id', async () => {
    const a = await store.issue({ userId: 'u1', credentialId: 'c1' });
    const b = await store.issue({ userId: 'u2', credentialId: 'c2' });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toContain('c1');
  });

  it('consumes a state once and returns the bound flow', async () => {
    const state = await store.issue(flow);
    expect(await store.consume(state)).toEqual(flow);
    expect(await store.consume(state)).toBeNull();
  });

  it('refuses concurrent double consumption', async () => {
    const state = await store.issue(flow);
    const results = await Promise.all([
      store.consume(state),
      store.consume(state),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('refuses an unknown state', async () => {
    expect(await store.consume('nope')).toBeNull();
  });

  it('refuses an expired state and sweeps it', async () => {
    const state = await store.issue(flow);
    nowMs += 60_000;
    expect(await store.consume(state)).toBeNull();
    expect(store.size).toBe(0);
  });

  it('accepts a state just before expiry', async () => {
    const state = await store.issue(flow);
    nowMs += 59_999;
    expect(await store.consume(state)).toEqual(flow);
  });

  it('keeps one outstanding state per user (a new start supersedes the old)', async () => {
    const first = await store.issue(flow);
    const second = await store.issue(flow);
    expect(await store.consume(first)).toBeNull();
    expect(await store.consume(second)).toEqual(flow);
    expect(store.size).toBe(0);
  });

  it('does not let one user supersede another', async () => {
    const a = await store.issue(flow);
    const b = await store.issue({ userId: 'u2', credentialId: 'c2' });
    expect(await store.consume(a)).toEqual(flow);
    expect(await store.consume(b)).not.toBeNull();
  });
});
