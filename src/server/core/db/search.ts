/** A `%term%` ILIKE pattern where `%`, `_` and `\` in user input match literally. */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
