# Quest Backend (Plan 2 of 3) Implementation Plan

> **For agentic workers:** This plan is **contract-first**. The scaffold (package, config, shared service contracts) is built inline by the orchestrator; the independent leaf modules are then implemented in parallel (one agent per module, disjoint files, each writing its own tests) against the contracts below. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A running Node backend (`apps/server`) that polls an odds provider, runs the `@quest/core` engine, persists via `@quest/db`, and serves a Hono REST API — fully functional on the `MockOddsProvider` with **no API key**, and live the moment `ODDS_API_KEY` is set.

**Architecture:** Hono API + in-process poller in one Node process. `OddsProvider` adapter (`MockOddsProvider` for keyless dev + `TheOddsApiProvider` for live). A pure-ish `detection` service wires provider → normalize → `@quest/core` detect → `@quest/db` upsert. All time comes from an injected `clock()` so logic stays testable. Reference spec: `docs/superpowers/specs/2026-06-14-quest-sports-arbitrage-design.md` (§3, §6, §7, §9).

**Tech Stack:** Hono 4 + @hono/node-server, Zod 3, tsx (dev runner), Vitest 2. Depends on `@quest/core` and `@quest/db` (workspace).

**Depends on:** Plan 1 (merged to `main`). **Followed by:** Plan 3 (React UI + Docker).

---

## File structure produced by this plan

```
apps/server/
  package.json
  tsconfig.json
  src/
    config.ts                 # [SCAFFOLD] zod env -> typed Config
    config.test.ts
    clock.ts                  # [SCAFFOLD] Clock type + systemClock (injectable time)
    providers/
      mock.ts                 # [MODULE A] MockOddsProvider (serves fixtures)
      mock.test.ts
      the-odds-api.ts         # [MODULE B] TheOddsApiProvider (HTTP + parse)
      the-odds-api.test.ts
      parse-the-odds-api.ts   # [MODULE B] pure parser: API JSON -> NormalizedMarket[]
      parse-the-odds-api.test.ts
      fixtures/the-odds-api-wc2026.json   # [MODULE A/B] shared recorded fixture
      index.ts                # [INTEGRATE] createProvider(config): OddsProvider
    detection/
      run.ts                  # [MODULE C] runDetection(deps): orchestrates one poll cycle
      run.test.ts
    poller/
      poller.ts               # [MODULE D] createPoller({intervalMs, runOnce}) start/stop
      poller.test.ts
    api/
      app.ts                  # [MODULE E] createApp(deps): Hono app
      app.test.ts
    index.ts                  # [INTEGRATE] entry: config -> db -> provider -> poller -> serve
```

`[SCAFFOLD]` = orchestrator builds inline first. `[MODULE x]` = parallel workflow agent. `[INTEGRATE]` = orchestrator wires + full-suite verify after modules land.

---

## Shared contracts (authoritative — all modules implement against these)

```ts
// config.ts
export interface Config {
  oddsProvider: 'theoddsapi' | 'mock';
  oddsApiKey?: string;            // absent => provider falls back to mock
  pollIntervalSeconds: number;    // default 300
  sports: string[];               // e.g. ['soccer_fifa_world_cup']
  regions: string[];              // region-profile ids, e.g. ['eu']
  minArbMargin: number;           // default 0.01
  minValueEdge: number;           // default 0.02
  taxRate: number;                // default 0.20 — display-only
  defaultBankroll: number;        // default 100
  stakeRounding: number;          // default 1
  port: number;                   // default 8787
  databaseUrl: string;            // default ./data/quest.sqlite
}
export function loadConfig(env: NodeJS.ProcessEnv): Config; // zod-validated, applies defaults

// clock.ts
export type Clock = () => string;            // returns ISO 8601 'now'
export const systemClock: Clock = () => new Date().toISOString();

// providers — OddsProvider interface already lives in @quest/core:
//   interface OddsProvider { readonly name: string;
//     fetchOdds(p: { sport: string; regions: string[]; markets: MarketType[] }): Promise<NormalizedMarket[]> }

// detection/run.ts
export interface DetectionDeps {
  db: QuestDb;
  provider: OddsProvider;
  config: Config;
  clock: Clock;
}
export interface DetectionSummary {
  pollRunId: number;
  marketsFetched: number;
  arbsFound: number;
  valuesFound: number;
  creditsUsed?: number;
}
// For each (sport × regionProfile): provider.fetchOdds -> for each market run
// detectArbitrage + detectValue (using profile.bookAllowlist + profile.referenceBook),
// compute defaultBankrollProfit via calcStakeSplit(arb, config.defaultBankroll,
// { rounding: config.stakeRounding }).grossProfit, upsertOpportunity (dedupeKey from core),
// persist odds_snapshots, open/close poll_run. All timestamps from clock().
export function runDetection(deps: DetectionDeps): Promise<DetectionSummary>;

// poller/poller.ts
export interface Poller { start(): void; stop(): void; runOnce(): Promise<void>; }
export function createPoller(opts: { intervalMs: number; runOnce: () => Promise<void> }): Poller;

// api/app.ts
export interface ApiDeps { db: QuestDb; config: Config; runOnce: () => Promise<void>; clock: Clock; }
export function createApp(deps: ApiDeps): Hono; // routes per spec §7
```

