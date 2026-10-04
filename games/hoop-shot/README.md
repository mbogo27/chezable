# Hoop Shot

Tap when the power bar is right to shoot into the hoops; higher hoops score more.

- **Slug:** `hoop-shot` · **Modes:** solo, h2h, pass
- **Score:** higher is better · **Tiebreak:** more swishes
- **Classic:** Chezability 1 · `D01+D02 | V02 × U01+U05 ⊕ M26+M30 ⊕ E20 → S03 → P03`
- **Native — Call Your Shot:** Chezability 4 · `D01+D02 | V02+V17 × U01+U13 ⊕ M79+M26 → S03 → P07 [O11 on Kadi]`
  Before each shot you may call a hoop. A called hit scores double; a called miss scores nothing. Source: Kadi, where you must declare "Niko Kadi!" before you're allowed to win.
- **Integration:** constant 1/240 s physics; seeded bar phase and wind per shot; call chips (1–5 keys); Space to shoot

Source files: `stage.json` (manifest), `game.js` (stage), `index.html`, `style.css`.

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
| 1. Declare the stack | Classic: `D01+D02 \| V02 × U01+U05 ⊕ M26+M30 ⊕ E20 → S03 → P03`<br>Native: `D01+D02 \| V02+V17 × U01+U13 ⊕ M79+M26 → S03 → P07 [O11 on Kadi]` | ✓ |
| 2. Two-plus uncertainties | 2 U source(s) in the Native notation | ✓ |
| 3. First atom in 10 s | first atom: first ball scored; tracked as `run.first_atom`; TTFF as `run.first_input` | ✓ instrumented, measure after launch |
| 4. Feel first | tunables in `stage.json`: gravity, theta, barSpeed, barSpeedStep, balls, windMax | ✓ |
| 5. One real operator | O11 constrain (declaration) on Kadi | ✓ |
| 6. One cultural mechanic | Kadi, where you must declare "Niko Kadi!" before you're allowed to win | ✓ |
| 7. Social frame by design | S03 challenge link; pass the phone | ✓ |
| 8. Payload designed in | P03; share path in the result sheet | ✓ |
| 9. Rules in one sentence | "Tap when the power bar is right to shoot into the hoops; higher hoops score more." (81 characters) | ✓ |
| 10. Pre-register | block below, dated 2026-10-04 | ✓ |

## Pre-registration

```
Game:                  Hoop Shot
Notation:              D01+D02 | V02+V17 × U01+U13 ⊕ M79+M26 → S03 → P07 [O11 on Kadi]
Chezability score:     Classic 1, Native 4  (V U M S O C)
Primary hypothesis:    Call Your Shot runs have a higher challenge-send rate than Classic runs
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            Hoop Shot Classic (borrowed) variant
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               2026-10-04
```
