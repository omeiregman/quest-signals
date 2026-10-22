import { describe, expect, it } from 'vitest';
import { aliasBook, normalizeOutcomeName } from './normalize';

describe('aliasBook', () => {
  it('maps Betsafe to Betsson (case-insensitive)', () => {
    expect(aliasBook('Betsafe')).toBe('Betsson');
    expect(aliasBook('betsafe')).toBe('Betsson');
  });

  it('trims and preserves unknown books', () => {
    expect(aliasBook('  Pinnacle ')).toBe('Pinnacle');
  });
});

describe('normalizeOutcomeName', () => {
  it('maps Tie to Draw', () => {
    expect(normalizeOutcomeName('Tie')).toBe('Draw');
    expect(normalizeOutcomeName('tie')).toBe('Draw');
  });

  it('preserves team names', () => {
    expect(normalizeOutcomeName('Brazil')).toBe('Brazil');
  });
});
