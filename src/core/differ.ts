export interface Correction {
  backspaces: number;
  insert: string;
}

export function planCorrection(prev: string, next: string): Correction | null {
  if (prev === next) return null;
  let prefix = 0;
  const limit = Math.min(prev.length, next.length);
  while (prefix < limit && prev[prefix] === next[prefix]) prefix++;
  return { backspaces: prev.length - prefix, insert: next.slice(prefix) };
}
