# Cap Drop

Slide the caps until the gold cap drops down the chute into the glass.

- **Slug:** `cap-drop` · **Modes:** solo, daily, h2h
- **Score:** higher is better (per-mode rules in `stage.json`) · **Tiebreak:** time
- **Classic:** Chezability 1 · `D01 | V01/V06 × U02 → S01 → P03`
- **Native — Through the Water:** Chezability 3 · `D01 | V01 × U02 ⊕ M32-style constraint → S08 → P02 [O11 on Shisima]`
  On odd-sized boards the gold cap must pass through the centre, the water, before it may exit. Source: Shisima, where a winning line must run through the centre: the water.
- **Integration:** keyboard play (arrows, Enter, Shift+arrows); solver with visited-centre bit and node cap; skins/<brand>.json

Source files: `stage.json` (manifest), `game.js` (stage), `index.html`, `style.css`, `logic.js` (pure rules, unit-tested).

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
| 1. Declare the stack | Classic: `D01 \| V01/V06 × U02 → S01 → P03`<br>Native: `D01 \| V01 × U02 ⊕ M32-style constraint → S08 → P02 [O11 on Shisima]` | ✓ |
| 2. Two-plus uncertainties | 1 U source(s) in the Native notation | ✗ (see notes) |
| 3. First atom in 10 s | first atom: first move; tracked as `run.first_atom`; TTFF as `run.first_input` | ✓ instrumented, measure after launch |
| 4. Feel first | tunables in `stage.json`: hints | ✓ |
| 5. One real operator | O11 constrain (centre rule) on Shisima | ✓ |
| 6. One cultural mechanic | Shisima, where a winning line must run through the centre: the water | ✓ |
| 7. Social frame by design | S03 challenge link; daily board; branded template | ✓ |
| 8. Payload designed in | P02; share path in the result sheet | ✓ |
| 9. Rules in one sentence | "Slide the caps until the gold cap drops down the chute into the glass." (70 characters) | ✓ |
| 10. Pre-register | block below, dated 2026-10-04 | ✓ |

## Pre-registration

```
Game:                  Cap Drop
Notation:              D01 | V01 × U02 ⊕ M32-style constraint → S08 → P02 [O11 on Shisima]
Chezability score:     Classic 1, Native 3  (V U M S O C)
Primary hypothesis:    Through the Water boards have a higher completion-to-replay rate than Classic boards
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            Cap Drop Classic (borrowed) variant
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               2026-10-04
```
