# Quest Frontend + Ship (Plan 3 of 3) Implementation Plan

> **Contract-first.** The orchestrator scaffolds the Vite app + design system + API client + app shell inline (the shared foundation everything imports), then feature views are built in parallel (one agent per view, disjoint files) against the contracts + design tokens below. Finishes with integration, a live render check, Docker, and an adversarial review. Steps use `- [ ]`.

**Goal:** A clean, minimal, data-dense React SPA (`apps/web`) for reviewing arbitrage/value opportunities — the main table, the bidirectional calculator (reusing `@quest/core` math client-side), filters, lifecycle actions, settlement, and a stats page — plus Docker packaging where the Hono server serves the built static app.

**Aesthetic (decided):** Refined "financial instrument." Monochrome neutrals + **green = arb/profit**, **amber = value bet**, red = loss. Dark default + light ("warm paper") toggle. Type: **Hanken Grotesk** (UI) + **JetBrains Mono** (all numerics, tabular). Self-hosted fonts via `@fontsource`. Restrained motion. NOT generic (no Inter/Roboto/Space Grotesk, no purple-on-white).

**Stack:** React 18 + Vite 5 + TypeScript, Tailwind CSS 3 (+ CSS-variable theme tokens), TanStack Query 5 (data + live refetch + mutations), `@quest/core` (shared calculator math), hand-rolled SVG charts. Simple `useState` view-switch nav (no router dep). Depends on Plans 1+2 (merged). Last plan.

---

## Design system (authoritative — all components use these tokens)

`apps/web/src/styles/theme.css` defines CSS variables on `:root` (dark) and `[data-theme='light']`:

```
DARK (default)                         LIGHT ("warm paper")
--bg:        hsl(220 14% 7%)           hsl(40 22% 97%)
--surface:   hsl(220 13% 10%)          hsl(40 24% 99%)
--surface-2: hsl(220 12% 13.5%)        hsl(40 16% 94%)
--border:    hsl(220 10% 18%)          hsl(40 10% 85%)
--text:      hsl(210 16% 92%)          hsl(220 20% 13%)
--text-dim:  hsl(220 8% 58%)           hsl(220 8% 40%)
--accent:    hsl(152 58% 46%)  (arb/profit, green)
--accent-2:  hsl(38 92% 56%)   (value bet, amber)
--danger:    hsl(2 68% 60%)    (loss/negative)
--ring:      color-mix(in hsl, var(--accent) 60%, transparent)
--font-ui:   'Hanken Grotesk Variable', ui-sans-serif, system-ui, sans-serif
--font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace
```
Tailwind `theme.extend.colors` maps to these vars (e.g. `bg: 'hsl(var(--bg)/<alpha-value>)'` style or `colors.bg: 'var(--bg)'`). Use `font-mono` for every odds/stake/margin/profit/percentage and right-align numeric table cells (`tabular-nums`). Radii small (4–8px), borders 1px hairline `--border`, shadows subtle. Motion via CSS: staggered row fade/slide on load (`animation-delay` by index), a 1.2s pulse on the live dot during refetch, 180ms ease inline calculator expand.

---

## File structure

