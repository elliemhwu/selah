// Where a memo sits on the page (docs/selah-journal-framework.md, ADR 0030).
// No placement is stored: the side, tilt and nudge come from a hash of the
// memo's id, so memos look scattered by hand but never move between renders,
// and adding or linking one never moves the others.

export interface MemoPlacement {
  side: 'left' | 'right';
  /** Degrees, between 0.6 and 3 either way. */
  tilt: number;
  /** Pixels in from the memo's side, 0 to 24. */
  nudge: number;
}

/** 32-bit FNV-1a over the id's UTF-16 code units. */
export function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function memoPlacement(id: string): MemoPlacement {
  const hash = hashId(id);
  const side = hash & 1 ? 'right' : 'left';
  const sign = hash & 2 ? 1 : -1;
  // Never quite straight: 0.6° to 3°, in tenths.
  const tilt = sign * (0.6 + ((hash >>> 2) % 25) / 10);
  const nudge = ((hash >>> 8) % 7) * 4;
  return { side, tilt: Math.round(tilt * 10) / 10, nudge };
}
