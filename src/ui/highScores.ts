// Top 5 scores per level and difficulty, with 3-letter names (arcade style), kept in localStorage.
// insertEntry() is pure so it is tested in Node (tests/helpers.test.ts).
export type Entry = { name: string; score: number };
type Hero = 'wizard' | 'warden';

const KEY = 'sigil-siege-top5';
export const TOP_N = 5;

/** One board per hero + difficulty, e.g. "warden:hard". */
export const boardKey = (hero: Hero, difficulty: string) => `${hero}:${difficulty}`;

/** Add an entry to a board (highest first, ties keep the older entry first). Returns the new board
 *  and the entry's place (0 = top), or -1 if it didn't make the top 5. */
export function insertEntry(board: Entry[], entry: Entry): { board: Entry[]; rank: number } {
  const next = [...board];
  let rank = next.findIndex((e) => entry.score > e.score);
  if (rank < 0) rank = next.length;
  if (rank >= TOP_N) return { board, rank: -1 };
  next.splice(rank, 0, entry);
  return { board: next.slice(0, TOP_N), rank };
}

/** Would this score make the board? */
export function qualifies(board: Entry[], score: number): boolean {
  return score > 0 && (board.length < TOP_N || score > board[board.length - 1].score);
}

function loadAll(): Record<string, Entry[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Entry[]>;
  } catch {
    return {};
  }
}

export function topScores(hero: Hero, difficulty: string): Entry[] {
  return loadAll()[boardKey(hero, difficulty)] ?? [];
}

/** Save a score; returns its place on the board (0 = top) or -1. */
export function saveScore(hero: Hero, difficulty: string, name: string, score: number): number {
  const all = loadAll();
  const key = boardKey(hero, difficulty);
  const { board, rank } = insertEntry(all[key] ?? [], { name, score });
  all[key] = board;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage blocked: the board just isn't kept
  }
  return rank;
}
