# Nyanya Jetpack

Hold to fire the jetpack and keep the tomato off the spikes.

- **Slug:** `nyanya-jetpack` · **Modes:** solo, daily, h2h
- **Score:** higher is better · **Tiebreak:** none
- **Classic:** Chezability 1 · `D01+D05 | V03 × U01 ⊕ M82+M88 → S03+S04 → P04`
- **Native — Okoa:** Chezability 4 · `D13+D07 | V03 × U01+U12 ⊕ M82+M95 → S13 → P05 [O10 on kati]`
  Crash, and you can send a rescue link. A friend who catches your falling tomato within 10 seconds brings you back, and you carry on from the crash. Source: kati, where catching the ball brings an eliminated player back.
- **Integration:** course and mines from the run seed; hold/release tick log; ghost replay at 40% opacity; revive challenges

Source files: `stage.json` (manifest), `game.js` (stage), `index.html`, `style.css`, `sim.js` (pure simulation, unit-tested).

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
| 1. Declare the stack | Classic: `D01+D05 \| V03 × U01 ⊕ M82+M88 → S03+S04 → P04`<br>Native: `D13+D07 \| V03 × U01+U12 ⊕ M82+M95 → S13 → P05 [O10 on kati]` | ✓ |
| 2. Two-plus uncertainties | 2 U source(s) in the Native notation | ✓ |
| 3. First atom in 10 s | first atom: first 50 m; tracked as `run.first_atom`; TTFF as `run.first_input` | ✓ instrumented, measure after launch |
| 4. Feel first | tunables in `stage.json`: gravity, thrust, vmax, radius, gapStart, gapMin, mineFrom, okoaSecs | ✓ |
| 5. One real operator | O10 add a social frame on kati | ✓ |
| 6. One cultural mechanic | kati, where catching the ball brings an eliminated player back | ✓ |
| 7. Social frame by design | S03 challenge link with ghost; S13 rescue by a friend (Okoa) | ✓ |
| 8. Payload designed in | P04; share path in the result sheet | ✓ |
| 9. Rules in one sentence | "Hold to fire the jetpack and keep the tomato off the spikes." (60 characters) | ✓ |
| 10. Pre-register | block below, dated 2026-10-04 | ✓ |

## Pre-registration

```
Game:                  Nyanya Jetpack
Notation:              D13+D07 | V03 × U01+U12 ⊕ M82+M95 → S13 → P05 [O10 on kati]
Chezability score:     Classic 1, Native 4  (V U M S O C)
Primary hypothesis:    H3: Okoa produces more new-player recruits per crash than Classic challenges (spec §11.3)
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            Nyanya Jetpack Classic (borrowed) variant
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               2026-10-04
```
