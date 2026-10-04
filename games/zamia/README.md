# Zamia

Dive the wreck with rival divers, grab treasure, and get back before the air or Papa the shark runs out your luck.

- **Slug:** `zamia` · **Modes:** daily, solo, h2h
- **Score:** higher is better · **Tiebreak:** fewer treasures fed to Papa
- **Classic:** Chezability 2 · `D01+D02 | V12 × U13+U03 ⊕ M39 → S07+S08 → P03 [O04, O15]`
- **Native — Kiothi seeding:** Chezability 3 · `D01+D02 | V12+V06 × U13+U03+U06 ⊕ M39+M22 → S07+S08 → P02 [O04 on Kiothi]`
  Before dive 1 you may move one tile anywhere in the trench. Lift gold shallow for a safer grab, but rivals can take it too. Source: Kiothi, where one pit's seeds may be redistributed anywhere before play begins.
- **Integration:** daily seed from the API; per-dive RNG streams for you and each rival; resume after reload at dive boundaries; P02 emoji grid

Source files: `stage.json` (manifest), `game.js` (stage), `index.html`, `style.css`.

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
| 1. Declare the stack | Classic: `D01+D02 \| V12 × U13+U03 ⊕ M39 → S07+S08 → P03 [O04, O15]`<br>Native: `D01+D02 \| V12+V06 × U13+U03+U06 ⊕ M39+M22 → S07+S08 → P02 [O04 on Kiothi]` | ✓ |
| 2. Two-plus uncertainties | 3 U source(s) in the Native notation | ✓ |
| 3. First atom in 10 s | first atom: first treasure taken; tracked as `run.first_atom`; TTFF as `run.first_input` | ✓ instrumented, measure after launch |
| 4. Feel first | tunables in `stage.json`: dives, air, leakAir | ✓ |
| 5. One real operator | O04 on Kiothi (free pre-game seeding) | ✓ |
| 6. One cultural mechanic | Kiothi, where one pit's seeds may be redistributed anywhere before play begins | ✓ |
| 7. Social frame by design | S03 challenge link; daily board | ✓ |
| 8. Payload designed in | P02; share path in the result sheet | ✓ |
| 9. Rules in one sentence | "Dive the wreck with rival divers, grab treasure, and get back before the air or Papa the shark runs out your luck." (114 characters) | ✓ |
| 10. Pre-register | block below, dated 2026-10-04 | ✓ |

## Pre-registration

```
Game:                  Zamia
Notation:              D01+D02 | V12+V06 × U13+U03+U06 ⊕ M39+M22 → S07+S08 → P02 [O04 on Kiothi]
Chezability score:     Classic 2, Native 3  (V U M S O C)
Primary hypothesis:    Kiothi-seeded daily runs have a higher session-replay rate than Classic daily runs
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            Zamia Classic (borrowed) variant
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               2026-10-04
```
