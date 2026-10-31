// Order within a list is a number (ADR 0033): a row moved between two others
// takes their midpoint, so reordering saves one row.

/** A position after every given row. */
export function positionAtEnd(rows: readonly { position: number }[]): number {
  return rows.length === 0 ? 1 : Math.max(...rows.map((r) => r.position)) + 1;
}

/** A position between two neighbours; either may be missing at the ends of the list. */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}
