# Kata Ndimu

Swipe to cut the lemon and drain the pieces without flies into the glass.

- **Slug:** `kata-ndimu` · **Modes:** solo, h2h
- **Score:** higher is better · **Tiebreak:** fewer total cuts
- **Classic:** Chezability 1 · `D05+D01 | V05/V08 × U01 → S01 → P01`
- **Native — Panga Nzi:** Chezability 4 · `D01+D12 | V05+V06 × U01+U03 ⊕ M22 → S03 → P03 [O02+O07 on Kiothi]`
  When you send a challenge, you place the flies first. Your layout becomes your friend's board. Source: Kiothi, where a player may redistribute one pit's seeds anywhere on the board before play.
- **Integration:** 1/60 s fly movement from the run RNG; juice credited from piece area (screen-independent); keyboard aim line; fly-placement editor

Source files: `stage.json` (manifest), `game.js` (stage), `index.html`, `style.css`.

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
| 1. Declare the stack | Classic: `D05+D01 \| V05/V08 × U01 → S01 → P01`<br>Native: `D01+D12 \| V05+V06 × U01+U03 ⊕ M22 → S03 → P03 [O02+O07 on Kiothi]` | ✓ |
| 2. Two-plus uncertainties | 2 U source(s) in the Native notation | ✓ |
| 3. First atom in 10 s | first atom: first clean cut; tracked as `run.first_atom`; TTFF as `run.first_input` | ✓ instrumented, measure after launch |
| 4. Feel first | tunables in `stage.json`: capacity, flyR, maxFlies | ✓ |
| 5. One real operator | O02+O07 on Kiothi (pre-game redistribution) | ✓ |
| 6. One cultural mechanic | Kiothi, where a player may redistribute one pit's seeds anywhere on the board before play | ✓ |
| 7. Social frame by design | S03 challenge link; Panga Nzi (sender sets the board) | ✓ |
| 8. Payload designed in | P03; share path in the result sheet | ✓ |
| 9. Rules in one sentence | "Swipe to cut the lemon and drain the pieces without flies into the glass." (73 characters) | ✓ |
| 10. Pre-register | block below, dated 2026-10-04 | ✓ |

## Pre-registration

```
Game:                  Kata Ndimu
Notation:              D01+D12 | V05+V06 × U01+U03 ⊕ M22 → S03 → P03 [O02+O07 on Kiothi]
Chezability score:     Classic 1, Native 4  (V U M S O C)
Primary hypothesis:    Panga Nzi challenges have a higher return-challenge rate than Classic challenges
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            Kata Ndimu Classic (borrowed) variant
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               2026-10-04
```
