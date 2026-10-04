# Apple Slicer

Throw knives through the gap in the spinning spiked ring to slice the apple.

- **Slug:** `apple-slicer` · **Modes:** solo, h2h, pass
- **Score:** higher is better · **Tiebreak:** less total time
- **Classic:** Chezability 1 · `D01+D05 | V02 × U01 ⊕ E20 → S03 → P03`
- **Native — Block Mode:** Chezability 4 · `D01+D12+D13 | V02+V09-style drag × U01+U03 ⊕ M06+M31 → S04+S11 → P01 [O02 on kati]`
  Two players, one phone. One throws; the other spins the ring to block every knife. Then swap. Source: kati, the Kenyan street game where throwers try to hit the dodgers.
- **Integration:** logical 400×700 world; 1/120 s steps; seeded start angle, direction, wobble and reversals; Space to throw; Kati split input (dial drag or arrow keys)

Source files: `stage.json` (manifest), `game.js` (stage), `index.html`, `style.css`.

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
| 1. Declare the stack | Classic: `D01+D05 \| V02 × U01 ⊕ E20 → S03 → P03`<br>Native: `D01+D12+D13 \| V02+V09-style drag × U01+U03 ⊕ M06+M31 → S04+S11 → P01 [O02 on kati]` | ✓ |
| 2. Two-plus uncertainties | 2 U source(s) in the Native notation | ✓ |
| 3. First atom in 10 s | first atom: first apple sliced; tracked as `run.first_atom`; TTFF as `run.first_input` | ✓ instrumented, measure after launch |
| 4. Feel first | tunables in `stage.json`: knives, throwSpeed, omegaBase, omegaPerKnife, omegaPerCut, gapStart, gapPerCut, gapMin, wobbleFrom, reverseFrom, reverseRate, katiGap, katiMaxOmega, katiDrift | ✓ |
| 5. One real operator | O02 (obstacle becomes a player) on kati | ✓ |
| 6. One cultural mechanic | kati, the Kenyan street game where throwers try to hit the dodgers | ✓ |
| 7. Social frame by design | S03 challenge link; S04+S11 Block Mode (pass the phone, thrower vs ring) | ✓ |
| 8. Payload designed in | P03; share path in the result sheet | ✓ |
| 9. Rules in one sentence | "Throw knives through the gap in the spinning spiked ring to slice the apple." (76 characters) | ✓ |
| 10. Pre-register | block below, dated 2026-10-04 | ✓ |

## Pre-registration

```
Game:                  Apple Slicer
Notation:              D01+D12+D13 | V02+V09-style drag × U01+U03 ⊕ M06+M31 → S04+S11 → P01 [O02 on kati]
Chezability score:     Classic 1, Native 4  (V U M S O C)
Primary hypothesis:    Block Mode matches have a higher rematch rate than Classic pass-the-phone matches
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            Apple Slicer Classic (borrowed) variant
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               2026-10-04
```
