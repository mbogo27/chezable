# Chezable Spec v1: Cleanup + Core Loop

**Status:** Draft for build
**Scope:** Part A (cleanup, navigation, background) and Part B (name claim, sharing, end screens, leaderboards)
**Out of scope for v1:** reaction cam, duels, play friends, overall leaderboard, AR-lite (see section 8)

---

## 0. Goal and how we judge it

Build the smallest loop that can grow by itself, on one template game first, then roll it across the four featured games:

```
play -> personal end screen -> challenge link on WhatsApp -> friend plays (no signup wall)
     -> friend claims a name -> friend challenges back / replays -> leaderboard pulls both back
```

### Success metrics (set targets BEFORE launch, so we are not judging by feel)

| Metric | Definition | Target |
| :--- | :--- | :--- |
| Name claim rate | players who claim a name / players who finish a first game | **40%** |
| Share rate | sessions with a share tap / sessions with a finished game | **20%** |
| Link-to-play | challenge links opened that lead to a started game / links opened | **60%** |
| Viral coefficient (rough) | new players from challenge links / sharing players | **0.4** |
| D1 / D7 return | players who play again on day 1 / day 7 | **D1 25%, D7 10%** |

Review after the template game has run for about two weeks with real traffic.

---

# PART A: CLEANUP

## A1. Catalogue

- Feature only the four favourites on the home page and game picker: **Cut in half, nyanya jetpack, kifuniko, arrow puzzle**. Confirm each one's current display name, since names were recently changed to English (nyanya jetpack kept as is).
- Archive everything else (the board game and any other games). Archive means unlisted and unlinked from navigation, not deleted. Keep the code.
- Zamia stays removed.
- Pick **one template game** to carry the full loop first (open decision, section 9). Criteria: highest replay rate, easiest score to understand at a glance, works in portrait on a cheap phone.
- The four games should differ in feel (reflex, timing, puzzle) so we can see which type spreads best.

## A2. Navigation fixes (from the code audit)

Today the game bar has a figure icon (links home, not obviously a button) and a menu with Home, Resume, Standings, Leave this run. But the result sheet, intro card and pass-the-phone results all cover the game bar and have no Home.

| Surface | Problem | Fix |
| :--- | :--- | :--- |
| Result sheet | No Home. Cannot be dismissed (by design) and covers the game bar. Only exits: browser back or "Next stage" | Add a **Home** button. Keep the sheet non-dismissable by tap-outside/Esc |
| Intro card | Covers the game bar; has Play, mode buttons, Standings but no Home | Add a **Home** link (text link or ghost button, lower priority than Play) |
| Pass-the-phone results | Rematch returns to the game's intro, not home | Add **Home** next to Rematch |
| Game bar | Figure icon alone does not read as Home | Show the word **Home** next to the icon (icon plus label) |

Rules:
- Home must be reachable from every screen in a game within one tap.
- Home is always lower visual priority than Play again, never the primary button.
- Leaving mid-run still goes through the existing "Leave this run" confirmation. Home from a finished result sheet does not need confirmation.
- Add `home_tap` event with `from` = `result | intro | passphone | gamebar`.

## A3. Background refresh

Replace the current dots with a light, abstract background.

**Design intent:** calm, light, slightly playful, never competing with game canvases or text.

| Token | Value |
| :--- | :--- |
| `--bg-base` | `#f3f3f3` |
| `--bg-shape-1` | brand periwinkle at 6 to 10% opacity (approx `#5271FF`, confirm exact value from the logo file) |
| `--bg-shape-2` | black at 3 to 4% opacity |
| `--bg-shape-3` | white at 60 to 80% opacity (gives soft highlights on `#f3f3f3`) |

