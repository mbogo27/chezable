# Shisima

Move your three water bugs to make a line through the centre.

- **Slug:** `shisima` · **Modes:** solo, daily, pass, link play (turn by turn)
- **Score:** higher is better · **Tiebreak:** fewer moves
- **Classic:** Chezability 4 · `D01 | V06 × U03 ⊕ M57+M32+M38 → S03+S08 → P03 [O04, O10 on Shisima]`
- **Native:** this stage is native as built (Shisima rules), so it serves as the experiment's native control.
- **Integration:** new for MVP: minimax AI, daily starting asymmetry, server-validated correspondence moves

Source files: `stage.json` (manifest), `game.js` (stage), `index.html`, `style.css`, `logic.js` (pure rules, unit-tested).

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
| 1. Declare the stack | Classic: `D01 \| V06 × U03 ⊕ M57+M32+M38 → S03+S08 → P03 [O04, O10 on Shisima]` | ✓ |
| 2. Two-plus uncertainties | 1 U source(s) in the Classic notation | ✗ (see notes) |
| 3. First atom in 10 s | first atom: first move; tracked as `run.first_atom`; TTFF as `run.first_input` | ✓ instrumented, measure after launch |
| 4. Feel first | tunables in `stage.json`: aiDepth | ✓ |
| 5. One real operator | O04, O10 on Shisima | ✓ |
| 6. One cultural mechanic | Shisima, played by the Tiriki of western Kenya. The pieces, imbalavali, are water bugs racing to the water. | ✓ |
| 7. Social frame by design | S03 move-by-move link play; pass the phone | ✓ |
| 8. Payload designed in | P03; share path in the result sheet | ✓ |
| 9. Rules in one sentence | "Move your three water bugs to make a line through the centre." (61 characters) | ✓ |
| 10. Pre-register | block below, dated 2026-10-04 | ✓ |

## Pre-registration

```
Game:                  Shisima
Notation:              D01 | V06 × U03 ⊕ M57+M32+M38 → S03+S08 → P03 [O04, O10 on Shisima]
Chezability score:     4  (V U M S O C)
Primary hypothesis:    Shisima link games reach a finished result at a higher rate than they are abandoned (> 50%)
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            pooled Classic arms of the other stages
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               2026-10-04
```
