---
title: Chezable MVP Build Spec
version: 0.1
date: 2026-10-03
status: draft for build
owner: Mbogo (Kega 22)
domain: chezable.com
related: [[Chezable]], [[Chezability]], [[casual-games]], [[Kiwanda]], [[Hook Library]], [[Network Effects Loop Library]]
---

# Chezable MVP Build Spec

*Cheza: to play. Chezable is the brand for playable experiences. The MVP is its first product line: a set of short HTML5 games running inside one shared shell, playable solo or head to head, and built to be shared.*

---

## 0. Summary

**What ships:** chezable.com, a mobile-first web app (installable PWA) with:

1. **The shell:** one shared layer for identity, progression (score, XP, coins), daily seeds, async head-to-head challenges, sharing, leaderboards and analytics. Every game plugs into it as a *stage*.
2. **Eight games** already prototyped in this cycle, integrated into the shell: Kata Nusu (Cut it in half), Nyanya Jetpack, Kata Ndimu, Zamia, Toka, Kifuniko, Kata Tufaha and Ruka Kapu.
3. **Two modes per game minimum:** solo and async head-to-head (challenge link). Some games also keep pass-the-phone.
4. **A Chezability layer:** every game ships with its notation line, a Chezability score, and a **Native mode** that applies one real operator and one Kenyan mechanic. Classic and Native modes run side by side as a pre-registered experiment.
5. **Responsive and accessible** on phone, tablet and desktop, with English and Swahili UI.

**Where it runs:** Cloudflare Pages (static shell and games), Workers (API), D1 (ledger and data), on chezable.com.

**What it is not (yet):** real-time multiplayer, paid coins, cash prizes, AR/camera play, native app-store builds, or the play-activity discovery engine. Each has a hook left in the architecture (§14).

---

## 1. Goals, non-goals and success criteria

### 1.1 Goals

| # | Goal | Measured by |
|---|---|---|
| G1 | Prove the challenge loop: a player sends a link, a friend plays, the friend sends one back | challenge-send rate, accept rate, return-challenge rate |
| G2 | Prove cross-game journeys: players try more than one stage | stages per player in first 7 days |
| G3 | Test Chezability's core claim: native mechanics beat borrowed ones | Native vs Classic replay and challenge-send rates (§11) |
| G4 | Build the play graph from day one | edges recorded per challenge (§10.5) |
| G5 | Have a reskinnable template ready for the first branded minigame | one game skinned from a `skin.json` without code changes (§12) |

### 1.2 Non-goals for MVP

Real-time online play, groups and group leaderboards (P1), coin spending (P1, ledger only at MVP), replay verification on the server (P1), social login, payments, sponsor dashboards, AR.

### 1.3 Launch criteria

The MVP is launchable when every item in §13.3 passes. In short: all eight games integrated, challenge loop works end to end on a mid-range Android phone over 4G, accessibility checks pass, analytics events flow, and the pre-registration block (§11.3) is written and dated before the first public link is shared.

---

## 2. Brand and design system

### 2.1 Logo

The logo is a leaping figure mark beside the wordmark "Chezable", with "Chez" in periwinkle blue and "able" in black.

| Use | Rule |
|---|---|
| Shell header (phone) | figure mark + wordmark, 28 px tall |
| Favicon / app icon | figure mark only, on white or brand blue |
| Dark mode | wordmark "able" switches to off-white `#F2F0EB`; "Chez" stays brand blue |
| Inside games | no logo in the play area; the shell chrome carries the brand |
| Clear space | at least the height of the "C" on all sides |

Deliverables: SVG versions of the mark, the full lockup, and a monochrome version. The supplied file is a 454×153 PNG, so it needs vectorising before launch.

### 2.2 Colour tokens

The games were built in one visual family (pegboard background, black sticker outlines, orange action buttons, yellow highlights). The logo adds brand blue. The rule: **blue is Chezable, orange is play.** The shell uses blue for identity and navigation. Games keep orange for their primary action.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--chez-blue` | `#5271FF` | `#5271FF` | logo, shell accents, links (large text only) |
| `--chez-blue-ink` | `#3A56E0` | `#8EA2FF` | blue text on light or dark surfaces (meets 4.5:1; verify with a checker) |
| `--play` | `#F26B1D` | `#F26B1D` | primary game action buttons, with black text |
| `--tape` | `#FFD21F` | `#FFD21F` | focus rings, highlights, hint states |
| `--line` | `#1B1D1E` | `#1B1D1E` | sticker outlines (constant in both themes) |
| `--ink` | `#1B1D1E` | `#F2F0EB` | body text |
| `--muted` | `#566166` | `#9DB0B7` | secondary text |
| `--paper` | `#FFFFFF` | `#18242A` | cards, sheets |
| `--board` | `#DFE4E2` | `#22323A` | pegboard background |
| `--success` | `#3FBF6A` | `#3FBF6A` | wins, hints |
| `--danger` | `#E5322A` | `#E5544A` | losses, warnings |

`#5271FF` on white is about 4:1, so it fails body-text contrast. Use `--chez-blue-ink` for any blue text under 24 px.

### 2.3 Type

| Role | Family | Notes |
|---|---|---|
| Display, scores, outlined game text | Archivo Black | white fill with 2.5–3 px black stroke for in-game labels |
| UI and body | Barlow 500/600/700 | sentence case |
| Fallbacks | Impact / system-ui | always declared |

**Self-host both fonts** as subset WOFF2 files on Pages instead of loading Google Fonts. It saves a DNS lookup and data for players on metered mobile plans.

### 2.4 Components

Sticker buttons (3 px outline, 5 px hard drop shadow, press shifts down), round icon buttons (44 px minimum), cards (22 px radius, 7 px hard shadow), the wooden title plank (used once per game on its intro card), outlined score text, and a bottom sheet for results. All of these already exist in the prototypes. Extract them into `packages/ui` as CSS plus small JS helpers.

### 2.5 Voice

Short, warm, playful, never mocking. Sentence case. English first with Swahili strings maintained in parallel (§9.6). Game names stay Swahili. Explanations stay plain.

---

## 3. Information architecture

### 3.1 Routes

| Route | Screen | Notes |
|---|---|---|
| `/` | Home | daily strip, game grid, journey, challenges badge |
| `/g/<slug>/` | Game page | shell chrome + stage |
| `/g/<slug>/?mode=h2h&seed=…` | Game in a given mode or seed | internal; challenge links use `/c/` |
| `/c/<id>` | Challenge landing | from a shared link |
| `/challenges` | Challenges inbox and outbox | |
| `/me` | Profile | name, level, XP, coins, stats, settings, recovery |
| `/top/<slug>` | Leaderboards for a game | today, all time, friends |
| `/daily` | Today's daily set | games with a shared daily seed |
| `/about`, `/privacy`, `/terms` | Static pages | |
| `/b/<brand>/<slug>/` | Branded minigame (P1) | same stage, different `skin.json` |

