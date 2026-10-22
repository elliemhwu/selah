const EXCERPT_LENGTH = 90;

/** The first line with words in it, shortened; shown only, never stored (ADR 0030). */
export function excerptOf(body: string): string {
  const line = body.split('\n').find((l) => l.trim() !== '')?.trim() ?? '';
  return line.length > EXCERPT_LENGTH ? `${line.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : line;
}
