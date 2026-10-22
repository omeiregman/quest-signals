const BOOK_ALIASES: Record<string, string> = {
  betsafe: 'Betsson',
};

const OUTCOME_ALIASES: Record<string, string> = {
  tie: 'Draw',
  x: 'Draw',
};

export function aliasBook(name: string): string {
  const trimmed = name.trim();
  return BOOK_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function normalizeOutcomeName(name: string): string {
  const trimmed = name.trim();
  return OUTCOME_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}
