# Cut It in Half

Stop the sliding saw at exactly 50 cm. Three cuts; the lowest total wins.

- **Slug:** `cut-in-half` · **Modes:** solo, h2h, pass
- **Score:** lower is better · **Tiebreak:** smallest single-cut error
- **Classic:** Chezability 1 · `D01 | V02 × U01 → S03+S04 → P01+P03`
- **Native — No Numbers:** Chezability 4 · `D01 | V02 × U01+U10 ⊕ M44 → S03 → P03 [O05 on Igisoro]`
  No guide line and no numbers until all three cuts are done. Judge the half by eye. Source: Igisoro, where masters never count their seeds openly.
- **Integration:** seeded saw phase and per-round speed jitter; 1/120 s steps; Space/Enter to cut; pass the phone moved to the shell (same seed for both players)

Source files: `stage.json` (manifest), `game.js` (stage), `index.html`, `style.css`.

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
| 1. Declare the stack | Classic: `D01 \| V02 × U01 → S03+S04 → P01+P03`<br>Native: `D01 \| V02 × U01+U10 ⊕ M44 → S03 → P03 [O05 on Igisoro]` | ✓ |
| 2. Two-plus uncertainties | 2 U source(s) in the Native notation | ✓ |
| 3. First atom in 10 s | first atom: first cut within 8 cm; tracked as `run.first_atom`; TTFF as `run.first_input` | ✓ instrumented, measure after launch |
| 4. Feel first | tunables in `stage.json`: rounds, speeds, jitter, sway, amp | ✓ |
| 5. One real operator | O05 hide/reveal on Igisoro | ✓ |
| 6. One cultural mechanic | Igisoro, where masters never count their seeds openly | ✓ |
| 7. Social frame by design | S03 challenge link; pass the phone | ✓ |
| 8. Payload designed in | P03; share path in the result sheet | ✓ |
| 9. Rules in one sentence | "Stop the sliding saw at exactly 50 cm. Three cuts; the lowest total wins." (73 characters) | ✓ |
| 10. Pre-register | block below, dated 2026-10-04 | ✓ |

## Pre-registration

```
Game:                  Cut It in Half
Notation:              D01 | V02 × U01+U10 ⊕ M44 → S03 → P03 [O05 on Igisoro]
Chezability score:     Classic 1, Native 4  (V U M S O C)
Primary hypothesis:    No Numbers runs have a higher session-replay rate than Classic runs
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            Cut It in Half Classic (borrowed) variant
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               2026-10-04
```