Games live on **subpaths of one origin** so they share one localStorage and one service worker.

### 3.2 Screens

**Home.** Top bar: logo, coins, avatar. Then a "Today" strip with the three daily games (Zamia trench, Toka daily, Kifuniko daily) showing done or not done. Then "Challenges waiting" if any. Then the game grid: one card per game with name, one-line rule, best score and a mode badge. At the bottom, "Your journey": the next untried stage, recommended by the shell.

**Game page.** A slim shell bar (back, game name, coins, menu with how to play, sound, assist mode, leaderboard) over the full-height stage. On desktop, a side rail shows the leaderboard and the live challenge (§9.2).

**Result sheet.** Slides up when a run finishes: score, personal best, today's rank, XP and coins earned, and four actions: **Play again**, **Challenge a friend**, **Share**, **Next stage**. In a challenge, it shows you vs them first.

**Challenge landing (`/c/<id>`).** "Wanjiru challenged you: 7 of 10 apples in Kata Tufaha. Can you beat it?" One button, **Accept and play**. No sign-up before play. After the run: the comparison, then **Send it back** (a rematch on a new seed) and a prompt to claim a name so the result counts.

**Challenges.** Waiting for you, waiting for them, finished. Each row shows the game, opponent, scores and age.

**Profile.** Name (claim or change), level and XP bar, coins, per-game bests, recovery code, export and import, settings (language, sound, haptics, reduced motion, assist mode).

**Leaderboards.** Tabs: Today, All time, Friends (anyone you have a challenge edge with). Assist-mode runs show on their own board.

---

## 4. The shell

The shell is the product. Games are stages that plug into it. It has six jobs.

| Job | What it does | MVP | P1 |
|---|---|---|---|
| Identity | anonymous player, claimed name, recovery | ✓ | phone or email link, Turnstile on claims |
| Runs | start and finish runs, seeds, input logs | ✓ | server replay verification |
| Progression | score per game, XP and coins on a server ledger | ✓ (earn only) | coin spending, cosmetics |
| Social | challenges, friends edges, leaderboards | ✓ | groups, group boards |
| Sharing | share sheet, links, text payloads, result cards | ✓ (static cards) | dynamic OG images |
| Telemetry | event stream for metrics and pre-registration | ✓ | dashboards |

### 4.1 Stage contract

Every game is a static folder at `/g/<slug>/` with an `index.html` that loads `/shell/chez.js`. The game declares itself, asks the shell to start a run, and reports the result. Everything else (result screen, sharing, progression, challenge comparison) is the shell's job, so games delete their own result overlays and share buttons.

```js
Chez.stage({
  id: 'kata-tufaha',
  version: '1.0.0',
  title: { en: 'Kata Tufaha', sw: 'Kata Tufaha' },
  rule:  { en: 'Throw knives through the gap to slice the apple.',
           sw: 'Rusha visu kupitia nafasi ukate tufaha.' },
  modes: ['solo', 'h2h', 'pass'],          // which modes this stage supports
  score: { order: 'desc', unit: 'apples', max: 10,
           format: s => `${s} of 10` },
  seeded: true,                            // all randomness comes from the run seed
  native: { id: 'kati', label: 'Kati mode' } // the Chezability native mode, if any (§8)
});

const run = await Chez.run.start({ mode, variant }); // { runId, seed, rng, mode, variant, challenge? }
run.input(code);           // optional: log an input at the current fixed-step tick
run.event('milestone', { key: 'tier', value: 'Gold' });
await run.finish({ score: 7, detail: { cuts: 7, throws: 10 } });  // shell shows the result sheet
```

Shell services exposed to stages:

| API | Purpose |
|---|---|
| `Chez.rng(seed)` | the one shared seeded RNG (xmur3 hash + mulberry32, already used in Zamia, Toka and Kifuniko) |
| `Chez.prefs` | `lang`, `sound`, `haptics`, `reducedMotion`, `assist` |
| `Chez.audio` | shared audio context with one mute switch |
| `Chez.haptic(ms)` | vibration that respects the preference |
| `Chez.t(key)` | translated strings |
| `Chez.ui.toast(text)` | short notice |
| `Chez.pause()` / `Chez.resume()` | shell tells the stage to pause (menu opened, tab hidden) |

**Determinism rule.** For a seeded stage, the same seed and the same input log must produce the same score on any device. That means a fixed-timestep simulation (Nyanya already runs at 1/120 s), no `Math.random()` in gameplay (cosmetic particles may use it), and no frame-rate-dependent physics. This is what makes fair challenges, ghosts and later server verification possible.

### 4.2 Identity

1. On first visit the shell creates a player ID (UUIDv4) and a device secret, stores them in localStorage under `chez:v1:player`, and registers them with the API. No sign-up before play.
2. A player can **claim a name** at any time: 3–16 characters, letters, numbers and underscores, unique, profanity-filtered (English, Swahili and Sheng list).
3. The shell shows a **recovery code** (12 characters, grouped in fours) once a name is claimed, and in the profile. Entering it on another device restores the player. Only a hash is stored on the server.
4. **Export / import:** a downloadable JSON of local state, as a fallback.
5. No phone numbers, emails, ages or real names are collected at MVP. That keeps personal data minimal under Kenya's Data Protection Act (§12.3).

### 4.3 Progression: score, XP and coins

Three layers, as decided earlier:

| Layer | Scope | Earned by | Spent on | Stored |
|---|---|---|---|---|
| **Score** | one game | playing that game | nothing | run records |
| **XP** | whole ecosystem | events (below) | never spent; drives levels and unlocks | server ledger |
| **Coins** | whole ecosystem | events (below), capped daily | P1: cosmetics, hints, retries, group banners | server ledger |

**Rules:** coins and XP are awarded **per event, not per score**, so a game with scores in the thousands doesn't out-earn one scored out of 10. The server is the only writer. Coins are **closed-loop**: never bought, never cashed out (§12.3).