```
apps/web/
  index.html
  package.json
  tsconfig.json
  vite.config.ts                  # React plugin, /api proxy -> :8787, optimizeDeps.exclude ['@quest/core']
  tailwind.config.ts
  postcss.config.js
  src/
    main.tsx                      # [FOUND] React root + QueryClientProvider + ThemeProvider
    App.tsx                       # [FOUND] app shell: topbar + view switch (Opportunities|Settlement|Stats)
    styles/theme.css              # [FOUND] tokens + base + keyframes
    styles/fonts.ts               # [FOUND] @fontsource imports
    lib/
      api.ts                      # [FOUND] typed fetch client for the @quest/server API
      types.ts                    # [FOUND] DTO types mirroring server responses
      format.ts                   # [FOUND] formatOdds/Money/Percent/timeToKickoff helpers
      query.ts                    # [FOUND] queryClient + query keys
    theme/ThemeProvider.tsx       # [FOUND] dark/light context + localStorage + toggle
    components/
      ui/{Button,Badge,Card,Field,Toggle,Stat}.tsx   # [FOUND] design-system primitives
      AppShell.tsx                # [FOUND] topbar (wordmark, bankroll input, live/last-poll, search-now, theme toggle, nav)
      LiveIndicator.tsx           # [FOUND] last-poll + pulsing dot during refetch
      BankrollInput.tsx           # [FOUND] global default-stake (context)
    features/
      opportunities/
        OpportunitiesView.tsx     # [VIEW A] table + filters + live refetch
        OpportunityRow.tsx        # [VIEW A] row + quick actions + expand
        FiltersBar.tsx            # [VIEW A] sport/region/type/minMargin/sort/further-from-kickoff
        Calculator.tsx            # [VIEW B] bidirectional calc (uses @quest/core) + copy summary
      settlement/
        SettlementView.tsx        # [VIEW C] bet_placed list + record-outcome form
      stats/
        StatsView.tsx             # [VIEW D] stats cards + charts
        charts/{BarChart,Sparkline}.tsx  # [VIEW D] minimal SVG charts
  Dockerfile (repo root), docker-compose.yml, .dockerignore, README.md  # [SHIP]
```

---

## Shared contracts (authoritative)

```ts
// lib/types.ts — mirror @quest/server JSON
export interface Leg { id: number; outcome: string; book: string; odds: number; impliedProb: number | null; recommendedStake: number | null; }
export interface Opportunity {
  id: number; type: 'arb' | 'value'; sportKey: string; eventId: string; eventName: string | null;
  commenceTime: string; marketType: string; regionProfile: string;
  margin: number | null; edge: number | null; referenceBook: string | null;
  defaultBankrollProfit: number | null;            // GROSS
  status: 'new'|'accepted'|'bet_placed'|'skipped'|'archived';
  detectedAt: string; lastSeenAt: string; legs: Leg[];
}
export interface Stats { totalOpportunities: number; avgMargin: number | null; avgSurvivalSeconds: number;
  bySport: { sportKey: string; count: number; avgMargin: number | null; avgSurvivalSeconds: number }[]; }
export interface Meta { lastPoll: string | null; config: { defaultBankroll: number; taxRate: number; stakeRounding: number; regions: string[]; sports: string[]; oddsProvider: string }; regionProfiles: Record<string, { id: string; apiRegions: string[]; bookAllowlist?: string[]; referenceBook?: string }>; }

// lib/api.ts
export const api = {
  listOpportunities(params): Promise<Opportunity[]>,        // GET /api/opportunities?status&type&sport&region&minMargin&sort
  getOpportunity(id): Promise<Opportunity>,
  setStatus(id, body): Promise<{ok:true}>,                  // POST /api/opportunities/:id/status
  settle(id, body): Promise<{ok:true}>,                     // POST /api/opportunities/:id/settlement
  stats(): Promise<Stats>, meta(): Promise<Meta>, sports(): Promise<string[]>,
  poll(): Promise<{ok:true}>,                               // POST /api/poll
};
// Calculator math comes from '@quest/core': calcStakeSplit, calcStakeFromTarget, netAfterTax (gross headline; net is a small annotation).
```

The calculator must reconstruct an `ArbOpportunity` from an opportunity's legs (outcome, book, odds, impliedProb = 1/odds, totalImplied = Σ, margin) to call `calcStakeSplit`/`calcStakeFromTarget`. For value opportunities (single leg), show the edge + a simple single-bet stake, not the arb split.

---

# Milestone M5a — Foundation (orchestrator, inline)

