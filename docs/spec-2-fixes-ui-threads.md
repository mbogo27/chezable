# Chezable MVP spec: fixes, new UI, and game threads

Version 1 · October 2026 · Owner: Mbogo

This spec covers four things for chezable.com: fixing the bugs on the current end screen, moving the whole site to the new clean UI, rebuilding the main screens, and adding game threads built from the four games already on the site. **No new games are added in this spec.**

Adapt everything to the existing stack and file structure. Where this spec names an endpoint, a function or a file, treat the name as a suggestion and use whatever fits the codebase.

## 0. Scope

**In scope**

- Fix the slow end screen and the broken "Share challenge" link.
- One shared header on every page, including in-game.
- A design system (tokens) for the new look, applied site-wide.
- Rebuilt screens: Home, Game start, End screen, Thread intro, Turn card, Thread receipt. Standings gets restyled only.
- Real image icons (SVG/WebP) for the four games.
- Name claim on the end screen and thread receipt.
- A game result contract so the shell, not each game, renders end screens.
- Game threads using the current four games: a Daily thread (ranked) and an Anytime thread (unranked).

**Current games (the only games threads may use)**

| Game | Type | Existing slug | Card color |
|---|---|---|---|
| Nyanya jetpack | Reflex / avoid | use existing | `#FF9E80` |
| Cut in half | Timing | use existing | `#FFD54A` |
| Kifuniko | Puzzle | `cap` (`/g/cap`) | `#8ED8CC` |
| Arrow puzzle | Puzzle | use existing | `#BDB0FF` |

**Out of scope (do not build now)**

New games (Sheng game, nganya puzzle, returning older games), learning threads (Sheng 101 exists only as a prototype), coin-bought hints, ask-a-friend help, relay/duel/chama/story/sponsored threads, the play-time leaderboard, a multi-day path map, dark mode, reaction cam, and the media kit.

**References**

- UI mockup (Home, Game start, End screen): https://claude.ai/artifact/4AtHxwSjyZ5fvhGd8sD2AD
- Thread flow prototype (HUD, turn card, receipt patterns; its word content is not part of this spec): https://claude.ai/artifact/Rd1kSSR2kFQqtJqyLPtv7U

Both are private to Mbogo until he shares them. If the agent can't open them, this spec is complete without them.

---

## 1. Bug fixes

### 1.1 End screen takes too long to appear

**Problem.** After a game ends there is a visible delay before the end screen shows. The likely cause is that the end screen waits for network calls (score submission, weekly rank, XP/coins) before rendering. Confirm this in the code before fixing.

**Fix.** Render the end screen immediately from the local result, then fill in server data when it arrives.

1. When the game ends, it hands its result to the shell (see section 4). The shell renders the end screen from that result straight away: moves or score, stars, "best possible", and the new-best flag computed from the locally stored best.
2. Fire the result submission in the background.
3. Fields that depend on the server (weekly rank, "#1 this week", confirmed coin balance) show a quiet placeholder (a grey pill of the same size) and fill in when the response arrives.
4. If the response takes more than 5 seconds or fails, hide the rank line and keep everything else. Queue the submission for retry on the next page load.
5. Never block the end screen on audio, confetti, images or fonts. Start celebration effects after the screen is drawn.
6. While the end screen is showing, preload the assets of the game in the "Next" card so the next tap starts instantly.

**Acceptance**

- [ ] End screen is visible within 150 ms of the game ending on a mid-range Android phone, with the network throttled to "Slow 4G".
- [ ] With the network off, the end screen still shows the result, stars and CTAs; only the rank line is missing.
- [ ] Log `end_screen_render_ms` (game end to first paint) for every play.

### 1.2 "Share challenge" stuck on "making your challenge link"

**Problem.** Tapping "Share challenge" shows "making your challenge link" and never produces a link, even after several taps. The likely cause is a request that hangs or fails silently with no timeout or error state. A second likely cause on Android Chrome: if the code awaits a slow network call before calling `navigator.share()`, the tap's user-activation expires and the share sheet is refused.