### The Odds API JSON shape (for MODULE B parser)
```jsonc
[ { "id": "evt...", "sport_key": "soccer_fifa_world_cup", "sport_title": "...",
    "commence_time": "2026-06-20T18:00:00Z", "home_team": "Brazil", "away_team": "Spain",
    "bookmakers": [ { "key": "pinnacle", "title": "Pinnacle", "last_update": "...",
        "markets": [ { "key": "h2h", "outcomes": [ { "name": "Brazil", "price": 2.10 },
            { "name": "Spain", "price": 3.40 }, { "name": "Draw", "price": 3.30 } ] } ] } ] } ]
```
Parser maps each event→`NormalizedMarket` for `market.key==='h2h'`: outcome `name` via `normalizeOutcomeName`, book = `bookmaker.title` via `aliasBook`, `price` is decimal (request `oddsFormat=decimal`). The Odds API returns remaining quota in the `x-requests-remaining` header → capture for `creditsUsed`.

---

# Milestone M3a — Scaffold + contracts (orchestrator, inline)

### Task 1: `apps/server` package + vitest workspace + config + clock (TDD)

**Files:** `apps/server/package.json`, `apps/server/tsconfig.json`, `vitest.workspace.ts` (modify), `apps/server/src/config.ts`, `apps/server/src/config.test.ts`, `apps/server/src/clock.ts`

- [ ] **Step 1: Create `apps/server/package.json`**

```json
{
  "name": "@quest/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@quest/core": "workspace:*",
    "@quest/db": "workspace:*",
    "hono": "^4.6.10",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create `apps/server/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Modify `vitest.workspace.ts` to include apps**

```ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['packages/*', 'apps/*']);
```

- [ ] **Step 4: Create `apps/server/src/clock.ts`**

```ts
export type Clock = () => string; // ISO 8601 'now'
export const systemClock: Clock = () => new Date().toISOString();
```

- [ ] **Step 5: Write `apps/server/src/config.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults on an empty env', () => {
    const c = loadConfig({});
    expect(c.oddsProvider).toBe('mock'); // no key => mock
    expect(c.pollIntervalSeconds).toBe(300);
    expect(c.regions).toEqual(['eu']);
    expect(c.taxRate).toBeCloseTo(0.2, 6);
    expect(c.defaultBankroll).toBe(100);
  });

  it('parses csv lists and numbers', () => {
    const c = loadConfig({ SPORTS: 'soccer,tennis', MIN_ARB_MARGIN: '0.02', STAKE_ROUNDING: '5' });
    expect(c.sports).toEqual(['soccer', 'tennis']);
    expect(c.minArbMargin).toBeCloseTo(0.02, 6);
    expect(c.stakeRounding).toBe(5);
  });

  it('uses theoddsapi when a key is present', () => {
    const c = loadConfig({ ODDS_PROVIDER: 'theoddsapi', ODDS_API_KEY: 'abc' });
    expect(c.oddsProvider).toBe('theoddsapi');
    expect(c.oddsApiKey).toBe('abc');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm install && pnpm test -- config`
Expected: FAIL — `./config` not found.

- [ ] **Step 7: Implement `apps/server/src/config.ts`**

