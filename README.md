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
| `npm run build` | catalogue → `chez.js` SDK → shell CSS → games → Vite shell pages → service worker, into `apps/web/dist` |
| `npm run dev:web` | Vite dev server for the shell pages (proxies `/api` to a running `wrangler dev`) |
| `npm test` | unit tests: RNG, rules, level generators and solvers, Nyanya replay determinism, Water Bugs rules, name moderation, challenge codes, thread composition and lives, stars and strips |
| `npm run smoke` | end-to-end API test against the running Worker: identity, runs, caps, challenges and device-made codes, Nyanya Rescue, Water Bugs by link, names, threads and their standings, recovery |
| `npm run browser` | headless Chrome: the shared header on every page; every featured game start → end screen; the end screen on Slow 4G and offline; Share on the first tap offline; a challenge on another device (same seed); Today's Thread end to end with turn cards, lives, resume and the receipt; the name claim; screenshots in `tests/screens/` |
| `npm run a11y` | axe-core (WCAG 2.2 AA) on every page, every featured game's start, play and end screens, the menu, a turn card and the receipt |
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
| A2 Home everywhere | the shared header's logo (confirms mid-run), end screen and turn card links, the menu |
| A3 background | replaced by spec 2's flat `--ground` |
| A5, B7 events | `C.track()` → `/api/events` and GA4 (`gtag`), names as in B7 |
| B1 names | format rules `packages/chez-sdk/src/names.js` (shared); moderation lists **server-only** in `apps/worker/src/moderation.js`; `claimName` in `apps/worker/src/index.ts` |
| B2 sharing | replaced by spec 2 §1.2: native share sheet, else WhatsApp, else copy (`share.js`) |
| B2 preview cards | `GET /og/c/<id>.png`, drawn in the Worker by `apps/worker/src/og.ts` from data built by `scripts/og-cards.mjs` (about 10 ms CPU, edge-cached; fits the Free plan) |
| B3 landing | `stage.js` `showChallengeIntro`, in the start screen's style: one Play button |
| B4 end screens | replaced by spec 2 §3.3 (`endscreen.js`) |
| B5 boards | `GET /api/top/<game>?board=week|all|today|friends&limit=10`; weeks start Monday 00:00 EAT (`weekKey` in `rules.js`) |
| B5 integrity | rate limits per player and IP; scores above the game's maximum are stored `flagged` and kept off boards |
| Moderation | `POST /api/report`; `/admin` page and `/api/admin/*` behind the `ADMIN_TOKEN` secret |

Data model (B6) mapping: `players` gained `name_normalized` (unique), `name_changed_at`, `name_changes`, `status`; spec `scores` are our `runs` (plus `week_key`, `flagged`, `hidden`); spec `sessions` are runs that have started but not finished; `reports` is new. See [`apps/worker/migrations/0002_core_loop.sql`](apps/worker/migrations/0002_core_loop.sql).

Defaults taken for the open decisions (spec §9), all easy to change:

- Template game: Nyanya Jetpack. The loop is shared code, so all four featured games got it at once (M6).
- Backend: the existing Worker + D1; `/c/<id>` already server-renders its preview tags.
- Third share option: Facebook (until spec 2 replaced the sheet with the native share chain).
- Name changes: one free change, then one every 14 days.
- Mild insults and animal nicknames: allowed but flagged for review (they show on boards until an admin acts).
- Success targets (§0), set 2026-10-04: name claim rate 40%, share rate 20%, link-to-play 60%, viral coefficient 0.4, D1 return 25%, D7 return 10%.
- Blocklist: `moderation.js` follows [`docs/swahili_profanity_blocklist_and_moderation_strategy.md`](docs/swahili_profanity_blocklist_and_moderation_strategy.md). Still open: who reviews it (native speakers across regions).

Old Swahili game URLs redirect (`apps/web/public/_redirects`): Kata Nusu, Toka and Kifuniko go to their English pages (301); archived or removed games go to the homepage (302).

## Spec 2: fixes, new UI and game threads

[`docs/spec-2-fixes-ui-threads.md`](docs/spec-2-fixes-ui-threads.md). No new games. Where each part lives:

