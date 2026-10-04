# Chezable

*Cheza: to play.* Short HTML5 games inside one shared shell, playable solo or head to head, and built to be shared. This repo is the MVP described in [`docs/build-spec.md`](docs/build-spec.md). It contains:

- **The shell**: identity, runs, XP and coins, daily seeds, challenge links, sharing, standings, telemetry.
- **Eight stages:** Apple Slicer, Cut It in Half, Hoop Shot, Nyanya Jetpack, Arrow Puzzle, Cap Drop, Lemon Squeeze and Water Bugs. Each has a Classic and a Native (Chezability) variant, except Water Bugs (the Kenyan game Shisima), which is native as built. Since spec v1 ([`docs/spec-v1-cleanup-and-core-loop.md`](docs/spec-v1-cleanup-and-core-loop.md)) only four are **featured** (Cut It in Half, Nyanya Jetpack, Cap Drop, Arrow Puzzle); the other four are archived: still in the repo, reachable by direct URL, not listed.
- **One Cloudflare Worker** that serves the static site and the `/api`, backed by D1 (SQLite).

Everything runs locally. Locally the database is a plain SQLite file under `apps/worker/.wrangler/state/`, and nothing touches Cloudflare until you deploy.

## Run it locally

Needs Node 20+ and, for the browser tests, Chrome or Edge.

```sh
npm install
npm run dev          # builds, applies migrations to the local SQLite DB, serves http://127.0.0.1:8787
```

Open http://127.0.0.1:8787. To play as a second player (for challenges), open a private window, or another browser, on the same address.

| Command | What it does |
|---|---|
| `npm run build` | catalogue → `chez.js` SDK → shell CSS and fonts → games → Vite shell pages → service worker, into `apps/web/dist` |
| `npm run dev:web` | Vite dev server for the shell pages (proxies `/api` to a running `wrangler dev`) |
| `npm test` | unit tests: RNG, rules, level generators and solvers, Nyanya replay determinism, Water Bugs rules |
| `npm run smoke` | end-to-end API test against the running Worker: identity, runs, caps, challenges, send-back, Nyanya Rescue, Water Bugs by link, standings, recovery |
| `npm run browser` | headless Chrome plays every stage to its end screen, walks a challenge from A to B and back, forces each end-screen state at 360 px, and loads every shell page; screenshots go to `tests/screens/` |
| `npm run a11y` | axe-core (WCAG 2.2 AA) on every page and stage, light and dark |
| `npm run budget` | performance budgets from spec §9.5 |
| `npm run check` | all of the above (needs `npm run dev` running in another terminal) |
| `npm run assets` | regenerates app icons, the Open Graph images, and the challenge preview-card data (`apps/worker/src/og-data.generated.json`) |
| `npm run readmes` | regenerates each game's README (charter checklist and pre-registration) from its `stage.json` |
| `npm run logo` / `npm run fonts` | re-trace the logo PNG into SVG / re-download the subset fonts |

To reset local data, stop the Worker and delete `apps/worker/.wrangler/state/`.

Local secrets go in `apps/worker/.dev.vars` (git-ignored):

```
PEPPER=local-dev-pepper-change-me
PUBLIC_ORIGIN=http://127.0.0.1:8787
ADMIN_TOKEN=local-admin-token
```

`PUBLIC_ORIGIN` is needed locally because `wrangler dev` rewrites the request host to the route (chezable.com). The smoke test's admin checks run when `ADMIN_TOKEN` is set in its environment too.

## Spec v1: cleanup and the core loop

`play → end screen → challenge link on WhatsApp → friend plays → friend claims a name → challenges back → weekly board`. Where it lives:

