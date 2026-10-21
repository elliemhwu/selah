import { hashId, memoPlacement } from './memo-layout';

describe('memoPlacement', () => {
  const ids = Array.from({ length: 400 }, (_, i) => `0192f0a4-7c1e-7${String(i).padStart(3, '0')}-8a2b-3c4d5e6f7a8b`);

  it('gives the same placement for the same id, every time', () => {
    for (const id of ids.slice(0, 20)) expect(memoPlacement(id)).toEqual(memoPlacement(id));
    // Pinned, so a change to the hash shows up here: it would move every memo already on a page.
    expect(hashId('')).toBe(0x811c9dc5);
    expect(hashId('memo-1')).toBe(1300278913);
    expect(memoPlacement('memo-1')).toEqual({ side: 'right', tilt: -0.9, nudge: 0 });
    expect(memoPlacement('memo-2')).toEqual({ side: 'left', tilt: -2, nudge: 12 });
  });

  it('keeps the tilt slight but never straight, and the nudge small', () => {
    for (const id of ids) {
      const { tilt, nudge } = memoPlacement(id);
      expect(Math.abs(tilt)).toBeGreaterThanOrEqual(0.6);
      expect(Math.abs(tilt)).toBeLessThanOrEqual(3);
      expect(nudge).toBeGreaterThanOrEqual(0);
      expect(nudge).toBeLessThanOrEqual(24);
    }
  });

  it('spreads memos over both sides and both tilts', () => {
    const placements = ids.map(memoPlacement);
    const left = placements.filter((p) => p.side === 'left').length / ids.length;
    const tiltedLeft = placements.filter((p) => p.tilt < 0).length / ids.length;
    expect(left).toBeGreaterThan(0.4);
    expect(left).toBeLessThan(0.6);
    expect(tiltedLeft).toBeGreaterThan(0.4);
    expect(tiltedLeft).toBeLessThan(0.6);
    expect(new Set(placements.map((p) => p.tilt)).size).toBeGreaterThan(10);
  });

  it('places ids that differ by one character independently', () => {
    const near = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'].map(memoPlacement);
    expect(new Set(near.map((p) => `${p.side}${p.tilt}`)).size).toBeGreaterThan(3);
  });
});