| Spec | Where |
|---|---|
| 1.1 slow end screen | Confirmed cause: the end screen waited for `/run/finish` (and a hash) before drawing. Now `stage.js` `onFinish` draws it from the local result at once; the result is written to the offline queue *then* sent (`net.js` `sendQueued`), so leaving the page never loses it. Rank and confirmed coins start as grey placeholders and fill in; after 5 s or a failure the rank line hides. Games stop drawing while a shell screen covers them, and GA calls wait for idle time. Logs `end_screen_render_ms` (`build`: our work, `ms`: to first paint). |
| 1.2 Share challenge | Codes are made on the device when the game ends: `packages/chez-sdk/src/codes.js`, `<game>-<seed>-<score>-<6 base36>` (the seed part also carries `_L<level>`, `_n` Native, `_r` rescue). The share chain runs inside the tap, no network first: `navigator.share` → `wa.me` → clipboard (`share.js`). Registration is `PUT /api/challenges/:code` (idempotent), queued right behind the result. Opening `/c/<code>` decodes game, seed and score from the code; the server adds the challenger's name if it answers within 3 s. A code opened before it was registered is stored with no creator and claimed later; an offline challenge run settles when it syncs. "making your challenge link" no longer exists anywhere. |
| 2 design system | `packages/ui/tokens.css` (the spec's tokens, light only) and `ui.css`; Bricolage Grotesque and Figtree from Google Fonts (`display=swap`), injected into every page by `scripts/build.mjs` |
| 2.3 shared header | `packages/chez-sdk/src/header.js`: one component on every shell page and game page; slim 44 px in play; the thread HUD row. The menu button opens site navigation (and, on a game page, its settings, variant, pass the phone and how to play). The bottom tab bar is gone. |
| 2.5 game icons | `apps/web/public/icons/games/<slug>.svg`, drawn from each game's own sprites (**drafts for Mbogo's approval**) |
| 3.1 Home | `apps/web/src/main.js` `pageHome`: date, Standings, Today's Thread hero (start / continue / done), the 2-column game cards with median play time (`GET /api/games/stats`, real data once a game has 20+ runs, rounded to 15 s), Play and Duel, the claim card |
| 3.2 Game start | `stage.js` `showStart`: the game's colour, icon, tagline, your best and weekly rank, Solo / Duel a friend / Daily, claim, the thread bar |
| 3.3 End screen | `packages/chez-sdk/src/endscreen.js` |
| 3.4 Name claim | `packages/chez-sdk/src/claim.js`; `GET /api/names/:name` for the 300 ms debounced check; names are now letters, numbers and `_` only; unclaimed scores show as Guest |
| 3.5 Standings | `/standings` (Daily thread, today or this week) and `/top/<game>` |
| 4 game contract | `run.finish(result)` → the shell completes a `GameResult` (`stage.js` `toGameResult`); stars and the result strip are worked out by `packages/chez-sdk/src/results.js` from each `stage.json` `"stars"` rule; `Chez.onForceEnd()` at `maxDurationSec` (60) |
| 5 threads | `threads.js` (composition, seeds, lives: pure, shared with the Worker), `thread-state.js` (progress on the device, resume, expiry), `thread-ui.js` (intro, turn card, receipt); pages `/t/<date>`, `/t/anytime-<id>`, `/t/today`, `/t/new`. Server: `mode: 'thread'` runs (the server recomputes the game and seed for the turn), `PUT /api/threads/:threadId/results/:attemptId` (stars and lives worked out from the attempt's own runs; idempotent), `GET /api/standings/daily-thread/:date[?board=week]` |
| 7 events | `end_screen_render_ms`, `share_tapped` / `share_completed` / `share_failed`, `challenge_opened`, `name_claimed` (surface), `thread_started`, `turn_completed`, `thread_completed`, `thread_abandoned`, `thread_resumed` |

Data: [`apps/worker/migrations/0003_threads.sql`](apps/worker/migrations/0003_threads.sql) adds `thread_id`, `thread_turn`, `thread_attempt` to runs and a `thread_results` table. Challenge codes need no schema change.

Choices made where the spec left room (all easy to change):

- **Names of the games:** the spec's table calls Cap Drop "Kifuniko" (`/g/cap`), but it lists the *current* games, and Kifuniko was renamed Cap Drop on 2026-10-04 (English only). Cap Drop stays; its old links still redirect.
- **Star thresholds** (spec §4, "Mbogo to set from real play data"): set in each `stage.json` by the spec's method from the 41 production runs so far. Nyanya 10 / 40 / 120 m; Cut It in Half at most 30 / 15 / 6 cm off; Cap Drop solved / within 2 of best / best possible; Arrow Puzzle cleared / at most 1 bump / no bumps.
- **60-second runs:** every featured game ends at 60 s (a countdown shows from 10 s). The puzzles count a board not solved in time as 0 stars; Arrow Puzzle's "out of hearts" now ends the run as not cleared (0 stars) instead of its own retry card.
- **Duel** starts a normal run whose end screen leads with "Share challenge" (the existing async head-to-head).
- **Daily thread ranking:** only the first attempt that reaches a result ranks, and only on its own day; after running out of lives, tries say "Try again (unranked)".
- **Thread completion bonus:** +10 XP, +5 coins, up to 10 a day.
- **Dark mode:** removed (spec: light only). The native variant, pass the phone, Assist and "How it's made" moved from the start card into the menu.

## Layout

```
apps/web/            shell pages (Vite): home, standings, threads (/t/), challenges, profile, /c/ landing, about/privacy/terms
  public/            manifest, icons (incl. icons/games/), og images, _headers (the build adds /shell and /g)
  sw.template.js     service worker (precaches the shell; caches each game on first open)
apps/worker/         the Worker: API, D1 migrations, /c/ and /t/ Open Graph rewrites, /og/c/ cards, /b/<brand>/<slug>/ skins
packages/chez-sdk/   chez.js: the shared header, stage contract and GameResult, start and end screens, threads,
                     challenge codes, sharing, name claim, identity + signed requests, offline queue, i18n, telemetry
packages/ui/         tokens.css, ui.css (fonts come from Google Fonts; packages/ui/fonts is only for old OG renders)
packages/i18n/       en.json (shell strings; game strings live in each stage.json). English only.
packages/rng/        xmur3 + mulberry32, shared by stages, tests and the Worker
games/<slug>/        index.html, game.js, stage.json (manifest), style.css, README.md, plus logic.js/sim.js where pure
games/_lib/          shared stage helpers (logical canvas, fixed-timestep loop)
brand/               logo SVGs traced from chezable-logo.png, app icon
docs/                build spec, spec v1, spec 2, Chezability, pre-registration, the Swahili blocklist
scripts/             build, tests, assets
```

### The stage contract

A game is a folder. Its `game.js` does three things:

```js
import M from './stage.json';
Chez.stage(M);                                   // the shell draws the header, start screen and menu
Chez.onPlay(async (ctx) => {                     // ctx: { mode: solo|daily|h2h|thread|…, variant, challenge, … }
  const run = await Chez.run.start(ctx);         // { runId, seed, rng, stream(name), speed, input(), firstAtom() }
  // ... all gameplay randomness from run.rng / run.stream(); fixed-timestep simulation ...
  await run.finish({ score, tiebreak, detail, scoreLabel, sub });   // the shell draws the end screen or turn card
});
Chez.onForceEnd(() => { /* time's up: finish now with what you have */ });
```

The shell completes the result into a `GameResult` (stars and strip from `stage.json` `"stars"`), and owns the end screen, personal bests, XP and coins, challenge codes, threads, pass the phone (same seed for every player), dailies, the Native/Classic toggle and Assist mode.

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
| Level *n* needs 100 × n^1.5 XP | level *n* at 100 × (n−1)^1.5 XP (level 2 at 100) | so level 1 starts at 0 and Native unlocks after a few first plays |
| Swahili game names, English + Swahili UI | English names (Arrow Puzzle, Cap Drop, …), English-only UI; Zamia removed | owner decision, 2026-10-04 (old `/g/<swahili-name>/` links redirect) |
| Shisima "if week 3 has room" | built, as **Water Bugs** | open decision 2 |
| Pass the phone kept per prototype | handled by the shell: both players play the same seed in turn (Apple Slicer's Block Mode and Water Bugs run their own two-player turns) | fairer, and works for every stage |
| Hoop Shot seeded wind is P1 | built (small seeded wind per shot) | Appendix B lists "identical windows" as a gap to fix |

## Before launch: what still needs a person

- **Legal review:** of the privacy notice and terms (drafts in `apps/web/src/static.js`), coin rules, and whether ODPC registration is needed.
- **Real devices:** a mid-range Android over 4G, an iPhone, a tablet (launch item 1). The automated runs here use desktop Chrome at phone size. In particular, spec 2 §1.1 (end screen within 150 ms of the game ending, on Slow 4G) and §1.2 (the share sheet on the first tap on Android Chrome and iOS Safari, offline) need a real phone: in headless Chrome on the dev laptop our code builds the end screen in 10 to 45 ms, but a single frame takes about 200 ms there even on an idle page.
- **Game icons:** approve or replace the drafts in `apps/web/public/icons/games/` (spec 2 §2.5).
- **Spec 2 success targets** (§7): share completion rate, median `end_screen_render_ms`, share of daily visitors who start the Daily thread, thread completion rate, drop-off per turn, challenge links opened per share. Not set yet.
- **Pre-registration:** confirm and date [`docs/preregistration.md`](docs/preregistration.md) before the first public link.

P1 hooks left in place (spec §14): server replay verification (`runs.input_hash`, `runs.verified`, the shared `rng` and pure sims), groups (`edges`), coin spending (ledger only), and ghosts for the other stages (input logs are already recorded).
