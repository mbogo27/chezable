# Toka

Tap arrows to slide them off the board, without letting one hit another.

- **Slug:** `toka` · **Modes:** solo, daily, h2h
- **Score:** higher is better (per-mode rules in `stage.json`) · **Tiebreak:** time to clear
- **Classic:** Chezability 1 · `D01+D08 | V01 × U02 → S01+S08 → P03`
- **Native — Giuthi arrows:** Chezability 3 · `D08+D01 | V01 × U02+U06 ⊕ M61 → S08 → P02 [O08 on Giuthi]`
  Double-headed arrows don't cost a heart when blocked: they reverse and leave by the tail. Blocked both ways, they stay put. Source: Giuthi, where sowing reverses direction when the last seed lands in an occupied pit.
- **Integration:** keyboard focus ring (arrows + Enter); bump flash reduced to one 300 ms flash; generator proves solvability with reversing arrows

Source files: `stage.json` (manifest), `game.js` (stage), `index.html`, `style.css`, `logic.js` (pure rules, unit-tested).

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
| 1. Declare the stack | Classic: `D01+D08 \| V01 × U02 → S01+S08 → P03`<br>Native: `D08+D01 \| V01 × U02+U06 ⊕ M61 → S08 → P02 [O08 on Giuthi]` | ✓ |
| 2. Two-plus uncertainties | 2 U source(s) in the Native notation | ✓ |
| 3. First atom in 10 s | first atom: first arrow out; tracked as `run.first_atom`; TTFF as `run.first_input` | ✓ instrumented, measure after launch |
| 4. Feel first | tunables in `stage.json`: hearts, hints | ✓ |
| 5. One real operator | O08 on Giuthi (direction-reversing move) | ✓ |
| 6. One cultural mechanic | Giuthi, where sowing reverses direction when the last seed lands in an occupied pit | ✓ |
| 7. Social frame by design | S03 challenge link; daily board | ✓ |
| 8. Payload designed in | P02; share path in the result sheet | ✓ |
| 9. Rules in one sentence | "Tap arrows to slide them off the board, without letting one hit another." (72 characters) | ✓ |
| 10. Pre-register | block below, dated 2026-10-04 | ✓ |

## Pre-registration

```
Game:                  Toka
Notation:              D08+D01 | V01 × U02+U06 ⊕ M61 → S08 → P02 [O08 on Giuthi]
Chezability score:     Classic 1, Native 3  (V U M S O C)
Primary hypothesis:    Giuthi daily boards have a higher session-replay rate than Classic daily boards
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            Toka Classic (borrowed) variant
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               2026-10-04
```
