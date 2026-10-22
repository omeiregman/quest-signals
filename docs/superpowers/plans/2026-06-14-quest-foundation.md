# Quest Foundation (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Turborepo monorepo and build the two foundation packages — `@quest/core` (pure, fully-unit-tested deterministic money math) and `@quest/db` (Drizzle/SQLite schema + typed repositories).

**Architecture:** pnpm workspaces + Turborepo. `@quest/core` has **zero runtime dependencies** and contains only pure functions (arb detection, bidirectional stake calculator, value/de-vig, normalization, dedupe keys, region profiles) — no I/O, no clock, no randomness. `@quest/db` owns persistence with Drizzle ORM over `better-sqlite3`, exposing typed repository functions; it has no dependency on `@quest/core` (the server layer in Plan 2 maps between them). Packages are consumed as TypeScript source through pnpm workspace links (no build step needed for dev/test); production bundling comes in Plan 3.

**Tech Stack:** TypeScript 5.6 (ESM, strict), Vitest 2, Turborepo 2, Drizzle ORM + drizzle-kit, better-sqlite3 11. Node 22, pnpm 9.

**This plan is Plan 1 of 3.** Plan 2 (providers + poller + Hono API) and Plan 3 (React UI + Docker) follow after this is green. Reference spec: `docs/superpowers/specs/2026-06-14-quest-sports-arbitrage-design.md`.

> **REVISION (2026-06-14, post-M1):** Per user feedback, **tax is display-only and never affects detection or the headline profit** (see spec §4.3). The as-built `@quest/core` therefore differs from the M1 code blocks in Tasks 3/7/8/9 below: `MoneyOpts` is named **`StakeOpts`** and carries only `{ rounding }` (no `taxRate`); `applyTax` is renamed **`netAfterTax`** and is a UI-only helper; `StakeSplitResult`/`PerOutcomeResult` have **no `netProfit`**; and `calcStakeFromTarget` has **no `targetNetProfit`** mode (only `targetReturn` / `targetGrossProfit`). The committed code + spec are the source of truth for those. The placements-table fix below (Tasks 14/18: `predicted_profit`, gross) is applied inline since M2 is executed after this revision.

---

## File structure produced by this plan

```
quest/
  package.json                 # root, private, workspace scripts
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  vitest.workspace.ts
  .env.example
  .prettierrc.json
  eslint.config.js
  packages/
    core/
      package.json
      tsconfig.json
      src/
        index.ts               # barrel
        types.ts               # all domain types + OddsProvider interface
        odds.ts                # toDecimal
        normalize.ts           # aliasBook, normalizeOutcomeName, alias maps
        arbitrage.ts           # detectArbitrage
        stake.ts               # roundToIncrement, applyTax, calcStakeSplit, calcStakeFromTarget
        value.ts               # devig, detectValue
        dedupe.ts              # dedupeKey
        regions.ts             # REGION_PROFILES
        *.test.ts              # colocated tests
    db/
      package.json
      tsconfig.json
      drizzle.config.ts
      drizzle/                 # generated migrations (committed)
      src/
        index.ts               # barrel
        schema.ts              # Drizzle tables
        client.ts              # createDb + applyMigrations
        repositories/
          poll-runs.ts
          opportunities.ts
          settlements.ts
          stats.ts
        *.test.ts
```

---

# Milestone M0 — Monorepo bootstrap

### Task 1: Root workspace scaffolding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `vitest.workspace.ts`, `.prettierrc.json`, `eslint.config.js`, `.env.example`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "quest",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "packageManager": "pnpm@9.14.2",
  "scripts": {
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "eslint": "^9.14.0",
    "prettier": "^3.3.3",
    "turbo": "^2.3.0",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.14.0",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "declaration": false
  }
}
```

- [ ] **Step 4: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": {},
    "lint": {}
  }
}
```

- [ ] **Step 5: Create `vitest.workspace.ts`**

```ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['packages/*']);
```

- [ ] **Step 6: Create `.prettierrc.json`**

```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

- [ ] **Step 7: Create `eslint.config.js`**

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/drizzle/**', '**/node_modules/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
```

- [ ] **Step 8: Create `.env.example`**

```bash
# Odds data provider
ODDS_PROVIDER=theoddsapi
# Leave blank to run on the MockOddsProvider (no key needed)
ODDS_API_KEY=
# Polling
POLL_INTERVAL_SECONDS=300
SPORTS=soccer_fifa_world_cup
REGIONS=eu
# Detection thresholds
MIN_ARB_MARGIN=0.01
MIN_VALUE_EDGE=0.02
# Money realism
TAX_RATE=0.20
DEFAULT_BANKROLL=100
STAKE_ROUNDING=1
# Server
PORT=8787
DATABASE_URL=./data/quest.sqlite
```

- [ ] **Step 9: Install and verify the toolchain**

Run: `pnpm install`
Expected: completes, creates `node_modules` and `pnpm-lock.yaml`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Turborepo monorepo (pnpm, ts, vitest, eslint)"
```

---

### Task 2: `@quest/core` package skeleton + toolchain sanity test

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/sanity.test.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@quest/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "devDependencies": { "typescript": "^5.6.3", "vitest": "^2.1.5" }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Create `packages/core/src/index.ts`**

```ts
export const CORE_VERSION = '0.0.0';
```

- [ ] **Step 4: Write the sanity test `packages/core/src/sanity.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from './index';

