import { RecentIds } from './seen-ids';

describe('RecentIds', () => {
  let now = 1_000_000;
  const clock = () => now;
  beforeEach(() => {
    now = 1_000_000;
  });

  it('remembers an id only once within the window', () => {
    const ids = new RecentIds(600_000, clock);
    expect(ids.remember('a')).toBe(true);
    expect(ids.remember('a')).toBe(false);
    expect(ids.remember('b')).toBe(true);
  });

  it('forgets an id after the window, and a repeated attempt does not extend it', () => {
    const ids = new RecentIds(600_000, clock);
    ids.remember('a');
    now += 599_999;
    expect(ids.remember('a')).toBe(false);
    now += 2;
    expect(ids.remember('a')).toBe(true);
  });

  it('purges expired ids so memory stays bounded', () => {
    const ids = new RecentIds(600_000, clock);
    for (let i = 0; i < 100; i += 1) {
      ids.remember(`id-${i.toString()}`);
    }
    expect(ids.size).toBe(100);
    now += 600_001;
    ids.remember('fresh');
    expect(ids.size).toBe(1);
  });
});