| Event | XP | Coins | Cap |
|---|---|---|---|
| `run.finished` | 5 | 1 | 30 coins/day from runs |
| `run.personal_best` | 10 | 3 | 1 per game per day |
| `stage.first_play` (journey) | 25 | 10 | once per game |
| `daily.completed` | 15 | 5 | once per daily game per day |
| `h2h.played` | 5 | 2 | 10/day |
| `h2h.won` | 15 | 5 | 10/day |
| `challenge.accepted_by_new_player` (recruit) | 30 | 20 | 5/day |
| `native.played` (first Native-mode run per game) | 10 | 5 | once per game |
| `challenge.sent` | 2 | 0 | 10/day (no coins, so links aren't spammed for reward) |

**Levels:** level *n* needs `100 × n^1.5` total XP (rounded). Level 2 unlocks Native modes everywhere. Other levels unlock profile frames (P1).

### 4.4 Storage

| Key | Contents |
|---|---|
| `chez:v1:player` | player ID, device secret, name |
| `chez:v1:prefs` | language, sound, haptics, reduced motion, assist |
| `chez:v1:best:<slug>` | local best per game and mode (display only; server is authoritative) |
| `chez:v1:queue` | events and run results waiting to sync (offline play) |
| `chez:v1:level:<slug>` | level progress for level-based games (Toka, Kifuniko, Kata Ndimu) |

All prototypes currently use their own keys (`tufaha.best`, `zamia.daily.*` and so on). Migrate them on first shell load, then delete the old keys.

---

## 5. Modes

### 5.1 Solo

Play against the game. Runs record to personal bests and the all-time board. Solo runs use a fresh random seed unless the game is played as a daily.

### 5.2 Daily

One shared seed per game per day (Africa/Nairobi date), served by `/api/daily/<slug>`. Everyone plays the same board. MVP dailies: **Zamia** (already built around it), **Toka** and **Kifuniko** (one puzzle each, mid difficulty). The Today board ranks first attempts only; replays count for practice and personal bests.

### 5.3 Async head to head (challenge links)

This is the core growth loop.

1. Player A finishes a run. The result sheet offers **Challenge a friend**.
2. The shell creates a challenge: game, seed, variant, A's run ID and score. It returns a short link `chezable.com/c/<8-char id>`.
3. A shares it (§6). B opens it, sees A's score, and taps **Accept and play**. B plays the **same seed**, so the board, fly paths, course or trench are identical.
4. B's result sheet shows A vs B. B can **Send it back**, which creates a new challenge on a new seed with B as challenger.
5. Both players get a play-graph edge (§10.5), and both get `h2h.played`. The winner gets `h2h.won`.

Rules:

| Rule | Value |
|---|---|
| Attempts per challenger | 1 counted attempt (B can practise after, but only the first run counts) |
| Expiry | 7 days |
| Open challenges | a link can be accepted by many people; each is a separate pairing and appears on a mini-board on the challenge page |
| Ghosts | where a game logs inputs, B can watch A's run as a ghost (Nyanya first; P1 for others) |
| Ties | each game defines a tiebreak (§7) |

### 5.4 Pass the phone

Local head to head on one device, no network needed. Kept where the prototypes already support it or where it suits the game: Kata Nusu, Ruka Kapu, Kata Tufaha (Kati mode, §7.7). Results are recorded as one run per player name, with no XP for unclaimed guests.

---

## 6. Sharing

### 6.1 Mechanics

1. Use the **Web Share API** where available (`navigator.share({ text, url })`).
2. Otherwise show a share sheet: **WhatsApp** (`https://wa.me/?text=`), copy link, and native SMS (`sms:?&body=`). WhatsApp is the primary channel in Kenya and is always first.
3. Every share has a URL. Every challenge share has a `/c/` link.

### 6.2 Payloads

From the Chezability payload layer (P01–P09):

| Payload | Games | Example |
|---|---|---|
| P03 score / challenge card | all | "I sliced 7 of 10 apples in Kata Tufaha. Beat that: chezable.com/c/k7Fq2mZp" |
| P02 spoiler-free grid | Zamia, Toka daily, Kifuniko daily | `Zamia 3 Oct · 41 pts (Gold)` then `🟨🟨🦈` for dive fates, no layout spoilers |
| P04 tier badge | Nyanya (Bronze to Legend), Zamia | shown on the result card |
| P05 ghost | Nyanya (MVP), others P1 | "Race my ghost" link |
| P01 near-miss clip | Kata Nusu, Kata Tufaha, Ruka Kapu | P1: record the last 6 s of canvas with `MediaRecorder` and share as a video file |

### 6.3 Link previews

MVP: a static Open Graph image per game (1200×630, sticker style, game name, logo), plus a dynamic title and description (`Wanjiru challenged you: 7 of 10`). The Worker rewrites `<meta>` tags on `/c/<id>` so WhatsApp previews show the challenge. P1: render per-challenge images in the Worker.

---

## 7. The game catalogue

Each card covers the rule, modes, seeding, scoring, challenge comparison, the Chezability notation and score, the Native mode, and the integration work needed. Notation follows Chezability §2.1: `D-drive | V × U ⊕ M → S → P [O applied to C]`.

**Chezability score** is one point each for a non-borrowed V, U, M, S, O and C mechanic (Chezability §15). The launch threshold in the charter is ≥3, including C and O. **No Classic game passes it**, which is the honest diagnosis from Chezability §14. The MVP handles this by shipping each game's Classic version as the **baseline** and its Native mode as the **treatment** (§8, §11).

---

### 7.1 Kata Nusu (Cut it in half)

| Field | Spec |
|---|---|
| Slug | `kata-nusu` (renamed from "Cut it in half" to match the Swahili naming of the set; see §15) |
| Rule | Stop the sliding saw at exactly 50 cm. |
| Modes | solo, h2h, pass |
| Seed controls | saw start phase, per-round speed jitter |
| Score | total cm off across 3 cuts, lower is better (`order: 'asc'`) |
| Tiebreak | smallest single-cut error |
| Classic notation | `D01 | V02 × U01 → S03+S04 → P01+P03` |
| Classic score | 1 (S) |
| **Native mode: Bila Kuhesabu** ("without counting") | The dashed guide line is removed and the cm readout stays hidden until all three cuts are done. You judge the half by eye. Source: Igisoro, where masters never count openly. |
| Native notation | `D01 | V02 × U01+U10 ⊕ M44 → S03 → P03 [O05 on Igisoro]` |
| Native score (target) | 4 (U, M, O, C) |
| Integration work | seed the saw; drop the built-in menu, result and share UI; report 3 cut events; keep pass-the-phone names through the shell; Space/Enter to cut |

### 7.2 Nyanya Jetpack

| Field | Spec |
|---|---|
| Slug | `nyanya-jetpack` |
| Rule | Hold to fire the jetpack and keep the tomato off the spikes. |
| Modes | solo, daily (course of the day), h2h with ghost |
| Seed controls | course shape and mine layout (currently a fixed seed of 2207; make it the run seed) |
| Score | metres, higher is better; tier label (Bronze to Legend) as P04 |
| Tiebreak | none needed (metres to one decimal) |
| Classic notation | `D01+D05 | V03 × U01 ⊕ M82+M88 → S03+S04 → P04` |
| Classic score | 1–2 (S, weak O04) |
| **Native mode: Okoa** ("rescue") | When you crash, the shell offers a revive link. A friend who opens it plays a 10-second "catch" segment on your course: catching the falling tomato revives you, and you continue from the crash point. Source: kati, where catching the ball brings an eliminated player back. |
| Native notation | `D13+D07 | V03 × U01+U12 ⊕ M82+M95 → S13 → P05 [O10 on kati]` |
| Native score (target) | 4 (U, M, S, O, C) — the strongest network-effect mode in the set |
| Integration work | course from run seed; input log (press/release ticks) for ghosts; ghost rendering at 40% opacity; revive flow uses the challenge system with type `revive` |

### 7.3 Kata Ndimu

| Field | Spec |
|---|---|
| Slug | `kata-ndimu` |
| Rule | Swipe to cut the lemon and drain the pieces without flies into the glass. |
| Modes | solo (levels), h2h |
| Seed controls | fly start positions and wander paths (currently `Math.random`) |
| Score | lemons juiced, higher is better |
| Tiebreak | fewer total cuts |
| Classic notation | `D05+D01 | V05/V08 × U01 → S01 → P01` (M85-ish geometry, partial O12) |
| Classic score | 1 (partial M) |
| **Native mode: Panga Nzi** ("place the flies") | In a challenge, the sender places the flies before the lemon is cut, and their fly layout becomes the receiver's board. Source: Kiothi, where each player may redistribute one pit's seeds anywhere on the board, including the opponent's side, before play. |
| Native notation | `D01+D12 | V05+V06 × U01+U03 ⊕ M22 → S03 → P03 [O02+O07 on Kiothi]` |
| Native score (target) | 4 (U, M, O, C) |
| Integration work | fixed-timestep fly movement from run RNG; fly-placement editor screen for Native; challenge carries the fly layout instead of only a seed |

### 7.4 Zamia

| Field | Spec |
|---|---|
| Slug | `zamia` |
| Rule | Dive the wreck with rival divers, grab treasure, and get back before the air or Papa the shark runs out your luck. |
| Modes | daily (primary), solo practice, h2h (same trench) |
| Seed controls | already fully seeded: layout, mimics, events, your dice, each rival's dice |
| Score | points banked over 3 dives, higher is better; tier ladder (Bronze 0, Silver 15, Gold 30, Platinum 45, Legend 60) |
| Tiebreak | fewer treasures fed to Papa |
| Share | P02 grid: one emoji per dive (🟨 back safe, 🦈 bitten, 💨 out of air) plus points and tier |
| Classic notation | `D01+D02 | V12 × U13+U03 ⊕ M39 → S07+S08 → P03 [O04, O15]` |
| Classic score | 2 (S, O04) |
| **Native mode: Kiothi seeding** | Before dive 1, you may move one tile anywhere in the trench. Lifting a gold tile shallow makes a safer grab, but rivals can take it too. Source: Kiothi's free pre-game redistribution. |
| Native notation | `D01+D02 | V12+V06 × U13+U03+U06 ⊕ M39+M22 → S07+S08 → P02 [O04 on Kiothi]` |
| Native score (target) | 3 (M, O, C) |
| Integration work | daily seed from API instead of the local date; dive summaries as run events; P02 grid generator; rival AI unchanged |

### 7.5 Toka

| Field | Spec |
|---|---|
| Slug | `toka` |
| Rule | Tap arrows to slide them off the board, without letting one hit another. |
| Modes | solo (endless levels), daily (one puzzle), h2h (same level, race) |
| Seed controls | level generator (already seeded by level number; daily uses the daily seed) |
| Score | levels: highest level reached; daily and h2h: bumps (fewer is better), then time |
| Tiebreak | time to clear |
| Classic notation | `D01+D08 | V01 × U02 → S01+S08 → P03` |
| Classic score | 1 (generator with guaranteed solvability, O04 weak) |
| **Native mode: Giuthi arrows** | Some arrows are marked with a double head. When blocked, they don't cost a heart: they reverse and travel the other way, and if blocked again, they stop where they are. Planning the reversal is the puzzle. Source: Giuthi, where sowing reverses direction when the last seed lands in an occupied pit. |
| Native notation | `D08+D01 | V01 × U02+U06 ⊕ M61 → S08 → P02 [O08 on Giuthi]` |
| Native score (target) | 3 (M, O, C) |
| Integration work | keyboard play (arrow keys move a focus ring between arrows, Enter taps); flash rate of the bump animation reduced to ≤3 per second (§9.4); generator must still prove solvability with reversing arrows (extend the reverse-placement proof) |

### 7.6 Kifuniko

| Field | Spec |
|---|---|
| Slug | `kifuniko` |
| Rule | Slide the caps until the gold cap drops down the chute into the glass. |
| Modes | solo (levels), daily, h2h (same puzzle) |
| Seed controls | puzzle generator (already seeded; par from a breadth-first solver) |
| Score | moves (fewer is better); stars against par |
| Tiebreak | time |
| Classic notation | `D01 | V01/V06 × U02 → S01 → P03` (sliding-tile family; add to Chezability v0.2) |
| Classic score | 0–1 |
| **Native mode: Maji ya Shisima** ("Shisima's water") | On odd-sized boards, the gold cap must pass through the centre cell before it may exit. Source: Shisima, where a winning line must run through the centre, the "water". |
| Native notation | `D01 | V01 × U02 ⊕ M32-style constraint → S08 → P02 [O11 on Shisima]` |
| Native score (target) | 3 (U via new solution space, O, C) |
| Integration work | solver state gains a "visited centre" bit; keyboard play (arrows move focus, Enter slides); this game is also the **branded minigame template** (§12.1) |

### 7.7 Kata Tufaha

| Field | Spec |
|---|---|
| Slug | `kata-tufaha` |
| Rule | Throw knives through the gap in the spinning spiked ring to slice the apple. |
| Modes | solo, h2h, pass (Kati mode) |
| Seed controls | ring start angle, direction, speed wobble and reversal timing |
| Score | apples sliced out of 10, higher is better |
| Tiebreak | total time |
| Classic notation | `D01+D05 | V02 × U01 ⊕ E20 → S03 → P03` |
| Classic score | 0–1 |
| **Native mode: Kati** | Two players, one phone. One thumb throws. The other player holds the ring side of the screen and controls the ring's rotation, trying to block every knife. Then they swap. Source: kati, the Kenyan dodgeball game with asymmetric throwers and dodgers. |
| Native notation | `D01+D12+D13 | V02+V09-style drag × U01+U03 ⊕ M06+M31 → S04+S11 → P01 [O02 on kati]` |
| Native score (target) | 4 (U, M, S, O, C — the obstacle becomes a player) |
| Integration work | fixed-timestep ring physics; seeded wobble and reversals; split-screen input zones for Kati mode; Space to throw |

### 7.8 Ruka Kapu

| Field | Spec |
|---|---|
| Slug | `ruka-kapu` |
| Rule | Tap when the power bar is right to shoot into the hoops; higher hoops score more. |
| Modes | solo, h2h, pass |
| Seed controls | P1: seeded wind per run (the current physics is fully deterministic, so all runs share the same windows) |
| Score | points over 5 balls (D 25, C 50, B 100, A 150, SSS 200, swish +50%) |
| Tiebreak | more swishes |
| Classic notation | `D01+D02 | V02 × U01+U05 ⊕ M26+M30 ⊕ E20 → S03 → P03` |
| Classic score | 1 (U05 output randomness from rim physics is native) |
| **Native mode: Niko!** | Before each shot, you may call a hoop. A called hit scores double. A called miss scores zero. You don't have to call. Source: Kadi's "Niko Kadi!", the declaration you must make before you are allowed to win. |
| Native notation | `D01+D02 | V02+V17 × U01+U13 ⊕ M79+M26 → S03 → P07 [O11 on Kadi]` |
| Native score (target) | 4 (V, U, M, O, C) |
| Integration work | fixed timestep (already substepped; make the step size constant); call UI as five hoop chips above the bar; character stays original (no real players) |

---

### 7.9 Recommended addition: Shisima Daily

This is not yet built. It is the cheapest game that passes the charter as a Classic game, so it gives the experiment a native control. It comes from Chezability seed S-7.

| Field | Spec |
|---|---|
| Slug | `shisima` |
| Rule | Move your three water bugs to make a line through the centre. |
| Modes | h2h async move by move (correspondence play through the challenge link), solo vs AI, pass |
| Seed | daily starting asymmetry (one piece pre-advanced) |
| Notation | `D01 | V06 × U03 ⊕ M57+M32+M38 → S03+S08 → P03 [O04, O10 on Shisima]` |
| Score | 3–4 at launch (M, S, O, C) |
| Build cost | low: a 9-point board, a minimax AI (the game tree is tiny), and a turn-based challenge type |

Recommendation: add it as the ninth game if the build plan has room in week 3 (§13).

---

## 8. Chezability in the product

### 8.1 What ships

1. **The notation line** for every game, stored in `stage.meta.notation` and shown on the game's "How it's made" card (an optional section in the how-to-play sheet). It makes the design method visible, which fits Kongo Kega's habit of publishing the work.
2. **Classic and Native variants.** Each game has `variant: 'classic' | 'native'`. Native unlocks at player level 2, but the first 20% of new players are assigned Native as their default for the experiment (§11.2).
3. **Chezability score** per variant, stored in the stage manifest and used in internal reports.
4. **Pre-registration per game**, written before the public launch (§11.3).

### 8.2 Charter checklist per stage

Copied into each game's `README.md` and checked in review:

| Charter item | Check |
|---|---|
| 1. Declare the stack | notation in manifest |
| 2. Two-plus uncertainties | count of U sources in notation ≥ 2 (Native) |
| 3. First atom in 10 s | measured TTFF < 3 s, first-atom close < 10 s |
| 4. Feel first | game-space parameters exposed in one config object |
| 5. One real operator | Native has an O01–O14 |
| 6. One cultural mechanic | Native uses a §13 primitive, with source named |
| 7. Social frame by design | at least one NE frame (S03, S13, S04+S11) |
| 8. Payload designed in | named P and implemented share path |
| 9. Rules in one sentence | `rule` field ≤ 120 characters |
| 10. Pre-register | block written and dated |

### 8.3 Game-space config

Chezability F13 says tuning *is* design for one-touch games. Every stage exposes its tunables in one object, read at start, so variants are data rather than code:

```js
const TUNE = { gravity: 2.3, thrust: 4.9, gapStart: 0.66, gapMin: 0.34, mineFrom: 290 }; // Nyanya example
```

The shell can override tunables from `/api/tune/<slug>` (P1), which allows small A/B tests without redeploying.

---

## 9. Responsive, accessible, inclusive

### 9.1 Device targets

| Class | Viewport | Priority | Test devices |
|---|---|---|---|
| Phone | 360–430 px wide, portrait | primary | a mid-range Android (e.g. Tecno or Samsung A-series), an iPhone SE-size screen |
| Tablet | 768–1024 px, both orientations | secondary | an Android tablet, an iPad |
| Desktop | ≥1024 px | secondary | Chrome, Firefox and Safari on a laptop |

### 9.2 Layout rules

1. **Stage first.** On every size, the stage takes all height between the shell bar and the bottom safe area.
2. **Logical resolution.** Canvas games render to a fixed logical size (Ruka Kapu uses 400×700) and scale to fit, with letterboxing filled by the game's background. Migrate the other canvas games to the same pattern.
3. **Phone:** shell bar 52 px, result sheet as a bottom sheet.
4. **Tablet landscape and desktop:** stage max-width 560 px, centred, with a 320 px side rail for the leaderboard and live challenge. The result sheet becomes a centred card.
5. **Safe areas:** `viewport-fit=cover`, padding from `env(safe-area-inset-*)`, as in the prototypes.
6. **No horizontal scroll** anywhere. Wide content scrolls inside its own container.
7. **Orientation:** games are portrait. On a phone in landscape, show the stage at full height with side rails rather than a "rotate your device" block.

### 9.3 Input

| Input | Rule |
|---|---|
| Touch | pointer events, `touch-action` set per game, no double-tap zoom, 44 px minimum targets |
| Mouse | same as touch; hover states on shell controls only |
| Keyboard | every game playable: Space/Enter for the primary action, arrows for focus-and-select games (Toka, Kifuniko, Zamia choices), Esc for the menu |
| Switch / single-button | one-touch games (Kata Nusu, Nyanya, Kata Tufaha, Ruka Kapu) already work with one button; keep it that way |

### 9.4 Accessibility (target: WCAG 2.2 AA for the shell)

| Area | Requirement |
|---|---|
| Contrast | text ≥ 4.5:1, large text and UI ≥ 3:1; use `--chez-blue-ink` for blue text |
| Focus | visible 3 px `--tape` focus ring on every control |
| Screen readers | shell is fully labelled; each stage has an `aria-label` describing the goal and an `aria-live` region announcing scores, lives, turns and results |
| Motion | respect `prefers-reduced-motion` (shake, pop-ins and camera bumps off; prototypes already do this in part) |
| Flashing | nothing flashes more than 3 times per second (Toka's red bump flash currently toggles every 120 ms, so it needs fixing) |
| Colour | never the only signal: Zamia uses tile shapes, Toka pairs the red flash with a heart loss and shake, Kifuniko's gold cap has a star |
| Sound | every sound has a visual equivalent; one global mute; haptics toggle |
| Text size | shell supports 200% zoom without loss; canvas text scales with the stage |
| Time pressure | **Assist mode** for timing games: 0.7× speed for saws, rings, bars and courses. Assist runs go to a separate board and are labelled, so nobody is excluded and leaderboards stay fair |
| Cognitive | one-sentence rule on every card, a 3-step illustrated how-to-play, and the first run always starts easy (charter item 3) |

### 9.5 Performance and data

Players in Kenya often pay per megabyte, and many use mid-range Android phones.

| Budget | Target |
|---|---|
| Shell JS (gzipped) | ≤ 40 KB |
| Each game (gzipped, excluding fonts) | ≤ 120 KB |
| Fonts | two subset WOFF2 files, ≤ 60 KB total |
| First load of home on 4G | ≤ 2.5 s LCP on a mid-range Android |
| Game start after tap | ≤ 1 s from cache |
| Offline | solo and pass-the-phone play fully offline after first visit; events queue and sync later |

PWA: manifest (name, icons from the figure mark, theme colour `#5271FF`), a service worker that precaches the shell and caches each game on first open.

### 9.6 Language

English and Swahili at launch, with a toggle in the profile and on the home screen. Strings live in `packages/i18n/{en,sw}.json`. Game names stay Swahili in both languages.

| Key | en | sw |
|---|---|---|
| `play` | Play | Cheza |
| `play_again` | Play again | Cheza tena |
| `challenge` | Challenge a friend | Mpe rafiki changamoto |
| `share` | Share | Shiriki |
| `score` | Score | Alama |
| `best` | Your best | Bora yako |
| `today` | Today | Leo |
| `coins` | Coins | Sarafu |
| `leaderboard` | Standings | Msimamo |
| `next_stage` | Next stage | Hatua inayofuata |

Have a native Swahili speaker review every string before launch. Sheng variants can come later as a third locale.

---

## 10. Technical architecture

### 10.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Hosting | Cloudflare Pages | static, global, free tier, already in use |
| API | Cloudflare Workers (TypeScript) | runs next to Pages, cheap |
| Database | Cloudflare D1 (SQLite) | ledger, runs, challenges, graph edges |
| Cache / rate limits | Workers KV | daily seeds, rate-limit counters |
| Analytics | Workers Analytics Engine, or events in D1 at MVP scale | no third-party trackers |
| Bot protection | Cloudflare Turnstile on name claim (P1) | |
| Front end | vanilla JS/TS + Vite for the shell; games stay framework-free single folders | prototypes are already vanilla canvas |
| Domain | chezable.com (registered at OwnRegistrar, expires 2027-09-21) with DNS on Cloudflare | renew before expiry |

### 10.2 Repository layout

```
chezable/
  apps/
    web/                 # shell: home, profile, challenges, leaderboards (Vite)
      public/g/<slug>/   # each game as a static folder
    worker/              # API (Wrangler)
  packages/
    chez-sdk/            # chez.js: stage contract, run lifecycle, rng, prefs, audio, share
    ui/                  # tokens.css, components (buttons, cards, plank, sheets)
    i18n/                # en.json, sw.json
    rng/                 # xmur3 + mulberry32, shared by games and worker (for P1 replays)
  games/
    <slug>/              # source of each game; builds into apps/web/public/g/<slug>/
      index.html
      game.js
      stage.json         # manifest: id, title, rule, modes, scoring, notation, chezability score, tunables
      README.md          # charter checklist + pre-registration block
  docs/
    chezability.md
    build-spec.md        # this file
```

### 10.3 API

All endpoints are under `/api`, JSON only, and authenticated with the player ID and device secret (an HMAC header) except public reads.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/player` | create an anonymous player |
| POST | `/api/player/name` | claim or change a name |
| POST | `/api/player/recover` | restore from a recovery code |
| GET | `/api/me` | profile, XP, coins, level, bests |
| GET | `/api/daily/:slug` | today's seed (Africa/Nairobi date) |
| POST | `/api/run/start` | issue `runId`, seed (or challenge seed), server start time |
| POST | `/api/run/finish` | submit score, detail, input-log hash; returns XP, coins, rank, PB flag |
| POST | `/api/challenge` | create a challenge from a finished run |
| GET | `/api/challenge/:id` | public challenge info for the landing page |
| GET | `/api/challenges` | my inbox and outbox |
| GET | `/api/top/:slug?board=today\|all\|friends` | leaderboard |
| POST | `/api/events` | batched telemetry events |
| GET | `/c/:id` | HTML landing (Worker rewrites Open Graph tags) |

### 10.4 D1 schema (MVP)

```sql
CREATE TABLE players (
  id TEXT PRIMARY KEY, handle TEXT UNIQUE, secret_hash TEXT NOT NULL,
  recovery_hash TEXT, lang TEXT DEFAULT 'en',
  xp INTEGER DEFAULT 0, coins INTEGER DEFAULT 0, level INTEGER DEFAULT 1,
  variant_cohort TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, game TEXT NOT NULL,
  mode TEXT NOT NULL, variant TEXT NOT NULL, seed TEXT NOT NULL,
  score REAL, detail TEXT, input_hash TEXT, assist INTEGER DEFAULT 0,
  challenge_id TEXT, started_at INTEGER NOT NULL, finished_at INTEGER,
  verified INTEGER DEFAULT 0
);
CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL,
  event TEXT NOT NULL, game TEXT, ref TEXT,
  xp_delta INTEGER NOT NULL, coin_delta INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE challenges (
  id TEXT PRIMARY KEY, kind TEXT DEFAULT 'beat',        -- beat | revive | turn (Shisima)
  game TEXT NOT NULL, variant TEXT NOT NULL, seed TEXT NOT NULL, payload TEXT,
  creator_id TEXT NOT NULL, creator_run_id TEXT NOT NULL, creator_score REAL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE challenge_entries (
  challenge_id TEXT NOT NULL, player_id TEXT NOT NULL, run_id TEXT NOT NULL,
  score REAL, result TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, player_id)
);
CREATE TABLE edges (                 -- the play graph
  a_id TEXT NOT NULL, b_id TEXT NOT NULL, game TEXT NOT NULL,
  kind TEXT NOT NULL,                -- challenged | beat | lost_to | revived | recruited
  count INTEGER DEFAULT 1, last_at INTEGER NOT NULL,
  PRIMARY KEY (a_id, b_id, game, kind)
);
CREATE TABLE daily_seeds (game TEXT NOT NULL, day TEXT NOT NULL, seed TEXT NOT NULL,
  PRIMARY KEY (game, day));
CREATE TABLE events (                -- telemetry (move to Analytics Engine when volume grows)
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, session_id TEXT,
  name TEXT NOT NULL, game TEXT, props TEXT, ts INTEGER NOT NULL
);
CREATE INDEX runs_board ON runs (game, mode, variant, assist, score);
CREATE INDEX ledger_player ON ledger (player_id, created_at);
```

P1 adds `groups`, `group_members` and `cosmetics`.

### 10.5 The play graph

Every challenge writes edges: `challenged` (A to B), then `beat` or `lost_to` after B plays, `recruited` if B was new, and `revived` for Nyanya's Okoa mode. The Friends board is everyone with any edge to you. Groups (P1) become nodes with `member_of` edges. This table is the seed of the long-term asset: who plays with whom, what, and how often.

### 10.6 Fair play

HTML5 scores are easy to fake, so trust is layered:

| Tier | Mechanism | When |
|---|---|---|
| T0 | runs only finish with a valid `runId`; minimum and maximum duration per game; score bounds per game (e.g. Kata Tufaha ≤ 10); per-player rate limits | MVP |
| T1 | the client sends an input log; the Worker replays deterministic games headlessly using the shared `rng` and stage simulation, and marks the run verified | P1, for top-10 runs and challenge wins |
| T2 | leaderboards show only verified runs in the top 10 | P1 |

Because coins have no cash value (§12.3), the cost of cheating stays low at MVP.

### 10.7 Environments and deploy

`main` deploys to production. Pull requests get Pages preview URLs and a D1 preview database. Migrations live in `apps/worker/migrations`. Wrangler secrets hold the HMAC key. Backups use D1's time travel plus a weekly export to R2.

---

## 11. Measurement and pre-registration

### 11.1 Telemetry events

| Event | Fired when | Used for |
|---|---|---|
| `session.start` | shell loads | sessions, D2 return |
| `stage.open` | game page opens | funnel |
| `run.start` | run starts | |
| `run.first_input` | first player input | TTFF |
| `run.first_atom` | stage-defined first learned action (e.g. first successful cut) | first-atom close |
| `run.finish` | run ends | replay rate, scores |
| `result.view` | result sheet shown | |
| `share.tap` / `share.done` | share opened / completed | share rate |
| `challenge.create` / `.open` / `.accept` / `.complete` / `.send_back` | challenge lifecycle | the core loop |
| `name.claim` | name claimed | conversion |
| `native.enable` | Native mode chosen | |
| `assist.enable` | Assist mode on | inclusion |

No personal data in properties. Session IDs rotate daily.

### 11.2 Metrics (from Chezability §17)

| Metric | Definition | Starting target |
|---|---|---|
| TTFF | `run.first_input` minus `stage.open` | < 3 s |
| First-atom close | `run.first_atom` minus `run.start` | < 10 s |
| Session replay | sessions with ≥ 2 runs of the same game | > 50% |
| D2 return | players with a session on day 2 | baseline first |
| Challenge-send rate | finished runs that create a challenge | baseline first |
| Challenge accept rate | challenge opens that start a run | baseline first |
| Return-challenge rate | completed challenges that are sent back | baseline first |
| Stages per player (7 days) | distinct games played | baseline first |
| Ladder spread | score distribution shows ≥ 3 clusters | proxy for depth |

**Cohorts:** new players are randomly assigned at creation: 80% Classic-default, 20% Native-default (`players.variant_cohort`). Everyone can switch. Analysis compares first-assigned variant.

### 11.3 Pre-registration (write and date before public launch)

```
Experiment:          Chezable MVP — Classic (borrowed) vs Native (Chezability) variants
Hypothesis H1:       Native variants have a higher session-replay rate than Classic, pooled across games
Hypothesis H2:       Native variants have a higher challenge-send rate than Classic
Hypothesis H3:       Nyanya Okoa (rescue) produces more new-player recruits per crash than Nyanya Classic challenges
Falsifier:           Native ≤ Classic on H1 and H2 after the sample below → the charter's claim fails for this set
Comparison:          Classic variant of the same game
Sample / window:     first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:            difference in proportions with 95% interval; per-game results reported, pooled result primary
Result:              published on Kongo Kega, win or loss
```

Each game also gets its own block in `games/<slug>/README.md`, using the template in Chezability §17.

---

## 12. Monetisation hooks and compliance

### 12.1 Branded minigame pipeline

The first paid unit is the **branded minigame**: the same stage with a brand skin. Kifuniko is the template because its whole look is three swappable parts: the plain pieces, the special piece and what fills the glass.

```json
// games/kifuniko/skins/duka-bee.json
{
  "brand": "Duka Bee",
  "palette": { "frame": "#F2B632", "piece": "#1B1D1E", "special": "#F26B1D", "drink": "#FFD21F" },
  "specialIcon": "bee.svg",
  "copy": { "title": "Duka Bee Drop", "win": "Your duka is live!" },
  "cta": { "label": "Build your duka", "url": "https://taskbee.co.ke" },
  "logoPlacement": "result-sheet-only"
}
```

Routes: `/b/<brand>/<slug>/`. Branded runs are tagged with the brand in `runs.detail` so a sponsor report is a single query. Duka Bee is the friendly first skin, to test the pipeline before selling it. Later, Kiwanda's brand grammar emits `skin.json` files directly.

### 12.2 Later units (not MVP)

Sponsored rounds (a daily with a sponsor's name and a closed-loop prize), event packages with the live wall, and cosmetic coin spends.

### 12.3 Compliance flags

These are flags to check, not legal advice. Have a Kenyan lawyer review before money or prizes touch the product.

| Area | Position at MVP |
|---|---|
| Coins | closed-loop only: earned in play, never purchasable, never redeemable for money or goods. Buying or cashing out coins could bring them under gambling or stored-value rules. |
| Prize rounds | any sponsor-funded prize competition may need a promotion permit or betting-control review; none at MVP |
| Personal data | the Data Protection Act, 2019 applies. MVP collects only a chosen name and gameplay data. Publish a privacy notice, and check whether registration with the Office of the Data Protection Commissioner is required. |
| Children | many players will be under 18. Collect no age, no contact details and no location. No chat. Names pass a profanity filter. |
| IP | no real people or trademarks in games (Ruka Kapu uses an original player; Kifuniko is unbranded; Zamia is an original name and theme, inspired by a published board game's mechanics but sharing none of its name, art or text) |

---

## 13. Build plan

A four-week plan for one builder with AI assistance. Cut scope before extending time.

### 13.1 Milestones

| Week | Milestone | Done when |
|---|---|---|
| 1 | **Foundation** | repo, Pages + Worker + D1 deployed on chezable.com; tokens and UI package; `chez-sdk` with stage contract, rng and prefs; home and game page chrome; **Kata Tufaha** integrated as the reference stage (solo only) |
| 2 | **Identity, runs, sharing** | anonymous players, name claim, recovery code; run start/finish and the ledger; result sheet; share sheet with WhatsApp; leaderboards (today, all time); **Kata Nusu, Nyanya, Ruka Kapu, Kifuniko** integrated |
| 3 | **Challenges and dailies** | challenge links end to end with landing page, OG rewrite and send-back; friends board and graph edges; daily seeds; **Zamia, Toka, Kata Ndimu** integrated; PWA offline; Shisima Daily if time allows |
| 4 | **Native, access, launch** | Native modes for at least 4 games (priority: Nyanya Okoa, Kata Tufaha Kati, Ruka Kapu Niko!, Kata Nusu Bila Kuhesabu); Assist mode; keyboard play everywhere; Swahili strings reviewed; telemetry verified; pre-registration dated; soft launch to friends and WhatsApp groups |

The remaining four Native modes ship in the two weeks after launch, staggered so each can be measured.

### 13.2 Per-game integration checklist

For every game:

1. Move gameplay randomness to `run.rng`; keep `Math.random` for cosmetic particles only.
2. Switch to a fixed-timestep simulation.
3. Remove the game's own menu, best-score, result and share UI; call `Chez.run.finish`.
4. Use shared tokens and the shell's audio and haptics.
5. Add keyboard play and `aria-live` announcements.
6. Respect `prefers-reduced-motion` and the Assist-mode speed factor.
7. Write `stage.json` (notation, Chezability score, tunables) and `README.md` (charter checklist, pre-registration).
8. Test on a mid-range Android, an iPhone, a tablet and a desktop browser.

### 13.3 Launch checklist

| # | Check |
|---|---|
| 1 | All eight games playable in solo, and in h2h via a challenge link, on a mid-range Android over 4G |
| 2 | Challenge loop works for a brand-new player who arrives from WhatsApp, with no sign-up before play |
| 3 | XP and coins credit correctly, daily caps hold, and nothing can be bought |
| 4 | Lighthouse accessibility ≥ 95 on shell pages; keyboard-only run of every game; screen reader announces results |
| 5 | No flashing above 3 per second; reduced motion respected |
| 6 | Performance budgets in §9.5 met |
| 7 | Offline solo play works after the first visit |
| 8 | English and Swahili strings complete and reviewed |
| 9 | Privacy notice and terms published; coin rules stated plainly |
| 10 | Telemetry events arriving; pre-registration dated and saved in the repo |
| 11 | Logo vectorised; app icon and OG images produced |
| 12 | chezable.com renewal date diarised |

---

## 14. Hooks for later

| Later feature | Hook in the MVP |
|---|---|
| Groups ("Block C vs Block D") | `edges` table; group nodes slot in as `member_of` |
| Real-time multiplayer | deterministic stages + input logs make lockstep netcode possible |
| AR / camera play | stage contract is input-agnostic; a camera input adapter (MediaPipe in the browser) can drive any one-touch game |
| Facebook Instant Games | platform calls sit behind `chez-sdk`; an FBInstant adapter can wrap the same stage |
| TikTok effects as marketing | each one-touch game has an effect-sized core (10 s) that can be rebuilt in Effect House, ending on "play the full game at chezable.com" |
| Live wall (DOBANESS) | the event stream can feed a room screen showing live runs and challenges |
| Play-activity discovery (the original Chezable idea) | the play graph and the stage catalogue are the first index; physical and whiteboard games can be added as non-digital "stages" with the same metadata |

---

## 15. Open decisions

| # | Decision | Default if undecided |
|---|---|---|
| 1 | Rename "Cut it in half" to **Kata Nusu** | yes, for a consistent Swahili set |
| 2 | Add **Shisima Daily** as the ninth game in week 3 | yes if weeks 1–2 land on time |
| 3 | Which games get dailies at launch | Zamia, Toka, Kifuniko |
| 4 | Groups in MVP or P1 | P1 |
| 5 | Coin spending in MVP or P1 | P1 (ledger and display only at MVP) |
| 6 | Sound on or off by default | on, with a visible mute; remember the choice |
| 7 | Native cohort size | 20% of new players |
| 8 | Swahili reviewer | to be named |
| 9 | Analytics store | D1 at MVP, Analytics Engine once events pass ~1M/month |

---

## Appendix A. Prototype references

The prototypes built in this cycle (claude.ai artifacts, private to the owner until shared). Each is a single self-contained HTML file and the starting point for its stage.

| Game | Prototype |
|---|---|
| Kata Nusu (Cut it in half) | https://claude.ai/artifact/TzWE7YpNhi6vDGojWKxcA3 |
| Nyanya Jetpack | https://claude.ai/artifact/XemFykEKaqgSySUC3j2gwP |
| Kata Ndimu | https://claude.ai/artifact/UoPWGEHcTzX3q4nzLJWjoh |
| Zamia | https://claude.ai/artifact/RFJzZLrLuhSxTJMnLsdaS4 |
| Toka | https://claude.ai/artifact/1zRDhwn5TvCdHU4mHrKnNK |
| Kifuniko | https://claude.ai/artifact/7y9utc7Aqhy1sEwgL5BtpL |
| Kata Tufaha | https://claude.ai/artifact/VkfMbgnjK2SLE8WrXDrEji |
| Ruka Kapu | https://claude.ai/artifact/MboCf4gp5xUszzEAcP6d41 |

## Appendix B. Known prototype gaps

| Game | Gap to fix during integration |
|---|---|
| Kata Nusu | saw phase uses `Math.random`; pass-the-phone names are local only |
| Nyanya Jetpack | course seed is hard-coded; no input log; no ghost |
| Kata Ndimu | fly movement uses `Math.random` and variable `dt` |
| Zamia | daily seed from the device's local date (move to the API); long sessions need a resume-after-reload state |
| Toka | no keyboard play; bump flash rate too high; hints don't consider reversing arrows |
| Kifuniko | no keyboard play; solver time grows on 5×5 two-empty boards (cap search or precompute) |
| Kata Tufaha | ring wobble and reversals use `Math.random`; variable `dt` |
| Ruka Kapu | physics substeps depend on frame `dt`; no seeded variation, so every run has identical windows |

## Appendix C. Stage manifest example

```json
{
  "id": "ruka-kapu",
  "version": "1.0.0",
  "title": { "en": "Ruka Kapu", "sw": "Ruka Kapu" },
  "rule": { "en": "Tap when the power bar is right; higher hoops score more.",
            "sw": "Gusa nguvu ikiwa sawa; vikapu vya juu vina alama zaidi." },
  "modes": ["solo", "h2h", "pass"],
  "score": { "order": "desc", "unit": "points", "min": 0, "max": 1500 },
  "duration": { "minMs": 6000, "maxMs": 180000 },
  "seeded": true,
  "variants": {
    "classic": { "notation": "D01+D02 | V02 × U01+U05 ⊕ M26+M30 ⊕ E20 → S03 → P03", "chezability": 1 },
    "native":  { "id": "niko", "label": { "en": "Niko!", "sw": "Niko!" },
                 "notation": "D01+D02 | V02+V17 × U01+U13 ⊕ M79+M26 → S03 → P07 [O11 on Kadi]",
                 "chezability": 4, "source": "Kadi: declaring 'Niko Kadi!' before the winning move" }
  },
  "tunables": { "gravity": 900, "theta": 75, "barSpeed": 0.62, "barSpeedStep": 0.09, "balls": 5 },
  "share": { "payload": "P03", "template": { "en": "I scored {score} in Ruka Kapu. Five balls, beat me:" } }
}
```

Swahili strings in this appendix are drafts for the reviewer in §15.
