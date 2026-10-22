# Quest — Phase 0 Research (Viability Gate)

**Date:** 2026-06-14
**Status:** Complete. Findings below gate the data-source adapter and the default region config.
**Method:** Live web research against official pricing/docs/regulatory pages (2026), cross-checked against the PRD's prior candidates. Vendor-marketing claims are flagged as such; anything unverifiable is called out explicitly.

---

## 0. Executive summary & viability verdict

The project is **viable, but not as a strict Lithuania-only arbitrage tool against a mainstream odds API.** The binding constraint is exactly the one the PRD predicted:

> arbitrage only works where **(books you can fund) ∩ (books the API prices) ∩ (≥2 books on opposite sides of the same market)**.

- **Lithuania-strict overlap is thin.** Post-May-2025 you can only cleanly fund **LT-licensed** books. The LT-licensed set is mostly *local* operators (Topsport, Optibet, 7bet, OlyBet, Cbet, Twinsbet) that mainstream odds APIs do **not** carry. The one strong overlap with API coverage is **Betsson** (the rebrand of Betsafe in LT). That is not enough fundable legs for sustained cross-book arbitrage on its own.
- **Sweden (and broader EU) is much richer.** Sweden licenses Unibet, Betsson, bet365, Betway, LeoVegas, NordicBet, Betsafe, Expekt — all of which mainstream APIs price. A Sweden/EU profile is where real cross-book arbs are most likely to appear.
- **Value betting works LT-wide regardless.** A sharp reference (Pinnacle / Betfair) lets us flag value bets at *any* fundable book (incl. Betsson in LT) without needing a second fundable book — so the value engine has utility even where arbitrage does not.

**Conclusion for the build:** proceed exactly as the PRD intends — build the deterministic engine + logging-first pipeline behind a pluggable provider/region adapter, then let the **collected data empirically answer** "do real edges appear, where, and how long do they survive?" The research changes *expectations and default config*, not the architecture. Recommended default region profile: **decide with the user** (see §6 — LT-strict vs SE vs broad-EU). Recommended starting provider: **The Odds API**.

---

## 1. Chosen odds data API

### Recommendation
**Start with The Odds API** (the-odds-api.com), behind an `OddsProvider` interface so the provider is a config swap. Upgrade candidate is **OddsPapi** *if* a live-key check confirms it prices LT/SE-fundable soft books at a tier within budget.

### Why The Odds API first
It is the only candidate that combines all of: a genuinely usable free tier (full book/sport/market access), **decimal odds by default**, a confirmed sharp reference (**Pinnacle** EU region + **Betfair Exchange** listed on its official bookmaker page), transparent cheap paid tiers ($30–$59/mo), and battle-tested reliability. Its weakness is breadth (~40 books), which is acceptable for prototyping and is exactly what the swap-able adapter is for.

### Comparison (2026, verified where possible)

| Criteria | **The Odds API** ✅ start | SportsGameOdds | OddsPapi (upgrade?) | odds-api.io |
|---|---|---|---|---|
| Free tier | 500 credits/mo, all sports/books | 2.5k objects/mo, 10-min delay, **9 books** | 250 req/mo, all ~350 books incl. Pinnacle | 2 books only, 100 req/hr |
| Cheapest paid | **$30/mo** (20k credits); $59 (100k) | $99/mo (Rookie, 77 books) | ~$49/mo *(vendor-stated)* | £99/mo (5 books) |
| # Bookmakers | ~40 | 80+ (9 free) | 350+ *(claimed)* | 265+ *(claimed)* |
| EU/LT soft books | Unibet, **Betsson**, NordicBet, 1xBet, Betway; bet365 paid | "major EU books", not itemized; US-centric | bet365, 1xBet conf.; LT books **unverified** | bet365, Unibet, Betsson, Bwin; LT books unconf. |
| Sharp reference | **Pinnacle (EU, delayed scrape) + Betfair Exchange** | Pinnacle on $299 tier; no Betfair | Pinnacle on free *(claimed)* | **No Pinnacle** (dropped Jul-2025); Betfair yes |
| Decimal odds | **Yes (default)** | likely | yes | not documented |
| World Cup 2026 | Yes | likely | yes *(claimed)* | soccer yes |
| Push/WebSocket | REST only | REST | WebSocket on paid | WebSocket = 2× price |
| Verdict | **Best starting point** | US-centric, dear for sharp | Best breadth *if verified* | No Pinnacle, tiny free tier |

