# Pre-registration: Classic vs Native

**Written:** 2026-10-04, before any public link is shared (spec §11.3, launch checklist item 10).
**Status:** drafted from the build spec. The owner should review it and confirm the date before the soft launch. Once the first public link goes out, don't edit this file; record any deviation in the "Changes" section with a date.

```
Experiment:          Chezable MVP — Classic (borrowed) vs Native (Chezability) variants
Hypothesis H1:       Native variants have a higher session-replay rate than Classic, pooled across games
Hypothesis H2:       Native variants have a higher challenge-send rate than Classic
Hypothesis H3:       Nyanya Rescue (Okoa) produces more new-player recruits per crash than Nyanya Classic challenges
Falsifier:           Native ≤ Classic on H1 and H2 after the sample below → the charter's claim fails for this set
Comparison:          Classic variant of the same game
Sample / window:     first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:            difference in proportions with 95% interval; per-game results reported, pooled result primary
Result:              published on Kongo Kega, win or loss
```

## How the arms are assigned

- Every new player is randomly assigned at creation: 80% Classic-default, 20% Native-default (`players.variant_cohort`, drawn on the device and stored by `POST /api/player`).
- Native modes unlock for everyone at level 2 (100 XP). Players can switch variant on any game's intro card.
- **The analysis compares by first-assigned cohort** (intention to treat), not by which variant a run used.
- Apple Slicer's Native (Block Mode, from kati) is pass-the-phone only, so it contributes to H1 through pass sessions and is excluded from H2.
- Water Bugs (Shisima) has no Classic arm. It is native as built, and its numbers are reported separately as a native control.

## Metric definitions (from the event stream, `events` table)

| Metric | Definition | Events |
|---|---|---|
| Session replay | sessions with ≥ 2 `run.finish` events for the same game | `session.start`, `run.finish` |
| Challenge-send rate | finished runs that create a challenge (`challenge.create`) ÷ finished runs | `run.finish`, `challenge.create` |
| Recruits per crash (H3) | Rescue (revive) challenges answered by players created after the challenge ÷ Nyanya Native crashes; vs the same for Classic Nyanya challenges | `challenges`, `challenge_entries`, `players.created_at`, edge kind `recruited` |
| TTFF | `run.first_input` minus `stage.open` | |
| First-atom close | `run.first_atom` minus `run.start` | |

Session IDs rotate daily, and no personal data is stored in event properties.

## Per-game blocks

Each game's own block is in `games/<slug>/README.md`.

## Changes

- 2026-10-04, before launch: games renamed to English (e.g. Toka → Arrow Puzzle), UI made English-only, and Zamia removed from the set. The hypotheses are unchanged; Zamia has no arm in the analysis.