Implementation guidance:
- **Static only.** No animation in v1. This keeps low-end Android phones smooth and saves battery.
- Build it from layered CSS `radial-gradient` / `conic-gradient` shapes, or one small inline SVG of large soft arcs and blobs (under about 5 KB). No large image files, no canvas blur or CSS `filter: blur()` on big areas (expensive on cheap GPUs).
- Large, low-contrast shapes only, in 2 to 4 places per screen, so it feels abstract rather than patterned.
- Anchor shapes to the viewport corners and edges, so the centre where content sits stays calm.
- Text and UI on top must keep **WCAG AA contrast (4.5:1 for body text)** against the busiest part of the background.
- Confirm where the dots appear: the site shell only, or also inside game canvases. Apply the new background to the site shell. Game canvases keep their own art unless they use the same dots.

Starter CSS (adjust to taste):

```css
:root { --bg-base:#f3f3f3; --brand:#5271FF; }

body {
  background-color: var(--bg-base);
  background-image:
    radial-gradient(60vmax 60vmax at 105% -10%, rgb(82 113 255 / .09), transparent 60%),
    radial-gradient(50vmax 50vmax at -10% 110%, rgb(0 0 0 / .035), transparent 60%),
    radial-gradient(40vmax 40vmax at 85% 95%, rgb(255 255 255 / .7), transparent 65%);
  background-attachment: fixed;
}
```

Acceptance: no dots remain; passes contrast check; no measurable frame drops on a low-end Android phone.

## A4. Housekeeping