| Spec | Where |
|---|---|
| A1 four featured games | `featured`/`archived` in each `stage.json`; `C.catalog.featured` |
| A2 Home everywhere | game bar Home button (confirms mid-run), intro card, end screen, pass-the-phone results, menu |
| A3 background | `--bg-base` and the radial shapes in `packages/ui/tokens.css`, `ui.css` |
| A5, B7 events | `C.track()` → `/api/events` and GA4 (`gtag`), names as in B7 |
| B1 names | format rules `packages/chez-sdk/src/names.js` (shared); moderation lists **server-only** in `apps/worker/src/moderation.js`; `claimName` in `apps/worker/src/index.ts` |
| B2 sharing | `packages/chez-sdk/src/share.js`: WhatsApp, Facebook, Copy link only |
| B2 preview cards | `GET /og/c/<id>.png`, drawn in the Worker by `apps/worker/src/og.ts` from data built by `scripts/og-cards.mjs` (about 10 ms CPU, edge-cached; fits the Free plan) |
| B3 landing | intro card in `packages/chez-sdk/src/stage.js`: one Play button |
| B4 end screens | `packages/chez-sdk/src/endscreen.js`, states 1–7; `?force_state=N` forces one for testing |
| B5 boards | `GET /api/top/<game>?board=week|all|today|friends&limit=10`; weeks start Monday 00:00 EAT (`weekKey` in `rules.js`) |
| B5 integrity | rate limits per player and IP; scores above the game's maximum are stored `flagged` and kept off boards |
| Moderation | `POST /api/report`; `/admin` page and `/api/admin/*` behind the `ADMIN_TOKEN` secret |

Data model (B6) mapping: `players` gained `name_normalized` (unique), `name_changed_at`, `name_changes`, `status`; spec `scores` are our `runs` (plus `week_key`, `flagged`, `hidden`); spec `sessions` are runs that have started but not finished; `reports` is new. See [`apps/worker/migrations/0002_core_loop.sql`](apps/worker/migrations/0002_core_loop.sql).

Defaults taken for the open decisions (spec §9), all easy to change:

- Template game: Nyanya Jetpack. The loop is shared code, so all four featured games got it at once (M6).
- Backend: the existing Worker + D1; `/c/<id>` already server-renders its preview tags.
- Third share option: Facebook.
- Name changes: one free change, then one every 14 days.
- Mild insults and animal nicknames: allowed but flagged for review (they show on boards until an admin acts).
- Still open: success targets (§0), and who reviews the blocklist. The supplied `swahili_profanity_blocklist_and_moderation_strategy.md` was not in the repo, so `moderation.js` holds a starter list that needs that review.

Old Swahili game URLs redirect (`apps/web/public/_redirects`): Kata Nusu, Toka and Kifuniko go to their English pages (301); archived or removed games go to the homepage (302).

## Layout

```
apps/web/            shell pages (Vite): home, today, challenges, profile, standings, /c/ landing, about/privacy/terms
  public/            manifest, icons, og images, _headers (the build adds /shell and /g)
  sw.template.js     service worker (precaches the shell; caches each game on first open)
apps/worker/         the Worker: API, D1 migrations, /c/<id> Open Graph rewrite, /b/<brand>/<slug>/ skins
packages/chez-sdk/   chez.js: stage contract, runs, identity + signed requests, offline queue, prefs, i18n,
                     audio, haptics, share sheet, result sheet, challenges, pass the phone, telemetry
packages/ui/         tokens.css, ui.css, self-hosted fonts (59 KB)
packages/i18n/       en.json (shell strings; game strings live in each stage.json). English only.
packages/rng/        xmur3 + mulberry32, shared by stages, tests and the Worker
games/<slug>/        index.html, game.js, stage.json (manifest), style.css, README.md, plus logic.js/sim.js where pure
games/_lib/          shared stage helpers (logical canvas, fixed-timestep loop)
brand/               logo SVGs traced from chezable-logo.png, app icon
docs/                build spec, Chezability, pre-registration
scripts/             build, tests, assets
```

### The stage contract

A game is a folder. Its `game.js` does three things:

```js
import M from './stage.json';
Chez.stage(M);                                   // the shell draws the bar, intro card, menu and rail
Chez.onPlay(async (ctx) => {                     // ctx: { mode, variant, challenge, player(s), skin }
  const run = await Chez.run.start(ctx);         // { runId, seed, rng, stream(name), speed, input(), firstAtom() }
  // ... all gameplay randomness from run.rng / run.stream(); fixed-timestep simulation ...
  await run.finish({ score, tiebreak, detail, share: { line, grid } });   // shell shows the result sheet
});
```

The shell then owns the result sheet, personal bests, XP and coins, sharing, challenge links, pass the phone (same seed for every player), dailies, the Native/Classic toggle and Assist mode.