### Task 1: Scaffold Vite app, Tailwind, theme tokens, fonts
- Create `apps/web/package.json` (deps: react, react-dom, @tanstack/react-query, @quest/core workspace, @fontsource-variable/hanken-grotesk, @fontsource/jetbrains-mono; dev: vite, @vitejs/plugin-react, typescript, tailwindcss, postcss, autoprefixer, @types/react, @types/react-dom, vitest, @testing-library/react, jsdom). Scripts: dev/build/preview/typecheck/test.
- Create `vite.config.ts` (React plugin; `server.proxy['/api'] -> http://localhost:8787`; `optimizeDeps.exclude: ['@quest/core']` so Vite transforms the workspace TS source; `test` jsdom).
- `tailwind.config.ts` (content globs; `theme.extend.colors` → CSS vars; fontFamily ui/mono), `postcss.config.js`.
- `src/styles/theme.css` (tokens above, base resets, keyframes), `src/styles/fonts.ts` (@fontsource imports), `index.html`.
- [ ] Verify: `pnpm install && pnpm --filter @quest/web build` produces dist (after components exist) — at this step just ensure `pnpm --filter @quest/web typecheck` passes on the skeleton.
- [ ] Commit.

### Task 2: API client, types, format helpers, query setup, theme provider, UI primitives, app shell
- Implement `lib/types.ts`, `lib/api.ts` (typed fetch, throws on non-2xx with JSON error), `lib/format.ts` (`formatOdds`=2dp mono, `formatMoney`=€ + 2dp, `formatPercent`=1dp, `timeToKickoff(iso)`→"2d 4h"/"23m", `survival(s)`), `lib/query.ts` (QueryClient, refetchInterval default 20s).
- `theme/ThemeProvider.tsx` (context, localStorage `quest-theme`, sets `data-theme`, default dark), `components/ui/*` primitives (Button variants ghost/solid/danger, Badge for arb/value/status, Card, Field/labelled input, Toggle, Stat), `components/AppShell.tsx` (sticky topbar: wordmark in Hanken, BankrollInput, LiveIndicator, "Search now" button → poll mutation + invalidate, ThemeToggle, nav tabs), `components/LiveIndicator.tsx`, `components/BankrollInput.tsx` (+ a BankrollContext), `main.tsx`, `App.tsx` (view switch state).
- [ ] Verify typecheck; commit.

---

# Milestone M5b — Feature views (parallel workflow agents, disjoint files)

### VIEW A: Opportunities table + filters (`features/opportunities/OpportunitiesView.tsx`, `OpportunityRow.tsx`, `FiltersBar.tsx`)
useQuery(listOpportunities, filters, refetchInterval). Table columns: badge(arb green / value amber) · sport · event + teams · commence + **time-to-kickoff** · market · **margin%** (arb) / **edge%** (value) · **gross profit @ bankroll** (mono) · quick actions (Accept·Bet placed·Skip·Archive via setStatus mutation + optimistic invalidate). Sortable headers (esp. time-to-event); FiltersBar drives query params (sport from /api/sports, region from meta.regionProfiles, type, minMargin slider, sort=timeToEvent, "prefer further-from-kickoff" toggle = sort desc by commence). Row click expands inline to mount `<Calculator>`. Staggered row reveal. Empty state.

### VIEW B: Bidirectional calculator (`features/opportunities/Calculator.tsx`)
Reconstruct ArbOpportunity from legs; **forward** (stake input → per-leg stakes, guaranteed return, gross profit) and **reverse** (target gross profit OR target return → required stake + per-leg), live recompute via `@quest/core` as user types, honoring the meta `stakeRounding`. Headline = GROSS; a small muted line shows `netAfterTax(gross, meta.taxRate)` ("Net ≈ €X after Y%"). Per-leg table (book · outcome · odds · stake, mono). **Copy summary** button → clipboard text (one line per leg: book, outcome, odds, stake) for two-window manual placement. Default the stake to the global bankroll; allow per-opportunity override.