**Fix.** Make the link without waiting for the server.

1. Generate the challenge code on the client when the game ends, before the player taps anything:
   `code = <gameSlug>-<seed>-<score>-<6 random base36 chars>`
   URL: `https://chezable.com/c/<code>`
2. Register the challenge with the server in the background using an idempotent upsert keyed on `code`, so repeated taps or retries never create duplicates.
3. On tap, call the share chain synchronously inside the click handler, with no `await` on the network before it:
   1. `navigator.share({ title, text, url })` if available.
   2. Otherwise open `https://wa.me/?text=<encoded text + url>`.
   3. Otherwise copy to the clipboard and show "Link copied".
4. Repeated taps reuse the same code and the same URL.
5. When someone opens `/c/<code>`, decode game, seed and score from the code itself, so the challenge works even if the background registration never reached the server. Load extra data (challenger's name) from the server if available, with a 3-second timeout.
6. Button states: idle "Share challenge" → after a successful share or copy, "Shared" or "Link copied" for 2 seconds → back to idle. No state may last longer than 3 seconds.

**Share text:**

```
I did <game> in <result>. Can you beat me?
https://chezable.com/c/<code>
```

**Acceptance**

- [ ] The share sheet opens on the first tap on Android Chrome and iOS Safari, with the network off.
- [ ] Five rapid taps create one challenge record, not five.
- [ ] A challenge URL opened on another device starts the same game with the same seed and shows the score to beat.
- [ ] The text "making your challenge link" no longer exists anywhere in the code.

### 1.3 Header inconsistency

The header (with the logo) must be identical on every page. See section 2.3. This is a shell change, not a per-page change.

### 1.4 End screen CTAs

The end screen moves from two buttons to three actions plus text links. See sections 3.3 and 5.6 for the rules.

### 1.5 Not a bug: the floating sound/menu pill

The grey pill with "⋯" and a speaker icon seen in screenshots is a browser or phone overlay. It appears on other sites too. Don't try to remove or move it.

---

## 2. Design system

The look is flat, light and high-contrast: solid color blocks, one button shape, generous spacing, no gradients and no heavy shadows. Implement these as CSS custom properties (or the codebase's token system) and use only these values.

### 2.1 Tokens

```css
:root {
  /* base */
  --ground:   #F4F4F1;  /* page background */
  --surface:  #FFFFFF;  /* cards, header */
  --ink:      #111111;  /* text, primary buttons */
  --muted:    #555555;  /* secondary text */
  --line:     #E2E2DE;  /* borders, dividers */
  --brand:    #4F63F5;  /* logo mark, focus ring */

  /* accents */
  --coin-chip:  #FFF1B8; /* header coin chip */
  --coin-pill:  #FFE27A; /* "+4 coins" pill */
  --hero-tint:  #E1E5FF; /* Today's Thread hero, claim banner */
  --heart:      #E5484D; /* thread lives */

  /* one color per game */
  --game-nyanya: #FF9E80;
  --game-cut:    #FFD54A;
  --game-cap:    #8ED8CC;  /* Kifuniko */
  --game-arrow:  #BDB0FF;

  /* type */
  --font-display: 'Bricolage Grotesque', system-ui, sans-serif; /* 700, 800 */
  --font-body:    'Figtree', system-ui, sans-serif;             /* 400–700 */

  /* shape */
  --radius-hero: 20px;
  --radius-card: 16px;
  --radius-tile: 14px;
  --radius-pill: 999px;

  /* spacing scale */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
}
```

Text on any game color or accent is always `--ink`. Light theme only for now.

### 2.2 Type scale

| Use | Font | Size / weight |
|---|---|---|
| Game title on start screen | Display | 44px / 800 |
| End screen result ("9 moves") | Display | 56px / 800 |
| Hero and section titles | Display | 24–30px / 800 |
| Card game name | Display | 19px / 800 |
| Body | Body | 15–16px / 400–600 |
| Small labels, chips | Body | 12–14px / 700 |

Load fonts from Google Fonts with `display=swap`. Text must render in the fallback font if the web font is slow.

### 2.3 Shared header

One header component, rendered by the shell layout on every route.

```
┌──────────────────────────────────────┐
│ ☰        [mark] Chezable      (●) 24 │   56px, --surface, 1px --line bottom
└──────────────────────────────────────┘
```

- Left: menu button (48×48 tap target).
- Center: logo mark plus wordmark, linking to Home. Use the real Chezable logo files.
- Right: coin chip showing the player's coin balance, tapping it opens coins history (or does nothing for now).
- **In thread mode**, a second row (the thread HUD) appears under the header: "Turn 2 of 3", three path nodes, three hearts. See 5.2.
- **During active gameplay**, the header may collapse to a 44px slim version (logo plus coins, plus the HUD row in threads), but it must not disappear.

**Acceptance**

- [ ] The same header component renders on Home, Game start, gameplay, End screen, Standings, Thread intro, Turn card and Receipt.
- [ ] No page defines its own header markup.

### 2.4 Buttons

| Kind | Style | Height |
|---|---|---|
| Primary | `--ink` fill, white text, full-round | 52px (44px inside cards) |
| Secondary | transparent, 2px `--ink` border, `--ink` text | 52px (44px inside cards) |
| Text link | `--ink`, underlined, 700 | min 44px tap height |

One primary button per screen section. All tap targets are at least 44×44px. Focus ring: 3px `--brand`, 2px offset.

### 2.5 Game icons

Replace the drawn placeholder icons with real images taken from each game's own sprites (the tomato, the bottle cap, the saw/fruit, the arrow), so the card previews what the player will see.

- Flat art as SVG, raster art as WebP, on transparent backgrounds.
- Same thick black outline across all four so they read as one set.
- Target under 15 KB per icon. Serve at 1x and 2x.
- Sizes used: 52px (home card), 96px (start screen), 36–40px (tiles, next card, HUD).

Mbogo supplies or approves the final art. Until then, keep the current placeholders.

---

## 3. Screens (standalone play)

### 3.1 Home

```
[ shared header ]
Tuesday, October 6                Standings
┌──────────────────────────────────────┐
│                               NEW    │
│   [🟧]···[🟪]···[🟨]                 │  three game tiles linked by a dotted line
│   Today's Thread                     │
│   Three games, one run. Lives and    │
│   coins carry over.                  │
│   ( Start thread )                   │
└──────────────────────────────────────┘
All games ─────────────────────────────
┌─────────────┐ ┌─────────────┐
│ [icon]      │ │ [icon]      │  colored top block, 120px
│ Nyanya jet… │ │ Cut in half │
├─────────────┤ ├─────────────┤
│ tagline     │ │ tagline     │
│ 45 sec      │ │ 30 sec      │  duration tag
│ ( Play )    │ │ ( Play )    │
│ ( Duel )    │ │ ( Duel )    │
└─────────────┘ └─────────────┘
... Kifuniko, Arrow puzzle
┌──────────────────────────────────────┐
│ Claim your name                      │  black card, shown only if unclaimed
│ Keep your streaks, coins and place   │
│ on the weekly standings.             │
│ ( Claim your name )                  │
└──────────────────────────────────────┘
```

- **Today's Thread hero:** the three tiles show today's actual thread games, in order. If the player has already finished today's thread, the hero changes to "Today's Thread done: 7/9 stars" with "See your result" and "Play an anytime thread".
- **Game cards:** 2-column grid, the game's color block with icon and name, a one-line tagline, a duration tag and two pills: Play (primary) and Duel (secondary, the existing async head-to-head).
- **Duration tag:** the median play time of that game, from real play data where available. Round to 15 seconds.
- **Taglines (placeholder copy, Mbogo to confirm):** Nyanya jetpack "Fly the tomato past the spikes." Cut in half "Stop the saw on the line." Kifuniko "Slide the caps into place." Arrow puzzle "Slide every arrow out of the grid."
- **Claim card:** hidden once the player has a name.

### 3.2 Game start screen

```
[ shared header ]
(whole screen in the game's color)
            [icon 96px]
            Kifuniko
     Slide the caps into place.
   ( Your best: 9 moves · #1 this week )   only if they have a best
       Choose how to play:
          (  Solo  )
          (  Duel a friend  )
          (  Daily  )                       only for games with a daily mode
       ( Claim your name )                  outlined, only if unclaimed
          October 6, 2026
──────────────────────────────────────
[thread icon] Play today's thread       >   white bottom bar
              3 games, lives and coins carry over.
```

- Mode pills are black, 56px tall, max 260px wide, centered.
- Show only modes the game actually supports.
- The bottom bar leads to today's thread intro. If today's thread is done, it reads "Play an anytime thread".

### 3.3 End screen (standalone game)

Rendered by the shell from the game's result (section 4). Stacked, in this order:

```
[ shared header ]
┌──────────────────────────────────────┐
│             NEW BEST                 │  only when it is a new best
│             9 moves                  │  56px display
│             ★ ★ ★                    │
│   Perfect. Best possible is 9.       │
│   ■ ■ ■ ■ ■ ■ ■ ■ □                  │  result strip (shareable visual)
│   #1 this week · Kifuniko            │  fills in from server, see 1.1
└──────────────────────────────────────┘  in the game's color
        ( +15 XP )  ( +4 coins )
┌──────────────────────────────────────┐
│ Claim your name                      │  only if unclaimed
│ Keep #1 this week and your coins.    │
│ [ Pick a name      ] ( Claim )       │
└──────────────────────────────────────┘
( Share challenge )                         primary
( Play again )  or  ( Next level )          secondary
┌──────────────────────────────────────┐
│ [icon] Next                        > │  promo card in the next game's color
│        Arrow puzzle                  │
│        Slide every arrow out…        │
└──────────────────────────────────────┘
        Standings        Home
Play more ─────────────────────────────
[tile] [tile] [tile]                        the other games
```

**Personalization:** when the name is claimed, the result card starts with "Nice one, <name>" and the claim banner is hidden.

**CTA rules for the standalone end screen:**

| Slot | Rule |
|---|---|
| Primary | Always "Share challenge" (section 1.2). |
| Secondary | "Next level" if the game has levels and the player passed this one; otherwise "Play again". |
| Third (promo card) | If the player hasn't finished today's thread: "Today's Thread" card. Otherwise: the next game, cycling through the games the player has played least today. |

The **result strip** is a row of small squares that summarizes the run, used on screen and in share text. Each game defines its strip (for example one square per move in Kifuniko, the last one outlined; for score games, 5 squares filled in proportion to score vs. 3-star threshold).

### 3.4 Name claim

- Inline text input plus "Claim" button, no signup.
- Rules: 3–16 characters, letters, numbers and underscore, case-insensitive unique, basic profanity filter.
- Check uniqueness in the background as the player types (debounced 300 ms) and show "Taken, try another" inline.
- The name binds to the existing device player ID. Any scores already set on this device move to the name, including the current result.
- Skippable. Unclaimed scores show as "Guest" on standings.

### 3.5 Standings

Restyle only: shared header, tokens, pills. Add a "Daily thread" tab (section 5.7) alongside the existing per-game boards.

---

## 4. Game contract

Every game becomes a stage that the shell starts and that hands back a result. Games stop drawing their own end screens.

```ts
interface GameStartOptions {
  seed: string;           // deterministic: same seed, same layout/obstacles/puzzle
  mode: 'solo' | 'duel' | 'daily' | 'thread';
  maxDurationSec: number; // 60 by default
  level?: number;         // for games with levels
}

interface GameResult {
  gameSlug: string;
  seed: string;
  score: number;          // the game's native score (moves, distance, accuracy…)
  scoreLabel: string;     // "9 moves", "142 m", "98% accurate"
  stars: 0 | 1 | 2 | 3;   // 0 = fail
  bestPossible?: number;  // for puzzles, e.g. 9 moves
  durationMs: number;
  strip: boolean[];       // result strip squares, see 3.3
  coinsEarned: number;
  xpEarned: number;
}

// shell API
game.start(options: GameStartOptions): Promise<GameResult>;
game.forceEnd(): void;    // called by the shell at maxDurationSec; game resolves with its current result
```

**Requirements for each of the four games**

- Accept a `seed` and use a seeded random generator for everything random (obstacles, puzzle choice, spawn timing). Same seed must produce the same run.
- Resolve with a `GameResult` instead of showing an end screen.
- Respect `maxDurationSec`. When the shell calls `forceEnd()`, resolve immediately with the current result.
- Keep every run between 30 and 60 seconds for a typical player.

**Star thresholds (Mbogo to set from real play data)**

| Game | 0 stars (fail) | 1 star | 2 stars | 3 stars |
|---|---|---|---|---|
| Kifuniko | did not solve | solved | ≤ best + 2 moves (suggested) | best possible |
| Arrow puzzle | did not clear | cleared | TBD | TBD |
| Nyanya jetpack | below pass score | TBD | TBD | TBD |
| Cut in half | below pass accuracy | TBD | TBD | TBD |

Suggested method for the TBD cells: 1 star at roughly the score most players reach, 2 stars around the median of returning players, 3 stars around the top 15% or the optimal result.

---

## 5. Game threads

A thread is a sequence of different minigames played as one run. Lives, coins and XP carry between turns. A thread is configuration, not new code:

```ts
interface ThreadDef {
  id: string;             // 'daily-2026-10-07' or 'anytime-<random>'
  kind: 'daily' | 'anytime';
  title: string;          // "Today's Thread" | "Anytime thread"
  games: string[];        // 3 game slugs, in play order
  seed: string;           // thread seed; each turn's seed = hash(seed + slug)
  startingLives: 3;
  ranked: boolean;        // daily: first completion only
}
```

### 5.1 Thread types in this spec

**Daily thread.** Same three games, same order and same seeds for every player on a given day (Nairobi time, EAT, resets at midnight). Ranked: only the player's first completion of the day counts on the Daily thread standings. Replays are allowed but unranked.

**Anytime thread.** A random thread the player can start any time, unranked. Uses the same engine and screens.

**Choosing the games (both types):**

1. Seeded shuffle of the four current games, take three.
2. Order them so the two puzzle games (Kifuniko, Arrow puzzle) are never back to back. If both puzzles are picked, put the arcade game in the middle.
3. Turn seed = `hash(threadSeed + gameSlug)`.

### 5.2 Thread HUD (header second row)

```
Turn 2 of 3        (✓)···(●)···( )        ♥ ♥ ♡
```

- Label: "Turn n of 3" while playing, "Turn n of 3 done" on a turn card, "Thread complete" or "Out of lives" on the receipt.
- Nodes: done = the game's color with a tick, current = the game's color with a ring, upcoming = empty.
- Hearts: filled for remaining lives.
- The coin chip in the header shows the running balance including coins earned in this thread.

### 5.3 Rules

| Event | Effect |
|---|---|
| Turn passed (1+ stars) | Coins and XP added. Player sees the turn card. |
| Turn failed (0 stars) | Lose 1 life. Player replays the same turn (same seed). |
| Retry a passed turn for more stars | Costs 1 life. The better result replaces the old one. |
| Lives reach 0 | Thread ends. Receipt shows "Out of lives" with progress so far. |
| Thread completed | +5 coin bonus and +10 XP bonus (tune later). |

Coins are banked to the player's wallet as they are earned, so quitting or running out of lives never takes coins away.

**Resume:** save thread progress (current turn, lives, results) locally after every turn. If the player leaves or refreshes, Home and the Game start bottom bar show "Continue today's thread (turn 2 of 3)". Progress expires at the daily reset for Daily threads and after 24 hours for Anytime threads.

### 5.4 Thread intro

```
[ shared header + HUD ]
┌──────────────────────────────────────┐
│ Today's Thread                       │  --hero-tint panel
│ Three games, one run. Lives and      │
│ coins carry over.                    │
└──────────────────────────────────────┘
 [1] Nyanya jetpack                       vertical path: game-colored nodes
  ┊  Fly the tomato past the spikes.      linked by a dotted line
 [2] Kifuniko
  ┊  Slide the caps into place.
 [3] Cut in half
     Stop the saw on the line.
You have 3 lives for the whole thread.
( Start thread )
```

This is the per-thread version of the path map. Preload the first game's assets while this screen is open.

### 5.5 Turn card (between turns)

Replaces the standalone end screen while inside a thread.

```
[ shared header + HUD: "Turn 1 of 3 done" ]
┌──────────────────────────────────────┐
│ Nyanya jetpack: 142 m                │  in the game's color
│ ★ ★ ☆                                │
│ ■ ■ ■ □ □                            │  result strip
└──────────────────────────────────────┘
   ( +4 coins ) ( +5 XP ) ( 3 lives )
┌──────────────────────────────────────┐
│ [icon] Next                        > │  next game's color
│        Kifuniko                      │
└──────────────────────────────────────┘
( Next: Kifuniko )                          primary
( Retry for more stars, costs 1 life )     secondary, hidden at 1 life
       Thread path        Quit thread
```

After a failed turn, the card shows "Out of stars, 1 life lost" and the primary button becomes "Try again".

Preload the next game's assets while this card is open, so "Next" starts instantly.

### 5.6 Thread receipt (end of thread)

```
[ shared header + HUD: "Thread complete" ]
┌──────────────────────────────────────┐
│ Today's Thread · Oct 7               │  --hero-tint panel
│ Thread complete                      │
│ Nyanya jetpack   ★★☆   142 m         │
│ Kifuniko         ★★★   9 moves       │
│ Cut in half      ★☆☆   88%           │
│ 6 of 9 stars · 2 lives left          │
│ #14 today                            │  fills in from server
└──────────────────────────────────────┘
   ( +17 coins ) ( +25 XP )
[ Claim your name banner, if unclaimed ]
( Share result )                            primary
( Challenge a friend )                      secondary
┌──────────────────────────────────────┐
│ Up next                            > │
│ Anytime thread / tomorrow's thread   │
└──────────────────────────────────────┘
Play a single game ────────────────────
[tile] [tile] [tile] [tile]
```

**CTA rules on the receipt:**

| Slot | Daily thread | Anytime thread |
|---|---|---|
| Primary | Share result (text receipt) | Share result |
| Secondary | Challenge a friend (link to today's thread with your stars to beat) | Challenge a friend (link to this exact thread) |
| Up next card | "Play an anytime thread". Small text under it: "New daily thread in 6h 12m". | "Play another anytime thread" |
| If out of lives | Primary becomes "Try again (unranked)" and Share moves to secondary. | Same. |

**Share result text:**

```
Chezable · Today's Thread · Oct 7
Nyanya jetpack ⭐⭐▫️
Kifuniko       ⭐⭐⭐
Cut in half    ⭐▫️▫️
6/9 stars · 2 lives left
https://chezable.com/t/2026-10-07
```

**Thread challenge links** use the same rules as 1.2: generated on the client, shared without waiting for the network, idempotent registration.
`https://chezable.com/t/<threadId>?from=<challengeCode>` opens the thread intro with "Beat <name>'s 6/9 stars" at the top.

### 5.7 Daily thread standings

- One board per day: total stars descending, then total thread time ascending.
- First completion only. Out-of-lives runs don't rank.
- Show the top 50 and the player's own row.
- Weekly roll-up (optional, if cheap): sum of daily stars across the week.

---

## 6. Data and API (adapt to the existing backend)

| Purpose | Suggested endpoint | Notes |
|---|---|---|
| Submit a standalone result | `POST /api/results` | Background, retried on next load if it fails |
| Register a challenge | `PUT /api/challenges/:code` | Idempotent upsert |
| Read a challenge | `GET /api/challenges/:code` | Optional; the code itself carries game, seed and score |
| Get a thread | `GET /api/threads/daily/:date` | Or compute on the client from the date seed |
| Submit a thread result | `PUT /api/threads/:threadId/results/:playerId` | Idempotent; server keeps the first ranked completion |
| Claim a name | `POST /api/names` | Returns 409 if taken |
| Check a name | `GET /api/names/:name` | For the debounced check |
| Standings | `GET /api/standings/daily-thread/:date` | Top 50 plus the caller's row |

The server should recompute thread composition from the date and validate that submitted results match the thread's games and seeds.

---

## 7. Analytics events

Log these so threads can be judged with real numbers.

| Event | Properties |
|---|---|
| `end_screen_render_ms` | game, ms |
| `share_tapped` / `share_completed` / `share_failed` | surface (end screen, receipt), method (native, whatsapp, clipboard) |
| `challenge_opened` | code, game or thread, new vs returning player |
| `name_claimed` | surface |
| `thread_started` | kind, thread id, entry point (home hero, start-screen bar, end-screen card, challenge link) |
| `turn_completed` | thread id, turn index, game, stars, lives left, retry yes/no |
| `thread_completed` | thread id, stars, lives left, duration |
| `thread_abandoned` | thread id, last turn reached |
| `thread_resumed` | thread id, turn |

**Success measures (Mbogo to set targets before launch):**

- Share completion rate on the end screen (should rise sharply after fix 1.2): target ____
- Median `end_screen_render_ms`: target ____
- Share of daily visitors who start the Daily thread: target ____
- Thread completion rate (started → completed): target ____
- Drop-off per turn (turn 1 → 2 → 3): target ____
- Challenge links opened per share: target ____

---

## 8. Build order

Each phase ships on its own.

1. **Fixes and shell.** Fix 1.1 and 1.2, the shared header (2.3), the design tokens. Ship.
2. **Screens.** Home, Game start, End screen with three CTAs, name claim, restyled Standings. Use placeholder icons until the real art is ready, then swap. Ship.
3. **Game contract.** Seeds, `GameResult`, `forceEnd()`, and star thresholds for all four games. The end screen now renders only from `GameResult`. Ship.
4. **Threads.** Thread engine, Daily and Anytime threads, HUD, intro, turn card, receipt, resume, thread challenges, Daily thread standings. Ship.

## 9. Overall acceptance checklist

- [ ] Every page shows the same header.
- [ ] End screen shows within 150 ms of the game ending, even offline.
- [ ] Share opens on the first tap, offline, on Android Chrome and iOS Safari.
- [ ] Standalone end screen has Share, Play again or Next level, and a Next card, following the rules in 3.3.
- [ ] All four games accept a seed and return a `GameResult`; none draws its own end screen.
- [ ] Today's thread is the same three games and seeds for every player, and resets at midnight EAT.
- [ ] Lives carry across turns; a failed turn costs a life and replays the same seed; zero lives ends the thread.
- [ ] Refreshing mid-thread offers "Continue today's thread".
- [ ] Receipt share text and challenge link work as specified.
- [ ] No new games were added.