**Determinism.** Every stage is seeded and simulates on a fixed timestep: Nyanya, Apple Slicer and Cut It in Half at 1/120 s, Hoop Shot at 1/240 s, Lemon Squeeze at 1/60 s. The puzzle and turn-based stages are pure functions of the seed and the moves. `Math.random` is used only for cosmetic particles and sounds.

### API (Worker)

Spec §10.3, plus `POST /api/player/recovery` (issue a new recovery code) and `POST /api/challenge/:id/move` (Water Bugs link play). Requests are signed with HMAC-SHA256 keyed by SHA-256 of a device secret, and the server stores only that hash. The schema is in [`apps/worker/migrations/0001_init.sql`](apps/worker/migrations/0001_init.sql): the spec's tables plus `tiebreak`/`day`/`local` on runs, turn-game columns on challenges, `challenge_views` (for "Waiting for you") and `rate_limits`.

## Deployment

Live at **https://chezable.com** (and www), served by the `chezable` Worker on Cloudflare, with a fallback at https://chezable.mbogo.workers.dev.

- D1 database `chezable` (id in `apps/worker/wrangler.toml`, region EEUR). Migrations: `npm run db:remote`.
- Secret `PEPPER` (hashes recovery codes) is set on the Worker. Never commit it; rotating it invalidates existing recovery codes.
- Secret `ADMIN_TOKEN` opens `/admin`. Set it with `npx wrangler secret put ADMIN_TOKEN -c apps/worker/wrangler.toml`. Without it the admin API is off.
- Runs on the Workers **Free** plan (10 ms CPU per request): the preview-card renderer is written to fit that, and falls back to the static game image if it cannot.
- chezable.com and www.chezable.com reach the Worker through routes on the proxied DNS records (`routes` in `wrangler.toml`).
- To ship a change: `npm run check` locally (with `npm run dev` running), then `npm run deploy`, then push to GitHub.
- Domain renewal: chezable.com expires **2027-09-21** (registered at OwnRegistrar). Put it in the diary (launch checklist item 12).

## Where this differs from the spec, and why

| Spec | Built | Why |
|---|---|---|
| Cloudflare Pages + a separate Worker | one Worker with static assets | same origin, one deploy; Cloudflare's current recommendation; Pages-style `_headers` still apply |
| Workers KV for daily seeds and rate limits | D1 tables (`daily_seeds`, `rate_limits`) | one less binding at MVP volume; KV can replace `rate_limits` later |
| "Two subset WOFF2 files" | three (Archivo Black, Barlow 600, Barlow 700), 59 KB | fits the 60 KB budget; weight 500 maps to the 600 file |
| Level *n* needs 100 × n^1.5 XP | level *n* at 100 × (n−1)^1.5 XP (level 2 at 100) | so level 1 starts at 0 and Native unlocks after a few first plays |
| Swahili game names, English + Swahili UI | English names (Arrow Puzzle, Cap Drop, …), English-only UI; Zamia removed | owner decision, 2026-10-04 (old `/g/<swahili-name>/` links redirect) |
| Shisima "if week 3 has room" | built, as **Water Bugs** | open decision 2 |
| Pass the phone kept per prototype | handled by the shell: both players play the same seed in turn (Apple Slicer's Block Mode and Water Bugs run their own two-player turns) | fairer, and works for every stage |
| Hoop Shot seeded wind is P1 | built (small seeded wind per shot) | Appendix B lists "identical windows" as a gap to fix |

## Before launch: what still needs a person

- **Legal review:** of the privacy notice and terms (drafts in `apps/web/src/static.js`), coin rules, and whether ODPC registration is needed.
- **Real devices:** a mid-range Android over 4G, an iPhone, a tablet (launch item 1). The automated runs here use desktop Chrome at phone size.
- **Pre-registration:** confirm and date [`docs/preregistration.md`](docs/preregistration.md) before the first public link.

P1 hooks left in place (spec §14): server replay verification (`runs.input_hash`, `runs.verified`, the shared `rng` and pure sims), groups (`edges`), coin spending (ledger only), and ghosts for the other stages (input logs are already recorded).
