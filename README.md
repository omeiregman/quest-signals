# Quest — Sports Arbitrage & Value-Bet Detection

Self-hosted web app that continuously aggregates bookmaker odds, detects **arbitrage**
(combined implied probability < 100%) and **value bets** (edge vs a sharp reference),
pre-computes stake splits with a **bidirectional calculator**, and logs every opportunity
so you can measure whether real edges actually appear — and how long they survive.

The money math is pure, deterministic, and fully unit-tested. v1 places **no bets** (you
place manually across two windows); there is **no LLM** in the detection path. Tax is
**display-only** — it never affects whether something is a good arb; gross is the headline.

## Architecture

```
[Odds API] → Poller → Normalizer → Detection engine (arb + value)   ← packages/core (pure, no I/O)
                                          ↓
                                   SQLite (Drizzle)                  ← packages/db
                                          ↓
                              Hono API ← React UI                    ← apps/server, apps/web
```

- **`packages/core`** — pure engine: arbitrage, value/de-vig, the bidirectional stake
  calculator, normalization, region profiles, dedupe keys. Zero dependencies. The heart.
- **`packages/db`** — Drizzle schema + typed repositories over `better-sqlite3`.
- **`apps/server`** — Hono REST API + in-process poller. Providers behind an `OddsProvider`
  adapter: `TheOddsApiProvider` (live) and `MockOddsProvider` (keyless, fixture-backed).
- **`apps/web`** — React + Vite SPA. Clean, minimal, dark/light. Reuses `packages/core` for
  the live calculator.

## Quick start (dev)

```bash
pnpm install
pnpm test          # 100+ tests across all packages
pnpm typecheck
pnpm lint

# Run the backend (keyless — uses the mock provider with World Cup fixtures):
pnpm --filter @quest/server start      # API + poller on http://localhost:8787

# In another terminal, the UI (proxies /api → :8787):
pnpm --filter @quest/web dev           # http://localhost:5173
```

No API key needed to try it: the mock provider serves realistic fixtures that contain a
genuine arbitrage and several value bets.

## Going live

1. Get a key from [The Odds API](https://the-odds-api.com/) (free tier is enough to start).
2. Copy `.env.example` → `.env` and set `ODDS_API_KEY` (the provider auto-switches to live).
3. Tune `POLL_INTERVAL_SECONDS`, `SPORTS`, `REGIONS`, thresholds, `DEFAULT_BANKROLL`,
   `STAKE_ROUNDING`, `TAX_RATE` (display-only). See `.env.example` and `docs/research.md`.

**Region profiles** (`REGIONS`): `eu` (broad, default), `se` (Sweden-licensed soft books),
`lt` (Lithuania — value-bets-mostly; see `docs/research.md` for why). A region = an API
region param + a fundability allowlist; swapping it is config, not code.

## Docker (recommended for self-hosting)

```bash
docker compose up --build          # serves the full app (API + UI) on :8787
```

SQLite persists in `./data`. To go live, create `.env` first (it's loaded if present).
Expose privately with your existing **Cloudflare Tunnel** pointed at `localhost:8787`.

## Status & docs

- Build is delivered in three plans (all merged): foundation (engine + db) → backend
  (providers, poller, API) → frontend + ship. See `docs/superpowers/`.
- **Phase 0 research** (API choice, Lithuania-licensed books, the coverage intersection,
  Betfair feasibility, rate limits → polling cadence): `docs/research.md`.
- **Design spec**: `docs/superpowers/specs/2026-06-14-quest-sports-arbitrage-design.md`.

## Not in v1 (clean seams left)

- **Automated placement** — manual only. A Phase-3 Betfair Exchange spike is documented
  in `docs/research.md` (free delayed key for data; the real economics are the commission +
  premium charge).
- **LLM features** — an `LLMProvider`/post-processor seam exists for later (settlement note
  parsing, name reconciliation fallback, a weekly analytics digest). Advisory only; the
  money math stays deterministic.