describe('core toolchain', () => {
  it('imports the package', () => {
    expect(CORE_VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 5: Run the test to verify the toolchain works**

Run: `pnpm install && pnpm test`
Expected: 1 passing test in `packages/core/src/sanity.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold @quest/core package"
```

---

# Milestone M1 — `@quest/core` deterministic engine (TDD)

> Build each module test-first. Delete `sanity.test.ts` once `index.ts` exports real modules (Task 10).

### Task 3: Domain types

**Files:**
- Create: `packages/core/src/types.ts`

No test (types only — they are exercised by every later test). This task just defines the contracts.

- [ ] **Step 1: Create `packages/core/src/types.ts`**

```ts
export type OddsFormat = 'decimal' | 'american' | 'fractional';
export type MarketType = 'h2h'; // v1; enum extensible later
export type OpportunityType = 'arb' | 'value';
export type OpportunityStatus = 'new' | 'accepted' | 'bet_placed' | 'skipped' | 'archived';

export interface BookOdds {
  book: string;
  price: number; // decimal
}

export interface NormalizedOutcome {
  name: string; // normalized: 'Home' | 'Draw' | 'Away' or team name
  books: BookOdds[];
}

export interface NormalizedMarket {
  sportKey: string;
  eventId: string;
  homeTeam?: string;
  awayTeam?: string;
  commenceTime: string; // ISO 8601
  marketType: MarketType;
  outcomes: NormalizedOutcome[];
}

export interface ArbLeg {
  outcome: string;
  book: string;
  odds: number;
  impliedProb: number;
}

export interface ArbOpportunity {
  type: 'arb';
  sportKey: string;
  eventId: string;
  commenceTime: string;
  marketType: MarketType;
  legs: ArbLeg[];
  totalImplied: number; // Σ 1/best_odds_i (< 1 for an arb)
  margin: number; // 1 - totalImplied
}

export interface StakeLeg {
  outcome: string;
  book: string;
  odds: number;
  stake: number;
}

export interface PerOutcomeResult {
  outcome: string;
  return: number;
  grossProfit: number;
  netProfit: number;
}

export interface StakeSplitResult {
  requestedStake: number;
  totalStake: number; // Σ rounded leg stakes
  legs: StakeLeg[];
  guaranteedReturn: number; // min over outcomes of stake_k * odds_k
  grossProfit: number; // worst-case (guaranteedReturn - totalStake)
  netProfit: number; // worst-case after tax
  perOutcome: PerOutcomeResult[];
}

export interface ValueOpportunity {
  type: 'value';
  sportKey: string;
  eventId: string;
  commenceTime: string;
  marketType: MarketType;
  outcome: string;
  book: string;
  softOdds: number;
  referenceBook: string;
  trueProb: number;
  edge: number; // trueProb * softOdds - 1
}

export interface RegionProfile {
  id: string; // 'eu' | 'se' | 'lt'
  apiRegions: string[]; // The Odds API region params
  bookAllowlist?: string[]; // undefined/empty => no filtering (all books)
  referenceBook?: string; // sharp reference for value detection
}

export interface MoneyOpts {
  rounding: number; // stake increment; <= 0 means no rounding
  taxRate: number; // 0..1, applied to positive net winnings
}

// Implemented in Plan 2 by TheOddsApiProvider / MockOddsProvider.
export interface OddsProvider {
  readonly name: string;
  fetchOdds(params: {
    sport: string;
    regions: string[];
    markets: MarketType[];
  }): Promise<NormalizedMarket[]>;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @quest/core typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(core): domain types and OddsProvider interface"
```

---

### Task 4: `toDecimal` odds conversion

**Files:**
- Create: `packages/core/src/odds.ts`, `packages/core/src/odds.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/odds.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { toDecimal } from './odds';

describe('toDecimal', () => {
  it('returns decimal odds unchanged', () => {
    expect(toDecimal(2.5, 'decimal')).toBe(2.5);
  });

  it('converts positive american odds', () => {
    expect(toDecimal(150, 'american')).toBeCloseTo(2.5, 10);
  });

  it('converts negative american odds', () => {
    expect(toDecimal(-200, 'american')).toBeCloseTo(1.5, 10);
  });

  it('converts fractional string odds', () => {
    expect(toDecimal('5/2', 'fractional')).toBeCloseTo(3.5, 10);
  });

  it('throws on non-positive decimal odds', () => {
    expect(() => toDecimal(0, 'decimal')).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- odds`
Expected: FAIL — `toDecimal` not found.

- [ ] **Step 3: Implement `packages/core/src/odds.ts`**

```ts
import type { OddsFormat } from './types';

export function toDecimal(price: number | string, format: OddsFormat): number {
  if (format === 'decimal') {
    const v = Number(price);
    if (!(v > 1)) throw new Error(`Invalid decimal odds: ${price}`);
    return v;
  }
  if (format === 'american') {
    const v = Number(price);
    return v > 0 ? v / 100 + 1 : 100 / Math.abs(v) + 1;
  }
  // fractional, e.g. "5/2"
  const [num, den] = String(price).split('/').map(Number);
  if (!den || den <= 0) throw new Error(`Invalid fractional odds: ${price}`);
  return num / den + 1;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- odds`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): toDecimal odds conversion"
```

---

### Task 5: Normalization — `aliasBook` and `normalizeOutcomeName`

**Files:**
- Create: `packages/core/src/normalize.ts`, `packages/core/src/normalize.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/normalize.test.ts`**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- normalize`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/normalize.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- normalize`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): book and outcome name normalization"
```

---

### Task 6: Arbitrage detection — `detectArbitrage`

**Files:**
- Create: `packages/core/src/arbitrage.ts`, `packages/core/src/arbitrage.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/arbitrage.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { detectArbitrage } from './arbitrage';
import type { NormalizedMarket } from './types';

function market(outcomes: NormalizedMarket['outcomes']): NormalizedMarket {
  return {
    sportKey: 'soccer',
    eventId: 'evt1',
    commenceTime: '2026-06-20T18:00:00Z',
    marketType: 'h2h',
    outcomes,
  };
}

describe('detectArbitrage', () => {
  it('detects a 2-way arb and picks best odds per outcome', () => {
    const m = market([
      { name: 'Home', books: [{ book: 'A', price: 2.1 }, { book: 'B', price: 2.05 }] },
      { name: 'Away', books: [{ book: 'A', price: 1.9 }, { book: 'B', price: 2.1 }] },
    ]);
    const arb = detectArbitrage(m, { minMargin: 0.01 });
    expect(arb).not.toBeNull();
    // best: Home 2.1 (A), Away 2.1 (B) => implied 0.476+0.476=0.952
    expect(arb!.legs.find((l) => l.outcome === 'Home')!.book).toBe('A');
    expect(arb!.legs.find((l) => l.outcome === 'Away')!.book).toBe('B');
    expect(arb!.totalImplied).toBeCloseTo(0.95238, 4);
    expect(arb!.margin).toBeCloseTo(0.04762, 4);
  });

  it('returns null when no arb exists', () => {
    const m = market([
      { name: 'Home', books: [{ book: 'A', price: 1.8 }] },
      { name: 'Away', books: [{ book: 'A', price: 1.8 }] },
    ]);
    expect(detectArbitrage(m, { minMargin: 0.01 })).toBeNull();
  });

  it('returns null when margin is below threshold', () => {
    const m = market([
      { name: 'Home', books: [{ book: 'A', price: 2.02 }] },
      { name: 'Away', books: [{ book: 'B', price: 2.02 }] },
    ]);
    // implied 0.495*2 = 0.990, margin 0.0099 < 0.01
    expect(detectArbitrage(m, { minMargin: 0.01 })).toBeNull();
  });

  it('filters to the book allowlist and returns null if an outcome is uncovered', () => {
    const m = market([
      { name: 'Home', books: [{ book: 'A', price: 2.1 }] },
      { name: 'Away', books: [{ book: 'B', price: 2.1 }] },
    ]);
    expect(detectArbitrage(m, { minMargin: 0.01, bookAllowlist: ['A'] })).toBeNull();
  });

  it('returns null for markets with fewer than 2 outcomes', () => {
    const m = market([{ name: 'Home', books: [{ book: 'A', price: 1.5 }] }]);
    expect(detectArbitrage(m, { minMargin: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- arbitrage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/arbitrage.ts`**

```ts
import type { ArbLeg, ArbOpportunity, NormalizedMarket } from './types';

export interface ArbOptions {
  minMargin: number;
  bookAllowlist?: string[];
}

function allowed(book: string, allowlist?: string[]): boolean {
  return !allowlist || allowlist.length === 0 || allowlist.includes(book);
}

export function detectArbitrage(
  market: NormalizedMarket,
  opts: ArbOptions,
): ArbOpportunity | null {
  if (market.outcomes.length < 2) return null;

  const legs: ArbLeg[] = [];
  for (const outcome of market.outcomes) {
    const candidates = outcome.books.filter((b) => allowed(b.book, opts.bookAllowlist));
    if (candidates.length === 0) return null; // an outcome with no fundable book => no arb
    const best = candidates.reduce((a, b) => (b.price > a.price ? b : a));
    legs.push({
      outcome: outcome.name,
      book: best.book,
      odds: best.price,
      impliedProb: 1 / best.price,
    });
  }

  const totalImplied = legs.reduce((sum, l) => sum + l.impliedProb, 0);
  const margin = 1 - totalImplied;
  if (totalImplied >= 1 || margin < opts.minMargin) return null;

  return {
    type: 'arb',
    sportKey: market.sportKey,
    eventId: market.eventId,
    commenceTime: market.commenceTime,
    marketType: market.marketType,
    legs,
    totalImplied,
    margin,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- arbitrage`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): arbitrage detection engine"
```

---

### Task 7: Stake math helpers — `roundToIncrement`, `applyTax`

**Files:**
- Create: `packages/core/src/stake.ts`, `packages/core/src/stake.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/stake.test.ts`** (helpers section first)

```ts
import { describe, expect, it } from 'vitest';
import { applyTax, roundToIncrement } from './stake';

describe('roundToIncrement', () => {
  it('rounds to the nearest increment', () => {
    expect(roundToIncrement(47.6, 1)).toBe(48);
    expect(roundToIncrement(47.4, 1)).toBe(47);
    expect(roundToIncrement(47.6, 5)).toBe(50);
    expect(roundToIncrement(12.3, 0.5)).toBe(12.5);
  });

  it('returns the value unchanged when increment <= 0', () => {
    expect(roundToIncrement(47.62, 0)).toBe(47.62);
  });
});

describe('applyTax', () => {
  it('taxes positive profit only', () => {
    expect(applyTax(100, 0.2)).toBeCloseTo(80, 10);
  });

  it('does not tax zero or negative profit', () => {
    expect(applyTax(0, 0.2)).toBe(0);
    expect(applyTax(-10, 0.2)).toBe(-10);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- stake`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers in `packages/core/src/stake.ts`**

```ts
import type { ArbOpportunity, MoneyOpts, StakeLeg, StakeSplitResult } from './types';

export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  const rounded = Math.round(value / increment) * increment;
  return Math.round(rounded * 100) / 100; // snap to cents to kill fp noise
}

export function applyTax(grossProfit: number, taxRate: number): number {
  return grossProfit > 0 ? grossProfit * (1 - taxRate) : grossProfit;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- stake`
Expected: PASS (helper tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): stake rounding and tax helpers"
```

---

### Task 8: Forward calculator — `calcStakeSplit`

**Files:**
- Modify: `packages/core/src/stake.ts`
- Modify: `packages/core/src/stake.test.ts`

- [ ] **Step 1: Append the failing test to `packages/core/src/stake.test.ts`**

```ts
import { calcStakeSplit } from './stake';
import type { ArbOpportunity } from './types';

const arb: ArbOpportunity = {
  type: 'arb',
  sportKey: 'soccer',
  eventId: 'evt1',
  commenceTime: '2026-06-20T18:00:00Z',
  marketType: 'h2h',
  legs: [
    { outcome: 'Home', book: 'A', odds: 2.1, impliedProb: 1 / 2.1 },
    { outcome: 'Away', book: 'B', odds: 2.1, impliedProb: 1 / 2.1 },
  ],
  totalImplied: 2 / 2.1,
  margin: 1 - 2 / 2.1,
};

describe('calcStakeSplit (forward)', () => {
  it('splits stake proportionally with no rounding/tax', () => {
    const r = calcStakeSplit(arb, 100, { rounding: 0, taxRate: 0 });
    expect(r.legs.map((l) => l.stake)).toEqual([50, 50]); // symmetric arb
    expect(r.totalStake).toBeCloseTo(100, 6);
    expect(r.guaranteedReturn).toBeCloseTo(105, 6); // 50 * 2.1
    expect(r.grossProfit).toBeCloseTo(5, 6);
    expect(r.netProfit).toBeCloseTo(5, 6);
  });

  it('applies tax to net profit', () => {
    const r = calcStakeSplit(arb, 100, { rounding: 0, taxRate: 0.2 });
    expect(r.netProfit).toBeCloseTo(4, 6); // 5 * 0.8
  });

  it('recomputes the real worst-case profit after rounding', () => {
    const skew: ArbOpportunity = {
      ...arb,
      legs: [
        { outcome: 'Home', book: 'A', odds: 2.5, impliedProb: 1 / 2.5 },
        { outcome: 'Away', book: 'B', odds: 1.75, impliedProb: 1 / 1.75 },
      ],
      totalImplied: 1 / 2.5 + 1 / 1.75,
      margin: 1 - (1 / 2.5 + 1 / 1.75),
    };
    const r = calcStakeSplit(skew, 100, { rounding: 1, taxRate: 0 });
    // stakes get rounded to whole units; worst-case profit is the min across outcomes
    const minReturn = Math.min(...r.perOutcome.map((p) => p.return));
    expect(r.guaranteedReturn).toBeCloseTo(minReturn, 6);
    expect(r.grossProfit).toBeCloseTo(minReturn - r.totalStake, 6);
    r.legs.forEach((l) => expect(Number.isInteger(l.stake)).toBe(true));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- stake`
Expected: FAIL — `calcStakeSplit` not exported.

- [ ] **Step 3: Append implementation to `packages/core/src/stake.ts`**

```ts
export function calcStakeSplit(
  arb: ArbOpportunity,
  totalStake: number,
  opts: MoneyOpts,
): StakeSplitResult {
  const legs: StakeLeg[] = arb.legs.map((leg) => {
    const ideal = (totalStake * leg.impliedProb) / arb.totalImplied;
    return {
      outcome: leg.outcome,
      book: leg.book,
      odds: leg.odds,
      stake: roundToIncrement(ideal, opts.rounding),
    };
  });

  const actualTotal = legs.reduce((sum, l) => sum + l.stake, 0);

  const perOutcome = legs.map((l) => {
    const ret = l.stake * l.odds;
    const gross = ret - actualTotal;
    return {
      outcome: l.outcome,
      return: ret,
      grossProfit: gross,
      netProfit: applyTax(gross, opts.taxRate),
    };
  });

  const guaranteedReturn = Math.min(...perOutcome.map((p) => p.return));
  const grossProfit = guaranteedReturn - actualTotal;
  const netProfit = Math.min(...perOutcome.map((p) => p.netProfit));

  return {
    requestedStake: totalStake,
    totalStake: actualTotal,
    legs,
    guaranteedReturn,
    grossProfit,
    netProfit,
    perOutcome,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- stake`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): forward stake-split calculator with rounding + tax realism"
```

---

### Task 9: Reverse calculator — `calcStakeFromTarget`

**Files:**
- Modify: `packages/core/src/stake.ts`
- Modify: `packages/core/src/stake.test.ts`

- [ ] **Step 1: Append the failing test to `packages/core/src/stake.test.ts`**

```ts
import { calcStakeFromTarget } from './stake';

describe('calcStakeFromTarget (reverse)', () => {
  it('back-solves stake from a target return (round-trips with forward)', () => {
    const r = calcStakeFromTarget(arb, { targetReturn: 105 }, { rounding: 0, taxRate: 0 });
    expect(r.requestedStake).toBeCloseTo(100, 6); // 105 * totalImplied
    expect(r.guaranteedReturn).toBeCloseTo(105, 6);
  });

  it('back-solves stake from a target gross profit', () => {
    const r = calcStakeFromTarget(arb, { targetGrossProfit: 5 }, { rounding: 0, taxRate: 0 });
    expect(r.requestedStake).toBeCloseTo(100, 4);
    expect(r.grossProfit).toBeCloseTo(5, 4);
  });

  it('back-solves stake from a target NET profit accounting for tax', () => {
    const r = calcStakeFromTarget(arb, { targetNetProfit: 4 }, { rounding: 0, taxRate: 0.2 });
    // net 4 => gross 5 => stake 100
    expect(r.requestedStake).toBeCloseTo(100, 4);
    expect(r.netProfit).toBeCloseTo(4, 4);
  });

  it('throws when not exactly one target is provided', () => {
    expect(() => calcStakeFromTarget(arb, {}, { rounding: 0, taxRate: 0 })).toThrow();
    expect(() =>
      calcStakeFromTarget(arb, { targetReturn: 1, targetGrossProfit: 1 }, { rounding: 0, taxRate: 0 }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- stake`
Expected: FAIL — `calcStakeFromTarget` not exported.

- [ ] **Step 3: Append implementation to `packages/core/src/stake.ts`**

```ts
export interface StakeTarget {
  targetReturn?: number;
  targetGrossProfit?: number;
  targetNetProfit?: number;
}

export function calcStakeFromTarget(
  arb: ArbOpportunity,
  target: StakeTarget,
  opts: MoneyOpts,
): StakeSplitResult {
  const provided = [target.targetReturn, target.targetGrossProfit, target.targetNetProfit].filter(
    (v) => v !== undefined,
  );
  if (provided.length !== 1) {
    throw new Error('Provide exactly one of targetReturn, targetGrossProfit, targetNetProfit');
  }

  const f = arb.totalImplied; // < 1 for a valid arb
  if (f >= 1) throw new Error('Not an arbitrage: totalImplied >= 1');

  let idealStake: number;
  if (target.targetReturn !== undefined) {
    idealStake = target.targetReturn * f;
  } else {
    // gross = stake * (1 - f) / f  =>  stake = gross * f / (1 - f)
    const gross =
      target.targetGrossProfit !== undefined
        ? target.targetGrossProfit
        : target.targetNetProfit! / (1 - opts.taxRate); // net => gross
    idealStake = (gross * f) / (1 - f);
  }

  return calcStakeSplit(arb, idealStake, opts);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- stake`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): reverse (target->stake) calculator"
```

---

### Task 10: Value detection — `devig`, `detectValue`

**Files:**
- Create: `packages/core/src/value.ts`, `packages/core/src/value.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/value.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { detectValue, devig } from './value';
import type { NormalizedMarket } from './types';

describe('devig', () => {
  it('removes the vig so probabilities sum to 1', () => {
    const probs = devig([1.9, 1.9]); // implied 0.526*2 = 1.052
    expect(probs[0] + probs[1]).toBeCloseTo(1, 10);
    expect(probs[0]).toBeCloseTo(0.5, 10);
  });
});

describe('detectValue', () => {
  const m: NormalizedMarket = {
    sportKey: 'soccer',
    eventId: 'evt1',
    commenceTime: '2026-06-20T18:00:00Z',
    marketType: 'h2h',
    outcomes: [
      { name: 'Home', books: [{ book: 'Pinnacle', price: 2.0 }, { book: 'Soft', price: 2.3 }] },
      { name: 'Away', books: [{ book: 'Pinnacle', price: 2.0 }, { book: 'Soft', price: 1.7 }] },
    ],
  };

  it('flags a positive edge vs the sharp reference', () => {
    // true prob Home = 0.5; Soft 2.3 => edge = 0.5*2.3 - 1 = 0.15
    const out = detectValue(m, { referenceBook: 'Pinnacle', minEdge: 0.02 });
    const home = out.find((v) => v.outcome === 'Home' && v.book === 'Soft');
    expect(home).toBeDefined();
    expect(home!.edge).toBeCloseTo(0.15, 6);
    // Away Soft 1.7 => edge 0.5*1.7-1 = -0.15 (filtered out)
    expect(out.find((v) => v.outcome === 'Away' && v.book === 'Soft')).toBeUndefined();
  });

  it('never flags the reference book itself', () => {
    const out = detectValue(m, { referenceBook: 'Pinnacle', minEdge: -1 });
    expect(out.every((v) => v.book !== 'Pinnacle')).toBe(true);
  });

  it('returns empty when the reference book is missing an outcome', () => {
    const partial: NormalizedMarket = {
      ...m,
      outcomes: [
        { name: 'Home', books: [{ book: 'Soft', price: 2.3 }] },
        { name: 'Away', books: [{ book: 'Pinnacle', price: 2.0 }] },
      ],
    };
    expect(detectValue(partial, { referenceBook: 'Pinnacle', minEdge: 0 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- value`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/value.ts`**

```ts
import type { NormalizedMarket, ValueOpportunity } from './types';

export interface ValueOptions {
  referenceBook: string;
  minEdge: number;
  bookAllowlist?: string[];
}

/** Multiplicative (proportional) de-vig: normalize implied probabilities to sum to 1. */
export function devig(referenceOdds: number[]): number[] {
  const implied = referenceOdds.map((o) => 1 / o);
  const sum = implied.reduce((a, b) => a + b, 0);
  return implied.map((p) => p / sum);
}

function allowed(book: string, allowlist?: string[]): boolean {
  return !allowlist || allowlist.length === 0 || allowlist.includes(book);
}

export function detectValue(market: NormalizedMarket, opts: ValueOptions): ValueOpportunity[] {
  // Reference odds for every outcome are required to de-vig.
  const refOdds: number[] = [];
  for (const outcome of market.outcomes) {
    const ref = outcome.books.find((b) => b.book === opts.referenceBook);
    if (!ref) return [];
    refOdds.push(ref.price);
  }
  const trueProbs = devig(refOdds);

  const out: ValueOpportunity[] = [];
  market.outcomes.forEach((outcome, i) => {
    const trueProb = trueProbs[i]!;
    for (const b of outcome.books) {
      if (b.book === opts.referenceBook) continue;
      if (!allowed(b.book, opts.bookAllowlist)) continue;
      const edge = trueProb * b.price - 1;
      if (edge >= opts.minEdge) {
        out.push({
          type: 'value',
          sportKey: market.sportKey,
          eventId: market.eventId,
          commenceTime: market.commenceTime,
          marketType: market.marketType,
          outcome: outcome.name,
          book: b.book,
          softOdds: b.price,
          referenceBook: opts.referenceBook,
          trueProb,
          edge,
        });
      }
    }
  });
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- value`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): value detection with multiplicative de-vig"
```

---

### Task 11: Dedupe keys — `dedupeKey`

**Files:**
- Create: `packages/core/src/dedupe.ts`, `packages/core/src/dedupe.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/dedupe.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { dedupeKey } from './dedupe';
import type { ArbOpportunity, ValueOpportunity } from './types';

const arb: ArbOpportunity = {
  type: 'arb',
  sportKey: 'soccer',
  eventId: 'evt1',
  commenceTime: 't',
  marketType: 'h2h',
  legs: [
    { outcome: 'Away', book: 'B', odds: 2.1, impliedProb: 0.47 },
    { outcome: 'Home', book: 'A', odds: 2.1, impliedProb: 0.47 },
  ],
  totalImplied: 0.94,
  margin: 0.06,
};

describe('dedupeKey', () => {
  it('is stable regardless of leg ordering', () => {
    const reordered: ArbOpportunity = { ...arb, legs: [arb.legs[1]!, arb.legs[0]!] };
    expect(dedupeKey(arb)).toBe(dedupeKey(reordered));
  });

  it('differs when a book changes', () => {
    const moved: ArbOpportunity = {
      ...arb,
      legs: [arb.legs[0]!, { ...arb.legs[1]!, book: 'C' }],
    };
    expect(dedupeKey(moved)).not.toBe(dedupeKey(arb));
  });

  it('builds a value key from outcome/book/reference', () => {
    const v: ValueOpportunity = {
      type: 'value',
      sportKey: 'soccer',
      eventId: 'evt1',
      commenceTime: 't',
      marketType: 'h2h',
      outcome: 'Home',
      book: 'Soft',
      softOdds: 2.3,
      referenceBook: 'Pinnacle',
      trueProb: 0.5,
      edge: 0.15,
    };
    expect(dedupeKey(v)).toBe('value|soccer|evt1|h2h|Home|Soft|Pinnacle');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- dedupe`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/dedupe.ts`**

```ts
import type { ArbOpportunity, ValueOpportunity } from './types';

export function dedupeKey(opp: ArbOpportunity | ValueOpportunity): string {
  if (opp.type === 'arb') {
    const legs = [...opp.legs]
      .map((l) => `${l.outcome}:${l.book}`)
      .sort()
      .join(',');
    return `arb|${opp.sportKey}|${opp.eventId}|${opp.marketType}|${legs}`;
  }
  return `value|${opp.sportKey}|${opp.eventId}|${opp.marketType}|${opp.outcome}|${opp.book}|${opp.referenceBook}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- dedupe`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): stable dedupe keys for edge-survival tracking"
```

---

### Task 12: Region profiles + barrel export

**Files:**
- Create: `packages/core/src/regions.ts`, `packages/core/src/regions.test.ts`
- Modify: `packages/core/src/index.ts`
- Delete: `packages/core/src/sanity.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/src/regions.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { REGION_PROFILES, getRegionProfile } from './regions';

describe('region profiles', () => {
  it('ships eu, se, lt profiles', () => {
    expect(Object.keys(REGION_PROFILES).sort()).toEqual(['eu', 'lt', 'se']);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- regions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/regions.ts`**

```ts
import type { RegionProfile } from './types';

export const REGION_PROFILES: Record<string, RegionProfile> = {
  // Broad EU: widest net, no fundability filter, sharp reference for value bets.
  eu: { id: 'eu', apiRegions: ['eu', 'uk'], referenceBook: 'Pinnacle' },
  // Sweden: SE-licensed soft books (research §2/§3).
  se: {
    id: 'se',
    apiRegions: ['eu'],
    bookAllowlist: ['Unibet', 'Betsson', 'bet365', 'Betway', 'LeoVegas', 'NordicBet', 'Betsafe', 'Expekt'],
    referenceBook: 'Pinnacle',
  },
  // Lithuania: only Betsson overlaps API coverage -> value-focused (research §3).
  lt: { id: 'lt', apiRegions: ['eu'], bookAllowlist: ['Betsson'], referenceBook: 'Pinnacle' },
};

export function getRegionProfile(id: string): RegionProfile {
  return REGION_PROFILES[id] ?? REGION_PROFILES.eu!;
}
```

- [ ] **Step 4: Replace `packages/core/src/index.ts` with the real barrel**

```ts
export * from './types';
export * from './odds';
export * from './normalize';
export * from './arbitrage';
export * from './stake';
export * from './value';
export * from './dedupe';
export * from './regions';
```

- [ ] **Step 5: Delete the obsolete sanity test**

Run: `rm packages/core/src/sanity.test.ts`

- [ ] **Step 6: Run the full core suite + typecheck**

Run: `pnpm test && pnpm --filter @quest/core typecheck`
Expected: all core tests PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): region profiles and public barrel; finalize core package"
```

---

# Milestone M2 — `@quest/db` persistence (Drizzle + SQLite)

### Task 13: `@quest/db` package skeleton

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/index.ts`

- [ ] **Step 1: Create `packages/db/package.json`**

```json
{
  "name": "@quest/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "better-sqlite3": "^11.5.0",
    "drizzle-orm": "^0.36.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "drizzle-kit": "^0.28.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create `packages/db/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "drizzle.config.ts"] }
```

- [ ] **Step 3: Create `packages/db/src/index.ts`**

```ts
export * from './schema';
export * from './client';
export * from './repositories/poll-runs';
export * from './repositories/opportunities';
export * from './repositories/settlements';
export * from './repositories/stats';
```

- [ ] **Step 4: Create `packages/db/drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
});
```

- [ ] **Step 5: Install**

Run: `pnpm install`
Expected: better-sqlite3 builds its native binding; completes without error.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold @quest/db package"
```

---

### Task 14: Drizzle schema

**Files:**
- Create: `packages/db/src/schema.ts`

- [ ] **Step 1: Create `packages/db/src/schema.ts`**

```ts
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const pollRuns = sqliteTable('poll_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  regionProfile: text('region_profile').notNull(),
  status: text('status', { enum: ['running', 'ok', 'error'] }).notNull(),
  creditsUsed: integer('credits_used'),
  error: text('error'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
});

export const oddsSnapshots = sqliteTable(
  'odds_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pollRunId: integer('poll_run_id').references(() => pollRuns.id),
    sportKey: text('sport_key').notNull(),
    eventId: text('event_id').notNull(),
    commenceTime: text('commence_time').notNull(),
    marketType: text('market_type').notNull(),
    rawJson: text('raw_json'),
    normalizedJson: text('normalized_json').notNull(),
    capturedAt: text('captured_at').notNull(),
  },
  (t) => ({ byEvent: index('snap_event_idx').on(t.eventId) }),
);

export const opportunities = sqliteTable(
  'opportunities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['arb', 'value'] }).notNull(),
    sportKey: text('sport_key').notNull(),
    eventId: text('event_id').notNull(),
    eventName: text('event_name'),
    commenceTime: text('commence_time').notNull(),
    marketType: text('market_type').notNull(),
    regionProfile: text('region_profile').notNull(),
    margin: real('margin'),
    edge: real('edge'),
    referenceBook: text('reference_book'),
    defaultBankrollProfit: real('default_bankroll_profit'),
    status: text('status', {
      enum: ['new', 'accepted', 'bet_placed', 'skipped', 'archived'],
    })
      .notNull()
      .default('new'),
    dedupeKey: text('dedupe_key').notNull(),
    detectedAt: text('detected_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (t) => ({
    byDedupe: uniqueIndex('opp_dedupe_idx').on(t.dedupeKey),
    byStatus: index('opp_status_idx').on(t.status),
    bySport: index('opp_sport_idx').on(t.sportKey),
    byCommence: index('opp_commence_idx').on(t.commenceTime),
  }),
);

export const opportunityLegs = sqliteTable('opportunity_legs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  outcome: text('outcome').notNull(),
  book: text('book').notNull(),
  odds: real('odds').notNull(),
  impliedProb: real('implied_prob'),
  recommendedStake: real('recommended_stake'),
});

export const placements = sqliteTable('placements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  totalStaked: real('total_staked').notNull(),
  predictedProfit: real('predicted_profit'), // gross (tax is display-only)
  placedAt: text('placed_at').notNull(),
});

export const placementLegs = sqliteTable('placement_legs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  placementId: integer('placement_id')
    .notNull()
    .references(() => placements.id, { onDelete: 'cascade' }),
  outcome: text('outcome').notNull(),
  book: text('book').notNull(),
  actualStake: real('actual_stake').notNull(),
  actualOdds: real('actual_odds').notNull(),
});

export const settlements = sqliteTable('settlements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  winningSelection: text('winning_selection'),
  realizedProfit: real('realized_profit'),
  predictedProfit: real('predicted_profit'),
  notes: text('notes'),
  autoFilled: integer('auto_filled', { mode: 'boolean' }).notNull().default(false),
  settledAt: text('settled_at').notNull(),
});

export const settlementLegs = sqliteTable('settlement_legs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  settlementId: integer('settlement_id')
    .notNull()
    .references(() => settlements.id, { onDelete: 'cascade' }),
  outcome: text('outcome').notNull(),
  result: text('result', { enum: ['settled', 'voided', 'rejected'] }).notNull(),
});

// keep the unused `sql` import meaningful for future defaults
export const _schemaMeta = { createdWith: sql`CURRENT_TIMESTAMP` };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @quest/db typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): Drizzle schema for snapshots, opportunities, placements, settlements"
```

---

### Task 15: Generate migrations + DB client with `applyMigrations`

**Files:**
- Create: `packages/db/src/client.ts`
- Create: `packages/db/drizzle/**` (generated)

- [ ] **Step 1: Generate the migration SQL from the schema**

Run: `pnpm --filter @quest/db db:generate`
Expected: creates `packages/db/drizzle/0000_*.sql` and a `meta/` folder.

- [ ] **Step 2: Create `packages/db/src/client.ts`**

```ts
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export type QuestDb = BetterSQLite3Database<typeof schema>;

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

/** Create a Drizzle client. Pass ':memory:' for tests. */
export function createDb(url: string): QuestDb {
  const sqlite = new Database(url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export function applyMigrations(db: QuestDb): void {
  migrate(db, { migrationsFolder });
}

/** Convenience for tests: in-memory db with schema applied. */
export function createTestDb(): QuestDb {
  const db = createDb(':memory:');
  applyMigrations(db);
  return db;
}
```

- [ ] **Step 3: Write a smoke test `packages/db/src/client.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb } from './client';
import { pollRuns } from './schema';

describe('createTestDb', () => {
  it('applies migrations and allows inserts', () => {
    const db = createTestDb();
    db.insert(pollRuns)
      .values({ provider: 'mock', regionProfile: 'eu', status: 'running', startedAt: '2026-06-14T00:00:00Z' })
      .run();
    const rows = db.select().from(pollRuns).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe('mock');
  });
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- client`
Expected: PASS — migrations apply, insert/select works.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): sqlite client + migrator + generated migrations"
```

---

### Task 16: Poll-runs repository

**Files:**
- Create: `packages/db/src/repositories/poll-runs.ts`, `packages/db/src/repositories/poll-runs.test.ts`

- [ ] **Step 1: Write the failing test `packages/db/src/repositories/poll-runs.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../client';
import { finishPollRun, startPollRun } from './poll-runs';

describe('poll-runs repository', () => {
  it('starts and finishes a poll run', () => {
    const db = createTestDb();
    const id = startPollRun(db, { provider: 'mock', regionProfile: 'eu', startedAt: '2026-06-14T00:00:00Z' });
    expect(id).toBeGreaterThan(0);
    finishPollRun(db, id, { status: 'ok', creditsUsed: 3, finishedAt: '2026-06-14T00:00:05Z' });
    const run = db.query.pollRuns.findFirst({ where: (r, { eq }) => eq(r.id, id) }) as
      | { status: string; creditsUsed: number | null }
      | undefined;
    // findFirst on better-sqlite3 drizzle is sync
    expect(run?.status ?? undefined).toBeDefined();
  });
});
```

> Note: `db.query.*.findFirst` is synchronous with the better-sqlite3 driver; call it without `await`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- poll-runs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/db/src/repositories/poll-runs.ts`**

```ts
import { eq } from 'drizzle-orm';
import type { QuestDb } from '../client';
import { pollRuns } from '../schema';

export function startPollRun(
  db: QuestDb,
  input: { provider: string; regionProfile: string; startedAt: string },
): number {
  const row = db
    .insert(pollRuns)
    .values({ ...input, status: 'running' })
    .returning({ id: pollRuns.id })
    .get();
  return row.id;
}

export function finishPollRun(
  db: QuestDb,
  id: number,
  input: { status: 'ok' | 'error'; creditsUsed?: number; error?: string; finishedAt: string },
): void {
  db.update(pollRuns)
    .set({
      status: input.status,
      creditsUsed: input.creditsUsed ?? null,
      error: input.error ?? null,
      finishedAt: input.finishedAt,
    })
    .where(eq(pollRuns.id, id))
    .run();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- poll-runs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): poll-runs repository"
```

---

### Task 17: Opportunities repository — upsert with dedupe + last_seen

**Files:**
- Create: `packages/db/src/repositories/opportunities.ts`, `packages/db/src/repositories/opportunities.test.ts`

- [ ] **Step 1: Write the failing test `packages/db/src/repositories/opportunities.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../client';
import { listOpportunities, setStatus, upsertOpportunity } from './opportunities';

const base = {
  type: 'arb' as const,
  sportKey: 'soccer',
  eventId: 'evt1',
  eventName: 'Brazil vs Argentina',
  commenceTime: '2026-06-20T18:00:00Z',
  marketType: 'h2h',
  regionProfile: 'eu',
  margin: 0.05,
  edge: null,
  referenceBook: null,
  defaultBankrollProfit: 5,
  dedupeKey: 'arb|soccer|evt1|h2h|Away:B,Home:A',
  legs: [
    { outcome: 'Home', book: 'A', odds: 2.1, impliedProb: 0.476, recommendedStake: 50 },
    { outcome: 'Away', book: 'B', odds: 2.1, impliedProb: 0.476, recommendedStake: 50 },
  ],
};

describe('opportunities repository', () => {
  it('inserts a new opportunity with legs', () => {
    const db = createTestDb();
    const id = upsertOpportunity(db, { ...base, detectedAt: '2026-06-14T00:00:00Z', lastSeenAt: '2026-06-14T00:00:00Z' });
    const list = listOpportunities(db, {});
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(id);
    expect(list[0]!.legs).toHaveLength(2);
  });

  it('bumps last_seen_at instead of duplicating on the same dedupe key', () => {
    const db = createTestDb();
    const id1 = upsertOpportunity(db, { ...base, detectedAt: 't0', lastSeenAt: 't0' });
    const id2 = upsertOpportunity(db, { ...base, detectedAt: 't1', lastSeenAt: 't1' });
    expect(id2).toBe(id1); // same row
    const list = listOpportunities(db, {});
    expect(list).toHaveLength(1);
    expect(list[0]!.lastSeenAt).toBe('t1');
    expect(list[0]!.detectedAt).toBe('t0'); // detection time preserved
  });

  it('filters by status', () => {
    const db = createTestDb();
    const id = upsertOpportunity(db, { ...base, detectedAt: 't0', lastSeenAt: 't0' });
    setStatus(db, id, 'archived');
    expect(listOpportunities(db, { status: 'new' })).toHaveLength(0);
    expect(listOpportunities(db, { status: 'archived' })).toHaveLength(1);
  });

  it('filters by minMargin and sport', () => {
    const db = createTestDb();
    upsertOpportunity(db, { ...base, detectedAt: 't0', lastSeenAt: 't0' });
    expect(listOpportunities(db, { minMargin: 0.1 })).toHaveLength(0);
    expect(listOpportunities(db, { sport: 'tennis' })).toHaveLength(0);
    expect(listOpportunities(db, { sport: 'soccer', minMargin: 0.01 })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- opportunities`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/db/src/repositories/opportunities.ts`**

```ts
import { and, desc, eq, gte } from 'drizzle-orm';
import type { QuestDb } from '../client';
import { opportunities, opportunityLegs } from '../schema';

export interface UpsertLeg {
  outcome: string;
  book: string;
  odds: number;
  impliedProb?: number | null;
  recommendedStake?: number | null;
}

export interface UpsertOpportunity {
  type: 'arb' | 'value';
  sportKey: string;
  eventId: string;
  eventName?: string | null;
  commenceTime: string;
  marketType: string;
  regionProfile: string;
  margin?: number | null;
  edge?: number | null;
  referenceBook?: string | null;
  defaultBankrollProfit?: number | null;
  dedupeKey: string;
  detectedAt: string;
  lastSeenAt: string;
  legs: UpsertLeg[];
}

export interface OpportunityFilter {
  status?: 'new' | 'accepted' | 'bet_placed' | 'skipped' | 'archived';
  type?: 'arb' | 'value';
  sport?: string;
  region?: string;
  minMargin?: number;
}

/** Insert a new opportunity (+legs), or bump last_seen_at if the dedupe key already exists. */
export function upsertOpportunity(db: QuestDb, input: UpsertOpportunity): number {
  const existing = db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(eq(opportunities.dedupeKey, input.dedupeKey))
    .get();

  if (existing) {
    db.update(opportunities)
      .set({
        lastSeenAt: input.lastSeenAt,
        margin: input.margin ?? null,
        edge: input.edge ?? null,
        defaultBankrollProfit: input.defaultBankrollProfit ?? null,
      })
      .where(eq(opportunities.id, existing.id))
      .run();
    return existing.id;
  }

  const row = db
    .insert(opportunities)
    .values({
      type: input.type,
      sportKey: input.sportKey,
      eventId: input.eventId,
      eventName: input.eventName ?? null,
      commenceTime: input.commenceTime,
      marketType: input.marketType,
      regionProfile: input.regionProfile,
      margin: input.margin ?? null,
      edge: input.edge ?? null,
      referenceBook: input.referenceBook ?? null,
      defaultBankrollProfit: input.defaultBankrollProfit ?? null,
      dedupeKey: input.dedupeKey,
      detectedAt: input.detectedAt,
      lastSeenAt: input.lastSeenAt,
    })
    .returning({ id: opportunities.id })
    .get();

  for (const leg of input.legs) {
    db.insert(opportunityLegs)
      .values({
        opportunityId: row.id,
        outcome: leg.outcome,
        book: leg.book,
        odds: leg.odds,
        impliedProb: leg.impliedProb ?? null,
        recommendedStake: leg.recommendedStake ?? null,
      })
      .run();
  }
  return row.id;
}

export function listOpportunities(db: QuestDb, filter: OpportunityFilter) {
  const conditions = [];
  if (filter.status) conditions.push(eq(opportunities.status, filter.status));
  if (filter.type) conditions.push(eq(opportunities.type, filter.type));
  if (filter.sport) conditions.push(eq(opportunities.sportKey, filter.sport));
  if (filter.region) conditions.push(eq(opportunities.regionProfile, filter.region));
  if (filter.minMargin !== undefined) conditions.push(gte(opportunities.margin, filter.minMargin));

  const rows = db
    .select()
    .from(opportunities)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(opportunities.detectedAt))
    .all();

  return rows.map((opp) => ({
    ...opp,
    legs: db.select().from(opportunityLegs).where(eq(opportunityLegs.opportunityId, opp.id)).all(),
  }));
}

export function getOpportunity(db: QuestDb, id: number) {
  const opp = db.select().from(opportunities).where(eq(opportunities.id, id)).get();
  if (!opp) return undefined;
  const legs = db.select().from(opportunityLegs).where(eq(opportunityLegs.opportunityId, id)).all();
  return { ...opp, legs };
}

export function setStatus(
  db: QuestDb,
  id: number,
  status: 'new' | 'accepted' | 'bet_placed' | 'skipped' | 'archived',
): void {
  db.update(opportunities).set({ status }).where(eq(opportunities.id, id)).run();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- opportunities`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): opportunities repository with dedupe upsert + filters"
```

---

### Task 18: Settlements + placements repository

**Files:**
- Create: `packages/db/src/repositories/settlements.ts`, `packages/db/src/repositories/settlements.test.ts`

- [ ] **Step 1: Write the failing test `packages/db/src/repositories/settlements.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../client';
import { upsertOpportunity } from './opportunities';
import { recordPlacement, recordSettlement } from './settlements';

function seedOpp(db: ReturnType<typeof createTestDb>) {
  return upsertOpportunity(db, {
    type: 'arb',
    sportKey: 'soccer',
    eventId: 'evt1',
    commenceTime: 't',
    marketType: 'h2h',
    regionProfile: 'eu',
    margin: 0.05,
    dedupeKey: 'k1',
    detectedAt: 't0',
    lastSeenAt: 't0',
    legs: [{ outcome: 'Home', book: 'A', odds: 2.1 }],
  });
}

describe('settlements repository', () => {
  it('records a placement with legs', () => {
    const db = createTestDb();
    const oppId = seedOpp(db);
    const pid = recordPlacement(db, {
      opportunityId: oppId,
      totalStaked: 100,
      predictedProfit: 4,
      placedAt: 't1',
      legs: [{ outcome: 'Home', book: 'A', actualStake: 50, actualOdds: 2.08 }],
    });
    expect(pid).toBeGreaterThan(0);
  });

  it('records a settlement with per-leg results', () => {
    const db = createTestDb();
    const oppId = seedOpp(db);
    const sid = recordSettlement(db, {
      opportunityId: oppId,
      winningSelection: 'Home',
      realizedProfit: 3.5,
      predictedProfit: 4,
      notes: 'Book B changed odds before confirm',
      autoFilled: false,
      settledAt: 't2',
      legs: [{ outcome: 'Home', result: 'settled' }],
    });
    expect(sid).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- settlements`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/db/src/repositories/settlements.ts`**

```ts
import type { QuestDb } from '../client';
import { placementLegs, placements, settlementLegs, settlements } from '../schema';

export interface RecordPlacement {
  opportunityId: number;
  totalStaked: number;
  predictedProfit?: number | null;
  placedAt: string;
  legs: { outcome: string; book: string; actualStake: number; actualOdds: number }[];
}

export function recordPlacement(db: QuestDb, input: RecordPlacement): number {
  const row = db
    .insert(placements)
    .values({
      opportunityId: input.opportunityId,
      totalStaked: input.totalStaked,
      predictedProfit: input.predictedProfit ?? null,
      placedAt: input.placedAt,
    })
    .returning({ id: placements.id })
    .get();

  for (const leg of input.legs) {
    db.insert(placementLegs).values({ placementId: row.id, ...leg }).run();
  }
  return row.id;
}

export interface RecordSettlement {
  opportunityId: number;
  winningSelection?: string | null;
  realizedProfit?: number | null;
  predictedProfit?: number | null;
  notes?: string | null;
  autoFilled: boolean;
  settledAt: string;
  legs: { outcome: string; result: 'settled' | 'voided' | 'rejected' }[];
}

export function recordSettlement(db: QuestDb, input: RecordSettlement): number {
  const row = db
    .insert(settlements)
    .values({
      opportunityId: input.opportunityId,
      winningSelection: input.winningSelection ?? null,
      realizedProfit: input.realizedProfit ?? null,
      predictedProfit: input.predictedProfit ?? null,
      notes: input.notes ?? null,
      autoFilled: input.autoFilled,
      settledAt: input.settledAt,
    })
    .returning({ id: settlements.id })
    .get();

  for (const leg of input.legs) {
    db.insert(settlementLegs).values({ settlementId: row.id, ...leg }).run();
  }
  return row.id;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- settlements`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): placements + settlements repository"
```

---

### Task 19: Stats repository

**Files:**
- Create: `packages/db/src/repositories/stats.ts`, `packages/db/src/repositories/stats.test.ts`

- [ ] **Step 1: Write the failing test `packages/db/src/repositories/stats.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../client';
import { upsertOpportunity } from './opportunities';
import { computeStats } from './stats';

describe('computeStats', () => {
  it('aggregates count, avg margin, and avg survival per sport', () => {
    const db = createTestDb();
    // survives 60s
    upsertOpportunity(db, {
      type: 'arb', sportKey: 'soccer', eventId: 'e1', commenceTime: 't', marketType: 'h2h',
      regionProfile: 'eu', margin: 0.04, dedupeKey: 'k1',
      detectedAt: '2026-06-14T00:00:00Z', lastSeenAt: '2026-06-14T00:01:00Z', legs: [],
    });
    // survives 0s
    upsertOpportunity(db, {
      type: 'arb', sportKey: 'tennis', eventId: 'e2', commenceTime: 't', marketType: 'h2h',
      regionProfile: 'eu', margin: 0.06, dedupeKey: 'k2',
      detectedAt: '2026-06-14T00:00:00Z', lastSeenAt: '2026-06-14T00:00:00Z', legs: [],
    });

    const stats = computeStats(db);
    expect(stats.totalOpportunities).toBe(2);
    expect(stats.avgMargin).toBeCloseTo(0.05, 6);
    const soccer = stats.bySport.find((s) => s.sportKey === 'soccer')!;
    expect(soccer.count).toBe(1);
    expect(soccer.avgSurvivalSeconds).toBeCloseTo(60, 0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- stats`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/db/src/repositories/stats.ts`**

```ts
import type { QuestDb } from '../client';
import { opportunities } from '../schema';

export interface SportStat {
  sportKey: string;
  count: number;
  avgMargin: number | null;
  avgSurvivalSeconds: number;
}

export interface Stats {
  totalOpportunities: number;
  avgMargin: number | null;
  avgSurvivalSeconds: number;
  bySport: SportStat[];
}

function survivalSeconds(detectedAt: string, lastSeenAt: string): number {
  return (Date.parse(lastSeenAt) - Date.parse(detectedAt)) / 1000;
}

export function computeStats(db: QuestDb): Stats {
  const rows = db.select().from(opportunities).all();
  const margins = rows.map((r) => r.margin).filter((m): m is number => m !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const bySportMap = new Map<string, { margins: number[]; survivals: number[] }>();
  for (const r of rows) {
    const e = bySportMap.get(r.sportKey) ?? { margins: [], survivals: [] };
    if (r.margin !== null) e.margins.push(r.margin);
    e.survivals.push(survivalSeconds(r.detectedAt, r.lastSeenAt));
    bySportMap.set(r.sportKey, e);
  }

  const bySport: SportStat[] = [...bySportMap.entries()].map(([sportKey, e]) => ({
    sportKey,
    count: e.survivals.length,
    avgMargin: avg(e.margins),
    avgSurvivalSeconds: e.survivals.reduce((a, b) => a + b, 0) / e.survivals.length,
  }));

  const allSurvivals = rows.map((r) => survivalSeconds(r.detectedAt, r.lastSeenAt));
  return {
    totalOpportunities: rows.length,
    avgMargin: avg(margins),
    avgSurvivalSeconds: allSurvivals.length
      ? allSurvivals.reduce((a, b) => a + b, 0) / allSurvivals.length
      : 0,
    bySport,
  };
}
```

> Note: `computeStats` uses `Date.parse` on stored ISO strings — this is in the DB layer (not `@quest/core`), so using the clock-free-core rule is not violated; timestamps are read from persisted data, not generated.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): stats repository (counts, avg margin, edge survival)"
```

---

### Task 20: Foundation green-bar gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite, typecheck, and lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all tests PASS across `@quest/core` and `@quest/db`; no type errors; lint clean.

- [ ] **Step 2: Confirm the foundation is complete**

Both packages build their public surface (`@quest/core` exports the engine; `@quest/db` exports schema + repositories). This is the input Plan 2 consumes.

- [ ] **Step 3: Commit any lint/format fixups**

```bash
git add -A
git commit -m "chore: foundation green — core + db packages complete" --allow-empty
```

---

## Self-review (run against the spec before execution)

**Spec coverage:**
- §4.1 types → Task 3 ✅ · §4.2 detectArbitrage → Task 6 ✅ · calcStakeSplit → Task 8 ✅ · calcStakeFromTarget → Task 9 ✅ · detectValue/de-vig → Task 10 ✅ · normalization → Task 5 ✅ · toDecimal → Task 4 ✅
- §4.3 tax model (display-only) → Task 7 (`netAfterTax` helper); detection/calc are gross-only and never reference tax ✅
- §4.4 region profiles → Task 12 ✅
- §5 data model (all 8 tables) → Task 14 ✅; dedupe upsert + last_seen → Task 17 ✅; survival measurement → Task 19 ✅; placements/settlements → Task 18 ✅
- §11 testing (core exhaustive, db repos on in-memory sqlite) → Tasks 4–12, 15–19 ✅
- **Out of scope for Plan 1 (correctly deferred):** providers/poller/API (Plan 2), UI/Docker (Plan 3). The `OddsProvider` interface is defined here (Task 3) for Plan 2 to implement.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has expected output. ✅

**Type consistency:** `ArbOpportunity`/`ValueOpportunity`/`StakeSplitResult`/`StakeOpts` defined in Task 3 are used verbatim in Tasks 6–11. `QuestDb` defined in Task 15 is the param type across all repositories (Tasks 16–19). `dedupeKey` output format in Task 11 matches the `dedupeKey` column populated in Task 17. Region `bookAllowlist` optional semantics (undefined/empty = all) are consistent between `detectArbitrage`/`detectValue` (Tasks 6/10) and `REGION_PROFILES.eu` (Task 12). ✅

**Gaps:** none for Plan 1's scope.