```ts
import { z } from 'zod';

export interface Config {
  oddsProvider: 'theoddsapi' | 'mock';
  oddsApiKey?: string;
  pollIntervalSeconds: number;
  sports: string[];
  regions: string[];
  minArbMargin: number;
  minValueEdge: number;
  taxRate: number;
  defaultBankroll: number;
  stakeRounding: number;
  port: number;
  databaseUrl: string;
}

const csv = (s: string | undefined, fallback: string[]) =>
  s ? s.split(',').map((x) => x.trim()).filter(Boolean) : fallback;

const num = z.coerce.number();

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const key = env.ODDS_API_KEY?.trim() || undefined;
  const provider = (env.ODDS_PROVIDER === 'theoddsapi' && key ? 'theoddsapi' : env.ODDS_PROVIDER) ?? 'mock';
  return {
    oddsProvider: key ? (provider as 'theoddsapi' | 'mock') : 'mock',
    oddsApiKey: key,
    pollIntervalSeconds: num.catch(300).parse(env.POLL_INTERVAL_SECONDS ?? 300),
    sports: csv(env.SPORTS, ['soccer_fifa_world_cup']),
    regions: csv(env.REGIONS, ['eu']),
    minArbMargin: num.catch(0.01).parse(env.MIN_ARB_MARGIN ?? 0.01),
    minValueEdge: num.catch(0.02).parse(env.MIN_VALUE_EDGE ?? 0.02),
    taxRate: num.catch(0.2).parse(env.TAX_RATE ?? 0.2),
    defaultBankroll: num.catch(100).parse(env.DEFAULT_BANKROLL ?? 100),
    stakeRounding: num.catch(1).parse(env.STAKE_ROUNDING ?? 1),
    port: num.catch(8787).parse(env.PORT ?? 8787),
    databaseUrl: env.DATABASE_URL?.trim() || './data/quest.sqlite',
  };
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm test -- config`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(server): scaffold @quest/server + config + clock"
```

---

# Milestone M3b — Provider + detection modules (parallel workflow agents)

Each task = one agent, disjoint files, writes + greens its own tests. Contracts above are authoritative.

### Task 2 (MODULE A): MockOddsProvider + WC2026 fixture
- Create `apps/server/src/providers/fixtures/the-odds-api-wc2026.json`: a realistic The-Odds-API-shaped array with **≥3 events**, each with several bookmakers including **Pinnacle** plus soft books (e.g. Betsson, Unibet, NordicBet, Betway). Engineer the data so the pipeline yields **at least one arbitrage** (best back-prices across books sum to <1) and **at least one value bet** (a soft price beats the de-vigged Pinnacle line).
- Create `apps/server/src/providers/mock.ts`: `MockOddsProvider` implements `OddsProvider`; `name='mock'`; `fetchOdds()` reads the fixture, parses via the shared parser (Task 3's `parseTheOddsApi`), filters to the requested `sport`, returns `NormalizedMarket[]`. (Depends on Task 3's parser — both are in MODULE A/B batch; if built in parallel, import the parser by its contract signature.)
- Test `mock.test.ts`: provider returns ≥3 markets; at least one market has an arb when fed to `detectArbitrage(m, {minMargin:0.01})`.

### Task 3 (MODULE B): TheOddsApiProvider + pure parser
- Create `apps/server/src/providers/parse-the-odds-api.ts`: `parseTheOddsApi(raw: unknown): NormalizedMarket[]` — pure; maps the JSON shape above to `NormalizedMarket[]` for `h2h`; uses `aliasBook(bookmaker.title)` and `normalizeOutcomeName(outcome.name)` from `@quest/core`. Skips non-h2h markets and malformed events defensively.
- Create `apps/server/src/providers/the-odds-api.ts`: `TheOddsApiProvider` implements `OddsProvider`; `name='theoddsapi'`; constructor takes `{ apiKey }`; `fetchOdds()` GETs `https://api.the-odds-api.com/v4/sports/{sport}/odds?regions={regions.join(',')}&markets=h2h&oddsFormat=decimal&apiKey=...`, throws on non-2xx, returns `parseTheOddsApi(json)`. Expose the last `x-requests-remaining` header value via a readable property/return for credit logging.
- Tests: `parse-the-odds-api.test.ts` (parse the committed fixture → correct markets/books/outcomes, alias applied); `the-odds-api.test.ts` (use a stubbed `fetch` returning the fixture → returns parsed markets; non-2xx throws).