**Avoid for this budget:** OpticOdds / OddsJam (operator-grade, ~$5,000+/mo).

Sources: [the-odds-api.com](https://the-odds-api.com/) · [bookmaker list](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html) · [v4 docs](https://the-odds-api.com/liveapi/guides/v4/) · [sportsgameodds pricing](https://sportsgameodds.com/pricing) · [oddspapi.io](https://oddspapi.io/) · [OddsPapi WC2026](https://oddspapi.io/blog/world-cup-odds-api-2026-fifa/) · [odds-api.io Pinnacle shutdown](https://odds-api.io/blog/pinnacle-api-shutdown-alternatives)

> ⚠️ **Pinnacle caveat:** The Odds API's Pinnacle feed is a web-scrape "which may incur a delay" — fine as a soft sharp reference for value detection, **not** a low-latency line. Pinnacle shut its own public API in Jul 2025, so no provider has a first-party Pinnacle feed anymore.

---

## 2. Lithuania-accessible bookmakers

The Lithuanian Gaming Control Authority (**LPT**, lpt.lrv.lt) licenses *legal entities*, not brand names; its remote-gambling permission list currently shows **~10 licensed operator companies**. Brand→operator mapping (corroborated from regulatory/industry reporting):

| Brand (as in a feed) | Operator | Licensed (remote betting) | Notes |
|---|---|---|---|
| **Topsport** | UAB "Top Sport" | ✅ | Largest LT book; oldest licence. |
| **Optibet** | UAB "Baltic Bet" | ✅ | |
| **7bet** | UAB "Amber Gaming" | ✅ | |
| **Betsson** (ex-**Betsafe**) | UAB "Lošimų strateginė grupė" | ✅ | **Betsafe rebranded to Betsson in LT.** A feed may say "Betsafe"; same operator. **This is the key API-overlap book.** |
| **OlyBet** | UAB "Olympic Casino Group Baltija" | ✅ | |
| **Cbet** | UAB "Tete-a-tete kazino" | ✅ | |
| **Twinsbet / NeseSport** | UAB "Nesė" | ✅ | Treat both as the Nesė entity. |
| **Uniclub** | UAB "Unigames" | ✅ | **Not** Unibet. |
| Party Casino, VSGA | resp. entities | entity ✅ / betting brand ❓ | Likely casino-focused; uncertain for sports betting. |

**Drop from prior list (NOT licensed/available in LT):** **TonyBet** (LT is a restricted country; original LT business folded into Betsson in 2016), **Unibet** (withdrew from LT Dec 2020 — do not confuse with "Uniclub"), **Betano** (no LT licence found), **NoTabu** (unverifiable).

### The May 2025 payment-blocking rule (confirmed)
Effective **1 May 2025**, Lithuanian payment service providers must **block transfers to operators not licensed in Lithuania**. LPT maintains a whitelist; PSPs must act on blocking directives within 24h; fines €1,800–€6,000. **Consequence:** fundability — not just registration — defines the usable book set. You can only cleanly deposit/withdraw at LT-licensed books.

Sources: [LPT permission list](https://lpt.lrv.lt/en/gambling-operators/permission-list/) · [LPT remote-gambling list](https://lpt.lrv.lt/en/gambling-operators/permission-list/remote-gambling/) · [next.io: payment-blocking law](https://next.io/news/regulation/lithuania-approves-new-gambling-payment-blocking-law/) · [ThePaypers](https://thepaypers.com/payments-general/lithuania-implements-new-unregulated-gambling-payment-blocking-law--1271825) · [Betsson/TonyBet](https://www.sbcnews.co.uk/featurednews/2016/09/08/betsson-boosts-baltic-arm-tonybet-acquisition/) · [Unibet exits LT](https://pokeriomokykla.com/en/unibet-will-not-be-available-for-lithuanian-customers)

### EU / Sweden pluggability
No EU-wide passport — each state licenses separately, several with their own payment/IP blocking. **Sweden (Spelinspektionen)** is the strong case: Unibet, Betsson, bet365, Betway, LeoVegas, NordicBet, Betsafe, Expekt all SE-licensed *and* API-covered. This validates region-as-a-pluggable-dimension and makes **SE the most arb-fertile profile** of the three. Source: [Spelinspektionen operators](https://igamingexpert.com/regions/europe/leovegas-bet365-unibet-swedish-microscope/)

---

## 3. The intersection (the decisive table)

Cross-referencing §1 (The Odds API coverage) against §2 (fundable books):

| Region profile | Fundable books | …also priced by The Odds API | Arb-viable? |
|---|---|---|---|
| **LT-strict** | Topsport, Optibet, 7bet, Betsson, OlyBet, Cbet, Twinsbet, Uniclub | **Betsson** (only); maybe 1xBet (not LT-licensed → not fundable) | ❌ thin — value bets only |
| **Sweden (SE)** | Unibet, Betsson, bet365, Betway, LeoVegas, NordicBet, Betsafe, Expekt | Unibet, Betsson, NordicBet, Betway, (bet365 paid tier) | ✅ several legs |
| **Broad EU** | varies by country | Unibet, Betsson, NordicBet, 1xBet, Betway, Pinnacle, Betfair | ✅ widest |

**Implication:** For LT-strict, the tool is primarily a **value-bet detector** (sharp ref vs Betsson). For real **arbitrage**, point it at **SE** or **broad-EU** profiles. The architecture handles all three identically — only the configured book allowlist changes.

> **Must-verify with a live key (cheap/free):** before committing, pull The Odds API's live bookmaker list for the `eu` region and grep for the exact fundable brands per profile. Marketing pages under-report; the live endpoint is truth. Same check for OddsPapi (free key, 250 req/mo) if we consider the upgrade.

---

## 4. Betfair Exchange API — Phase 3 feasibility (do NOT build in v1)

**Verdict: worth a Phase 3 spike; it is the only legitimate programmatic-placement route** (traditional books forbid automation and offer no placement API). But real blockers exist.

- **API:** Real REST/JSON-RPC product ("Exchange API", historically "API-NG"). Betting API (`listMarketCatalogue`, `listMarketBook`, `placeOrders`, `cancelOrders`, `listClearedOrders` for settlement), Accounts API (`getAccountFunds`), and an **Exchange Stream API** (push) recommended over polling.
- **Auth:** App key (in `X-Application` header) + session token. **Non-interactive certificate login** is the path for unattended bots (interactive login can demand 2FA/national-ID and breaks automation). Keep-alive ≥ every 24h.
- **Cost:** **Delayed key = free** (data only, 1–180s delay, **cannot place bets**); **Live key = one-off £499** (raised from £299; verified current per Betfair support article updated 2026-06-02). Build the data path on the free key; pay only to actually place.
- **Commission (the real economic risk):** Market Base Rate up to **5%** of net winnings per market, **plus a Premium Charge that scales 20%→~60%** of profits on consistently winning accounts. A systematically profitable automated account is exactly its target — this can eat thin arb margins. Model before assuming arb profit survives.
- **LT/EU reach:** Probable for LT but **unconfirmed from a primary source**; liquidity is concentrated in **UK/IE/MT**, thin elsewhere — an execution risk (you may not get matched at the detected price). Combined with the May-2025 payment rule, LT *funding* of Betfair is doubtful. Verify by registration.
- **Rate limits:** `listMarketBook` ≤ 5 calls/s per market; 200-point per-request data weight cap; placement ≤ 1000 instructions/s. Comfortable for our needs.
- **Two-leg problem:** Betfair only automates the *exchange* leg; the opposing bookmaker leg has no API and stays manual. End-to-end auto-arb across book+exchange is not achievable — limits the value of automating one side.

Sources: [Betfair Developer portal](https://developer.betfair.com/) · [Exchange API guide](https://developer.betfair.com/exchange-api/) · [Betting API docs](https://docs.developer.betfair.com/display/1smk3cen4v3lu3yomq5qye0ni/Betting+API) · [API costs (£499, Jun-2026)](https://support.developer.betfair.com/hc/en-us/articles/115003864531-Are-there-any-costs-associated-with-API-access) · [Market data limits](https://docs.developer.betfair.com/display/1smk3cen4v3lu3yomq5qye0ni/Market+Data+Request+Limits) · [Betfair charges](https://support.betfair.com/app/answers/detail/betfair-charges) · [Netacea: arb bots](https://netacea.com/blog/the-anatomy-of-an-arbitrage-betting-bot/)

---

## 5. Rate limits → polling frequency (The Odds API)

The Odds API bills **credits = (markets × regions) per call**, not raw requests:

| Tier | Credits/mo | 1 sport × 1 region × 2 markets (2 cr/call) | Practical cadence |
|---|---|---|---|
| Free | 500 | ~250 calls/mo | ~1 poll / 3 h — **dev only** |
| $30 | 20,000 | ~10,000 calls/mo | ~1 poll / 4–5 min |
| $59 | 100,000 | ~50,000 calls/mo | **~1 poll / 50–55 s** (single sport/region) |

**Rule:** `poll_interval ≈ month_seconds ÷ (monthly_credits ÷ credits_per_call)`. More sports/markets divide the cadence proportionally. Live-soccer arbs want sub-30s → realistically the **$59+ tier**, or a **WebSocket provider** (OddsPapi/odds-api.io paid) since push beats polling for closing arb windows. **For v1 prototyping, the free tier + a conservative default `POLL_INTERVAL_SECONDS` (e.g. 300s) is fine to validate the pipeline; tune up after picking a paid tier.**

---

## 6. Design implications (feed these into the spec)

1. **Region = API-region param + a fundability allowlist.** The Odds API regions are broad (`uk`/`us`/`eu`/`au`), not per-country. So a "region profile" in Quest = `{ apiRegions: ['eu'], bookAllowlist: [...fundable brands...] }`. Fetch from the API region, then filter legs to the allowlist before detecting arbs. This is how LT/SE/EU pluggability is implemented cleanly. Ship `lt`, `se`, `eu` profiles as config.
2. **Brand aliasing matters.** "Betsafe" ↔ "Betsson" must be aliased in the normalizer so a feed labelled either way maps to the one fundable LT entity. Build a small alias map in the normalization layer.
3. **Value engine has standalone value for LT.** Since LT-strict can't arb, the Pinnacle/Betfair-referenced value detector is the primary signal there. Make sure it's not treated as merely "secondary" in the LT profile.
4. **Default region is a product decision** (pending user): LT-strict (value-only, honest but few arbs), SE (most arbs, requires SE-fundable accounts), or broad-EU (widest net, fundability varies). Recommend shipping all three profiles and defaulting to whichever the user can actually fund today.
5. **Provider swap is config.** Keep `OddsProvider` clean so OddsPapi can replace The Odds API after a live-endpoint book-coverage check, without touching the engine.
6. **Phase 3 / Betfair** stays documented-only. If pursued, build on the free delayed key first and model the Premium Charge before assuming arb profit survives.

---

## 7. Open items to verify with a live key (before/early in Phase 1)

- [ ] Pull `GET /v4/sports` and the live bookmaker list for `regions=eu`; grep for Betsson, Unibet, NordicBet, Betway, bet365, LeoVegas, Expekt, Pinnacle, Betfair. Record which actually appear.
- [ ] Confirm decimal odds format and exact JSON schema for `h2h` (1X2/moneyline) on a live World Cup 2026 fixture.
- [ ] Confirm whether Pinnacle/Betfair appear on the free tier or require the $99 Business tier (PRD noted Pinnacle is Business-tier on some plans — verify against the live key).
- [ ] Measure real per-call credit cost for the intended sport/region/market set; set `POLL_INTERVAL_SECONDS` accordingly.
- [ ] (If considering OddsPapi) free-key check of its live `/bookmakers` for LT/SE brands.

---

*Research agents' full source lists are embedded inline above. This document is the Phase 0 deliverable required by PRD §4.4 and gates the `OddsProvider` adapter and default region config.*
