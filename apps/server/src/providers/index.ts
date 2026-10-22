import { getRegionProfile, type OddsProvider } from '@quest/core';
import type { Config } from '../config';
import { MockOddsProvider } from './mock';
import { OddsPapiProvider } from './oddspapi';
import { TheOddsApiProvider } from './the-odds-api';

/** Live provider when a key is configured; otherwise the keyless fixture-backed mock. */
export function createProvider(config: Config): OddsProvider {
  if (config.oddsProvider === 'oddspapi' && config.oddsPapiApiKey) {
    // OddsPapi fetches specific book slugs; derive them from the configured region profiles
    // (their allowlist + reference book are OddsPapi slugs, e.g. '7bet.lt', 'betsson', 'pinnacle').
    const books = new Set<string>();
    for (const region of config.regions) {
      const profile = getRegionProfile(region);
      for (const b of profile.bookAllowlist ?? []) books.add(b);
      if (profile.referenceBook) books.add(profile.referenceBook);
    }
    return new OddsPapiProvider({
      apiKey: config.oddsPapiApiKey,
      books: [...books],
      maxTournaments: config.oddsPapiMaxTournaments,
      // Pinned tournaments (both fundable books must quote them for arbs to exist).
      ...(config.oddsPapiTournamentIds.length
        ? { tournamentIds: config.oddsPapiTournamentIds }
        : {}),
    });
  }
  if (config.oddsProvider === 'theoddsapi' && config.oddsApiKey) {
    return new TheOddsApiProvider({ apiKey: config.oddsApiKey });
  }
  return new MockOddsProvider();
}