### Task 4 (MODULE C): detection service
- Create `apps/server/src/detection/run.ts` implementing `runDetection(deps)` per contract. Uses `getRegionProfile`, `detectArbitrage`, `detectValue`, `calcStakeSplit`, `dedupeKey` from `@quest/core`; `startPollRun`/`finishPollRun`/`upsertOpportunity` + snapshot insert from `@quest/db`. `defaultBankrollProfit = calcStakeSplit(arb, config.defaultBankroll, {rounding: config.stakeRounding}).grossProfit`. All timestamps via `deps.clock()`. Catches per-sport fetch errors → marks poll_run error but doesn't throw the whole cycle.
- Test `run.test.ts`: with a stub provider returning a known arb+value market and an in-memory `createTestDb()`, assert one cycle inserts the expected arb + value opportunities, sets `defaultBankrollProfit` (gross), writes a poll_run with status 'ok', and that a second run with the same markets dedupes (bumps last_seen, no new rows). Inject a fixed `clock`.

---

# Milestone M4 — Poller + API + integration

### Task 5 (MODULE D): poller
- Create `apps/server/src/poller/poller.ts` per contract: `createPoller` returns `{start, stop, runOnce}`; `start()` calls `runOnce()` immediately then `setInterval(runOnce, intervalMs)`; `stop()` clears it; never overlaps (guard a `running` flag). 
- Test `poller.test.ts`: with `vi.useFakeTimers()` and a counting `runOnce`, `start()` triggers an immediate run and one per interval; `stop()` halts; overlapping runs are skipped while one is in-flight.

### Task 6 (MODULE E): Hono API
- Create `apps/server/src/api/app.ts`: `createApp(deps)` returns a Hono app with routes per spec §7: `GET /api/opportunities` (zod-validated query → `listOpportunities` + each opp's legs; supports status[default 'new'], type, sport, region, minMargin; `sort=timeToEvent` orders by commence_time asc), `GET /api/opportunities/:id`, `POST /api/opportunities/:id/status` (body `{status, placement?}`; on `bet_placed` with placement → `recordPlacement`), `POST /api/opportunities/:id/settlement`, `GET /api/stats` (`computeStats`), `POST /api/poll` (`deps.runOnce()`), `GET /api/meta` (config snapshot + region profiles + lastPoll), `GET /api/sports`. JSON errors with appropriate status codes.
- Test `app.test.ts`: using `createTestDb()` seeded via `upsertOpportunity`, exercise the app with `app.request(...)`: list returns seeded new opps with legs; status filter works; `POST /status` transitions and (bet_placed) records a placement; `/stats` returns aggregates; `/poll` invokes the injected `runOnce`. 

### Task 7 (INTEGRATE, orchestrator): provider factory + entry + full verify
- Create `apps/server/src/providers/index.ts`: `createProvider(config)` → `MockOddsProvider` if `config.oddsProvider==='mock'` else `new TheOddsApiProvider({apiKey})`.
- Create `apps/server/src/index.ts`: load config → `createDb(databaseUrl)` + `applyMigrations` (mkdir data dir) → `createProvider` → build `runOnce = () => runDetection({db, provider, config, clock})` → `createPoller` + `start()` → `serve(createApp({db, config, runOnce, clock}))` on `config.port`. Log startup + provider mode.
- [ ] Run full suite + typecheck + lint: `pnpm test && pnpm typecheck && pnpm lint` → all green.
- [ ] Smoke-run keyless: `node` start the server briefly, `curl localhost:8787/api/opportunities` returns mock-derived opportunities; `POST /api/poll` then list shows arbs/values. Capture output.
- [ ] Commit.

---

# Milestone M4-review — Adversarial verification (workflow)

After integration is green, run a multi-agent review workflow over the backend diff: dimensions = {OddsProvider-contract conformance, The-Odds-API parser correctness vs real schema, detection wiring (dedupe/last_seen/snapshot/credits), money wiring (gross defaultBankrollProfit; tax stays display-only), API contract + zod validation + status codes, poller overlap/timer safety, error handling on provider failure}. Each finding adversarially verified before accepting. Apply confirmed fixes, re-green, then proceed to finishing-a-development-branch.

---

## Acceptance criteria (Plan 2 done)
1. `pnpm test && pnpm typecheck && pnpm lint` green across all packages + server.
2. Keyless: server boots on `MockOddsProvider`, a poll detects arbs + values from the fixture, and they are queryable via the API with legs + gross `defaultBankrollProfit`.
3. Dedupe/last_seen works across repeated polls (edge-survival data accrues).
4. Setting `ODDS_API_KEY` switches to `TheOddsApiProvider` (parser verified against the committed fixture).
5. Lifecycle (`/status`) + settlement (`/settlement`) + stats (`/stats`) endpoints function; tax never affects detection or the headline gross profit.
6. No automated placement, no LLM calls, no fund handling.
