# Chezable

*Cheza: to play.* Short HTML5 games inside one shared shell, playable solo or head to head, and built to be shared. This repo is the MVP described in [`docs/build-spec.md`](docs/build-spec.md). It contains:

- **The shell**: identity, runs, XP and coins, daily seeds, challenge links, sharing, standings, telemetry.
- **Nine stages:** Kata Tufaha, Kata Nusu, Ruka Kapu, Nyanya Jetpack, Toka, Kifuniko, Kata Ndimu, Zamia and Shisima. Each has a Classic and a Native (Chezability) variant, except Shisima, which is native as built.
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
| `npm test` | unit tests: RNG, rules, level generators and solvers, Nyanya replay determinism, Shisima rules |
| `npm run smoke` | end-to-end API test against the running Worker: identity, runs, caps, challenges, send-back, Okoa, Shisima by link, standings, recovery |
| `npm run browser` | headless Chrome plays every stage to its result sheet and loads every shell page; screenshots go to `tests/screens/` |
| `npm run a11y` | axe-core (WCAG 2.2 AA) on every page and stage, light and dark |
| `npm run budget` | performance budgets from spec §9.5 |
| `npm run check` | all of the above (needs `npm run dev` running in another terminal) |
| `npm run assets` | regenerates app icons and the Open Graph images |
| `npm run readmes` | regenerates each game's README (charter checklist and pre-registration) from its `stage.json` |
| `npm run logo` / `npm run fonts` | re-trace the logo PNG into SVG / re-download the subset fonts |

To reset local data, stop the Worker and delete `apps/worker/.wrangler/state/`.

## Layout

```
apps/web/            shell pages (Vite): home, today, challenges, profile, standings, /c/ landing, about/privacy/terms
  public/            manifest, icons, og images, _headers (the build adds /shell and /g)
  sw.template.js     service worker (precaches the shell; caches each game on first open)
apps/worker/         the Worker: API, D1 migrations, /c/<id> Open Graph rewrite, /b/<brand>/<slug>/ skins
packages/chez-sdk/   chez.js: stage contract, runs, identity + signed requests, offline queue, prefs, i18n,
                     audio, haptics, share sheet, result sheet, challenges, pass the phone, telemetry
packages/ui/         tokens.css, ui.css, self-hosted fonts (59 KB)
packages/i18n/       en.json, sw.json (shell strings; game strings live in each stage.json)
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

**Determinism.** Every stage is seeded and simulates on a fixed timestep: Nyanya, Kata Tufaha and Kata Nusu at 1/120 s, Ruka Kapu at 1/240 s, Kata Ndimu at 1/60 s. The puzzle and turn-based stages are pure functions of the seed and the moves. `Math.random` is used only for cosmetic particles and sounds.

### API (Worker)

Spec §10.3, plus `POST /api/player/recovery` (issue a new recovery code) and `POST /api/challenge/:id/move` (Shisima link play). Requests are signed with HMAC-SHA256 keyed by SHA-256 of a device secret, and the server stores only that hash. The schema is in [`apps/worker/migrations/0001_init.sql`](apps/worker/migrations/0001_init.sql): the spec's tables plus `tiebreak`/`day`/`local` on runs, turn-game columns on challenges, `challenge_views` (for "Waiting for you") and `rate_limits`.

## Deployment

Live at **https://chezable.com** (and www), served by the `chezable` Worker on Cloudflare, with a fallback at https://chezable.mbogo.workers.dev.

- D1 database `chezable` (id in `apps/worker/wrangler.toml`, region EEUR). Migrations: `npm run db:remote`.
- Secret `PEPPER` (hashes recovery codes) is set on the Worker. Never commit it; rotating it invalidates existing recovery codes.
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
| Cut it in half | renamed **Kata Nusu** | open decision 1, default yes |
| Shisima "if week 3 has room" | built (ninth game) | open decision 2 |
| Pass the phone kept per prototype | handled by the shell: both players play the same seed in turn (Kata Tufaha's Kati and Shisima run their own two-player turns) | fairer, and works for every stage |
| Ruka Kapu seeded wind is P1 | built (small seeded wind per shot) | Appendix B lists "identical windows" as a gap to fix |

## Before launch: what still needs a person

- **Swahili review:** every string in `packages/i18n/sw.json` and each `stage.json` is a draft (open decision 8).
- **Legal review:** of the privacy notice and terms (drafts in `apps/web/src/static.js`), coin rules, and whether ODPC registration is needed.
- **Real devices:** a mid-range Android over 4G, an iPhone, a tablet (launch item 1). The automated runs here use desktop Chrome at phone size.
- **Pre-registration:** confirm and date [`docs/preregistration.md`](docs/preregistration.md) before the first public link.

P1 hooks left in place (spec §14): server replay verification (`runs.input_hash`, `runs.verified`, the shared `rng` and pure sims), groups (`edges`), coin spending (ledger only), dynamic OG images, and ghosts for the other stages (input logs are already recorded).
