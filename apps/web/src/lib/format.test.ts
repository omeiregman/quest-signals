import { describe, expect, it } from 'vitest';
import { formatMoney, formatOdds, formatPercent, formatSurvival, timeToKickoff } from './format';

describe('format helpers', () => {
  it('formats odds to 2dp', () => {
    expect(formatOdds(2.5)).toBe('2.50');
    expect(formatOdds(3.333)).toBe('3.33');
  });

  it('formats money with sign and 2dp', () => {
    expect(formatMoney(19)).toBe('€19.00');
    expect(formatMoney(-5.5)).toBe('-€5.50');
  });

  it('formats percent', () => {
    expect(formatPercent(0.1654)).toBe('16.5%');
  });

  it('computes time to kickoff', () => {
    const now = Date.parse('2026-06-20T12:00:00Z');
    expect(timeToKickoff('2026-06-22T16:00:00Z', now)).toBe('2d 4h');
    expect(timeToKickoff('2026-06-20T13:30:00Z', now)).toBe('1h 30m');
    expect(timeToKickoff('2026-06-20T12:20:00Z', now)).toBe('20m');
    expect(timeToKickoff('2026-06-20T11:00:00Z', now)).toBe('live/started');
  });

  it('formats survival durations', () => {
    expect(formatSurvival(45)).toBe('45s');
    expect(formatSurvival(600)).toBe('10m');
  });
});