### VIEW C: Settlement (`features/settlement/SettlementView.tsx`)
useQuery(listOpportunities {status:'bet_placed'}). For each, a record-outcome form: winning selection (select from legs), per-leg result (settled/voided/rejected), realized profit, notes → settle mutation. Show predicted (gross) vs realized side by side. Auto-fill nothing in v1 (API has no results feed yet) — leave a clear seam/comment.

### VIEW D: Stats (`features/stats/StatsView.tsx` + `charts/BarChart.tsx`, `charts/Sparkline.tsx`)
useQuery(stats). Stat cards (total opportunities, avg margin %, avg edge-survival, by-sport count). Minimal SVG **BarChart** (by-sport count + avg margin) and a **Sparkline** placeholder for trends. Clean, monochrome + accents, mono axis labels. Note in a comment where realized-vs-predicted / hit-rate / slippage will plug in once settlement data accrues (stats API currently returns counts/margin/survival).

---

# Milestone M6 — Integrate, render-check, ship

### Task 7 (orchestrator): integrate + live render check
- [ ] Wire `App.tsx` view switch to the four views; ensure providers wrap everything.
- [ ] `pnpm --filter @quest/web typecheck && pnpm --filter @quest/web build` clean.
- [ ] Run dev (`@quest/web` Vite on 5173 with proxy) against the mock server (`@quest/server` on 8787) and **render-check with Claude Preview / a headless screenshot**: opportunities load, a row expands to the calculator, forward+reverse recompute, copy works, filters work, theme toggles, stats render. Capture a screenshot.
- [ ] Commit.

### Task 8 (orchestrator): Docker + serve static + README
- [ ] Add a production static-serve route to `@quest/server` (serveStatic from `@hono/node-server/serve-static`, gated to when `apps/web/dist` exists / `NODE_ENV=production`, SPA fallback to index.html for non-`/api` routes).
- [ ] Multi-stage root `Dockerfile`: build stage (pnpm install, build web → dist, prune) → slim runtime (node:22-slim, copy server + web/dist + node_modules + drizzle migrations, `CMD tsx apps/server/src/index.ts` or a built entry). `.dockerignore`. `docker-compose.yml` (one service, volume for `./data` sqlite, env from `.env`, port 8787, restart unless-stopped).
- [ ] `README.md`: what Quest is, quickstart (pnpm install, dev, test), config (`.env.example`), Docker (`docker compose up`), Cloudflare Tunnel note, the 3-plan/architecture summary, and the keyless-mock vs live-key behavior.
- [ ] Verify `docker compose build` succeeds (and, if feasible, `up` + curl the served UI). Commit.

---

# M6-review — Adversarial UI/correctness review (workflow)
Dimensions: calculator math correctness (forward/reverse parity with `@quest/core`, gross headline, net-only-as-annotation, rounding), API-client/type fidelity vs server, accessibility (labels, keyboard, contrast in both themes), state/refetch correctness (no stale after mutations, optimistic safety), theme token consistency, Docker correctness (static serve + SPA fallback + migrations present). Verify each finding; fix confirmed; re-green; then finishing-a-development-branch → merge to main.

---

## Acceptance criteria (Plan 3 / v1 done)
1. `pnpm typecheck && pnpm test && pnpm lint` green across all packages incl. web; web `build` succeeds.
2. Running dev against the keyless mock server, the UI shows the arb + value opportunities; a row expands into the working bidirectional calculator (gross headline, net annotation), copy-summary works.
3. Filters (sport/region/type/minMargin/time-to-event) and lifecycle quick actions work and reflect immediately.
4. Settlement view records outcomes; stats view renders counts/margin/survival with charts.
5. Dark/light toggle works and persists; aesthetic is clean, minimal, data-dense, non-generic.
6. `docker compose up` serves the full app (server + built UI) on one port; sqlite persists in a volume.
7. Tax remains display-only; no automated placement; no LLM calls.
