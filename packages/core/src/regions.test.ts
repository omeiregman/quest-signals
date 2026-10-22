import { describe, expect, it } from 'vitest';
import { REGION_PROFILES, getRegionProfile } from './regions';

describe('region profiles', () => {
  it('ships the-odds-api (eu/se/lt) + oddspapi (lt-arb/ng-arb) profiles', () => {
    expect(Object.keys(REGION_PROFILES).sort()).toEqual(['eu', 'lt', 'lt-arb', 'ng-arb', 'se']);
  });

  it('lt-arb pairs the two independent, fundable LT books (OddsPapi slugs) vs pinnacle', () => {
    expect(REGION_PROFILES['lt-arb']!.bookAllowlist).toEqual(['7bet.lt', 'betsson']);
    expect(REGION_PROFILES['lt-arb']!.referenceBook).toBe('pinnacle');
    expect(REGION_PROFILES['ng-arb']!.bookAllowlist).toEqual(['sportybet', 'msport']);
  });

  it('eu is broad (no allowlist) and has a sharp reference', () => {
    expect(REGION_PROFILES.eu!.bookAllowlist).toBeUndefined();
    expect(REGION_PROFILES.eu!.referenceBook).toBe('Pinnacle');
  });

  it('se restricts to SE-licensed soft books', () => {
    expect(REGION_PROFILES.se!.bookAllowlist).toContain('Betsson');
    expect(REGION_PROFILES.se!.bookAllowlist).toContain('Unibet');
  });

  it('getRegionProfile falls back to eu for unknown ids', () => {
    expect(getRegionProfile('nope').id).toBe('eu');
  });
});