- The recent commits (English game names, Zamia removed, Today's-set fix) currently exist only on the developer's machine. Decide when to push and deploy them, and confirm nothing in the live site depends on the old names or URLs. If game URLs changed, add redirects so old shared links still work.
- Record which parts of Part B are already live before starting (open decision, section 9).

## A5. Analytics baseline

Instrument before building new features, so we have a "before" picture. Minimal event set (full list in B7): `game_start`, `game_end`, `share_tap`, `link_open`, `home_tap`.

---

# PART B: CORE LOOP

## B1. Identity: claim a name

**Principle:** one field, after the first game, no signup wall.

### Flow
1. Player finishes their first game. The result sheet shows the score and a name prompt: "Nice run! Claim your name to save it."
2. Player types a name (or taps **Suggest one**, which generates a clean name from a curated word list, for example adjective + animal + number, so it needs no moderation pass).
3. Validation runs (below). On success the name is saved, the score is posted to the leaderboard, and the normal end-screen state appears.
4. Skipping is allowed. Score stays local; the prompt returns after the next game, at most 3 times, then becomes a small persistent "Claim your name" chip.

### Identity model
- On first visit create an anonymous `player_id` (UUID) stored on the device and registered on the server.
- A claimed name attaches to the `player_id`. No real name, email or phone is collected in v1.
- **Known limit:** clearing browser data loses the identity and the name. Recovery (optional WhatsApp number or magic link) is deferred to v2. Say so in the UI: "Your name is saved on this device."

### Name rules
| Rule | Value |
| :--- | :--- |
| Length | 3 to 16 characters |
| Allowed | letters, numbers, underscore, hyphen; no leading/trailing separators |
| Uniqueness | case-insensitive; compare on the normalized form |
| Not allowed | all digits; 7 or more digits in a row (looks like a phone number); `@`, `http`, `www`, `.com`/`.co.ke`-style strings; emails |
| Reserved | `chezable`, `admin`, `mod`, `support`, `official`, `staff`, `team`, plus lookalikes after normalization |
| Hint text | "Use a nickname, not your real name." (many players are children; also reduces personal-data exposure) |
| Changes | one free change, then once every 14 days (open decision) |

### Moderation (uses the supplied [`swahili_profanity_blocklist_and_moderation_strategy.md`](swahili_profanity_blocklist_and_moderation_strategy.md))

That file is the **seed** for the blocklist. Do not paste its terms into client-side code; keep the list and matching **server-side** so it cannot be read or probed from the browser.

**Pipeline** (applied to a copy of the input for matching; the original is kept for display):
1. Unicode NFKD, strip accents.
2. Remove zero-width and formatting characters.
3. Lowercase.
4. Map leetspeak/homoglyphs to base letters (0 to o, 1/!/| to i, 3 to e, 4/@ to a, 5/$ to s).
5. Collapse repeated adjacent characters.
6. **Compile every blocklist and whitelist entry through the same steps 1 to 5**, then match. (Important, see review notes.)
7. Tokenise on any non-letter (`_`, `.`, `-`, digits, spaces) and apply word-boundary matching to boundary-tier terms on the tokens.
8. For long, unambiguous terms only (5 or more letters, strict tier), also test a **squashed** version with separators removed, to catch `k.u.m.a`-style evasion.

**Tiers:**
| Tier | Behaviour | Examples of what goes here |
| :--- | :--- | :--- |
| Strict | Reject if the term appears anywhere (after normalization), unless whitelisted | explicit sexual roots, severe slurs |
| Boundary | Reject only when it is a whole token | short terms that appear inside innocent words and place names |
| Flag | Allow, but mark the name for review and make it reportable | mild insults, and animal words people use as nicknames |
| Whitelist | Always allow | known place names and surnames that contain blocked strings (the supplied file lists several) |

**Rejection message** (generic, never reveal the matched term):
> "This name can't be used. Please choose another."

**Review notes on the supplied file (apply before shipping):**
1. **Compression breaks double-letter entries.** The collapse step turns `mboo` into `mbo` and `mpuuzi` into `mpuzi`, so entries must be compiled through the same pipeline (step 6) or they will never match.
2. **The regex roots are broader than the table.** The patterns use short roots, which would hit innocent strings in English and other languages (for example words containing "tomb"). Match the full roots listed in the table, and test against a corpus of real Kenyan names and places before enabling.
3. **`\b` does not split on underscores or digits** (they count as word characters), so `xx_term_xx` slips past boundary matching. Use the tokenising step (7).
4. **Mild terms and animal words** (several insults, plus words like hyena, dog, baboon) are common as playful nicknames. Put them in the Flag tier rather than blocking, unless you decide otherwise. This is a product decision (section 9).
5. **Coverage gaps:** the file is Swahili only. Add **English**, **Sheng**, **Gikuyu** and other languages your players use, plus common sexual and hate terms in text-speak. Ask native speakers from different regions to review the final list, because meanings and severity vary by region and context.
6. **Impersonation and personal data** are not covered by profanity lists. Handled by the reserved list and the digit/URL rules above.
7. Keep a **report name** action and an admin tool to rename or remove names. No automated filter is complete.

**Logging:** count rejections by tier (not the raw text of what players typed, to avoid storing abuse). Use the counts to tune the list.

Acceptance:
- [ ] Claim works end to end; duplicates rejected case-insensitively
- [ ] Evasions tested: leetspeak, repeated letters, separators, zero-width characters
- [ ] Whitelist corpus (real names/places) passes with zero false rejections
- [ ] Suggest-a-name never produces a rejected name

## B2. Sharing: challenge links

**Principle:** every share is a challenge, not "check out this game."

### Share options (limited, no general share sheet)
1. **WhatsApp** (primary, always first)
2. **Facebook**
3. **Copy link** (also covers TikTok and Instagram bios and DMs)

### Challenge link
- Format: `https://chezable.com/c/{code}` with a short random code.
- The code resolves server-side to: game, challenger name, challenger score, created time.
- Codes do not expire in v1. If the game or score is later hidden by moderation, the link falls back to the plain game page.

### Share text (WhatsApp default)
> "I scored {score} in {game} on Chezable. Beat me: {url}"

Keep a few variants per end-screen state (record, rank, near miss) so messages do not all read the same.

### Preview card (this decides whether links get clicked)
- WhatsApp and Facebook read link previews from the **server-rendered HTML**; they do not run JavaScript. The `/c/{code}` route must return Open Graph tags (`og:title`, `og:description`, `og:image`) in the initial HTML. If the site is a static single-page app, add a small server or edge function for this route.
- `og:image`: a generated card (about 1200x630) showing game art, challenger name, score and the Chezable logo. Cache it by code.
- Title example: "{name} scored {score}. Can you beat it?"

### Behaviour
- WhatsApp button opens `https://wa.me/?text={encoded text}`. Facebook uses its share URL. Copy link uses the clipboard API with a visible "Copied" confirmation and a manual-select fallback.
- Do not call the native share sheet in v1 (it would show every app and defeat the limited-options goal).

Acceptance:
- [ ] Link posted in WhatsApp shows the correct preview on Android and iPhone
- [ ] Opening the link on a phone with no account goes straight to the game (B3)
- [ ] `share_tap` records the channel; `link_open` records the code

## B3. Recipient landing (someone opens a challenge link)

This screen decides whether the loop grows.

- Header: "**{name}** scored **{score}** in {game}. Beat it?"
- One large **Play** button. No name claim, no signup, no popups first.
- Under the button, a small "How it works" line for the game (one sentence).
- The challenger's score is shown as the target during play (a small "Beat {score}" indicator).
- After the recipient's first game, the end screen shows how they compared: "You beat {name}" or "{name} wins by {gap}." Then the name-claim prompt (state 1) and a one-tap **Challenge {name} back** action.
- Invalid or hidden link: show the plain game intro with a friendly message.

Acceptance: from tapping the link to the first moment of gameplay is **2 taps or fewer**.

## B4. End screens

The end screen is **fullscreen**. Layout (top to bottom):
1. State headline
2. Score block (score, personal best, rank if available)
3. **Reserved media area** for the replay clip in v2 (reaction cam). In v1 show a game-art or score graphic here, so the layout does not change later.
4. Primary button
5. Secondary button
6. Home (text link or ghost button, always visible)

The sheet stays non-dismissable by tap-outside or Esc (existing behaviour). Home (A2) is the exit.

### States (show the highest-priority state that applies)

| # | State | Headline | Primary CTA | Secondary CTA |
| :--- | :--- | :--- | :--- | :--- |
| 1 | First game | "Nice run! Claim your name." | **Save name** | Skip for now |
| 2 | New personal best | "New best: {score}!" | **Share challenge** (WhatsApp first) | Play again |
| 3 | Rank moved | "You're #{n} this week, up {x}." | **Share** | Beat #{n-1} (restarts the game) |
| 4 | Near miss | "So close. {gap} away." | **Play again** | none (do not push sharing here) |
| 5 | Beat a challenge (from link) | "You beat {name}!" | **Challenge {name} back** | Play again |
| 6 | Lost a challenge (from link) | "{name} wins by {gap}." | **Rematch** | Challenge someone new |
| 7 | Default | Score and best | **Play again** | Challenge a friend |

Priority order: 1, then 5/6 (when the session came from a link), then 2, 3, 4, 7.

**Definitions** (tune after launch):
- *Personal best:* highest score by this player in this game (all time).
- *Near miss:* within 10% of personal best, or within a small gap of the next leaderboard rank (set per game).
- *Gap:* shown in the game's own units (points, seconds).

**Rules for every state:**
- Play again is always one tap and always present (as primary or secondary).
- At most three share options (B2).
- No ads or interstitials between the end of the game and the call to action.
- Home is always reachable (A2).
- Duel states for strangers and play friends are **not** in v1; states 5 and 6 only apply to challenge links.

Acceptance:
- [ ] Each state reachable in testing with forced values
- [ ] Correct priority when several states apply
- [ ] Layout holds on small phones (about 360 px wide) with long names

## B5. Leaderboards

### v1 boards
- **Per game, weekly** (resets Monday 00:00 East Africa Time) and **per game, all time**.
- Show: top 10, plus **your row** with rank and "{gap} behind {name}" to the next rank up.
- Sorting: higher is better unless the game defines otherwise (store a per-game `sort_order` setting).
- One entry per player per board (their best score).
- Reachable from the existing Standings button and from the end screen.

### Later (not v1)
- Overall Chezable board using play points across games (not raw playtime, to avoid rewarding idle tabs).

### Score integrity (basic, v1)
Client-side games can never be made fully cheat-proof, so the aim is to stop casual cheating and keep boards believable.
- The server issues a **session token** at game start and records the start time.
- A submitted score must carry a valid token, and the elapsed time must be at or above a per-game **minimum duration**.
- Per-game **maximum plausible score**; anything above is stored but flagged and hidden from boards until reviewed.
- Rate limit score submissions per player and per IP.
- Admin ability to hide a score or a player from boards.

Acceptance:
- [ ] Weekly reset at the right time; ties broken by earliest time achieved
- [ ] A fabricated score without a valid token is rejected
- [ ] A flagged score does not appear on public boards

## B6. Data model (stack-agnostic)

Assumes a small API and database. Choice of stack is an open decision (section 9).

| Table | Key fields |
| :--- | :--- |
| `players` | `id` (uuid), `name`, `name_normalized` (unique), `created_at`, `name_changed_at`, `status` |
| `sessions` | `token`, `player_id`, `game_id`, `started_at`, `mode`, `challenge_code` (nullable) |
| `scores` | `id`, `player_id`, `game_id`, `score`, `duration_ms`, `week_key`, `flagged`, `hidden`, `created_at` |
| `challenges` | `code`, `game_id`, `challenger_id`, `score_id`, `created_at` |
| `reports` | `id`, `player_id`, `reason`, `created_at`, `resolved` |
| `events` | `name`, `player_id`, `props` (json), `created_at` |

Privacy: collect the minimum. No real names, emails or phone numbers in v1. Check obligations under Kenya's data protection law, especially since many players will be minors.

## B7. Events

| Event | Properties |
| :--- | :--- |
| `game_start` | game, mode, from_link (bool) |
| `game_end` | game, score, duration, state_shown |
| `name_claim_shown` / `name_claimed` / `name_rejected` | tier (never the text) |
| `share_tap` | channel (whatsapp, facebook, copy), state_shown, game |
| `link_open` | code, game |
| `challenge_accept` | code, game |
| `rematch_tap` | game, state_shown |
| `home_tap` | from |
| `leaderboard_view` | game, board (weekly, all-time) |
| `return_d1` / `return_d7` | derived |

---

## 8. Build order and acceptance checklist

Build on the **template game first**, then roll out to the other three.

| Step | Work | Done when |
| :--- | :--- | :--- |
| M0 | Cleanup (A1 to A4): four games featured, nav fixes, new background, deploy pending commits | Four games live, Home reachable everywhere, no dots |
| M1 | Analytics baseline (A5) | Events visible in a dashboard |
| M2 | Identity: player id, name claim, moderation pipeline (B1) | B1 acceptance passes |
| M3 | End screens states 1, 2, 3, 4, 7 (B4) | All states reachable and correct |
| M4 | Challenge links, preview cards, recipient landing, states 5 and 6 (B2, B3) | Link works in WhatsApp on Android and iPhone |
| M5 | Per-game leaderboards and score integrity (B5) | B5 acceptance passes |
| M6 | Roll the loop across the other three games | All four share the same components |
| M7 | Measure for about two weeks against section 0 targets, then decide next step | Targets reviewed |

**Not in v1 (next):**
1. Reaction cam, replay loop on the end screen, clip save/share with Chezable end card
2. Duels, play friends, overall leaderboard
3. Creator tools and prompts, creator duels, then game shows
4. AR-lite effects
5. Printables and kits
6. Account recovery (WhatsApp or magic link)

## 9. Open decisions

- [ ] Which game is the template?
- [ ] What is already live from Part B, so we skip it?
- [ ] Backend and hosting for names, scores and the `/c/{code}` route (and server-rendered previews)
- [ ] Third share option: Facebook (default) or X/Telegram
- [ ] Name change policy (default: one free change, then every 14 days)
- [ ] Mild insults and animal-word nicknames: block, or allow and flag?
- [x] Success targets for section 0 (set 2026-10-04, in the table above)
- [ ] Who reviews the final blocklist (native speakers across regions)
