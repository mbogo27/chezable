// Writes games/<slug>/README.md from stage.json: the Chezability charter checklist (spec §8.2) and the
// pre-registration block (spec §11.3, Chezability §17). Re-run after editing a stage.json.
//   node scripts/readmes.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATE = '2026-10-04';

// per-game facts the manifest doesn't hold
const EXTRA = {
  'apple-slicer': { atom: 'first apple sliced', social: 'S03 challenge link; S04+S11 Block Mode (pass the phone, thrower vs ring)', operator: 'O02 (obstacle becomes a player) on kati', hyp: 'Block Mode matches have a higher rematch rate than Classic pass-the-phone matches', integration: 'logical 400×700 world; 1/120 s steps; seeded start angle, direction, wobble and reversals; Space to throw; Kati split input (dial drag or arrow keys)' },
  'cut-in-half': { atom: 'first cut within 8 cm', social: 'S03 challenge link; pass the phone', operator: 'O05 hide/reveal on Igisoro', hyp: 'No Numbers runs have a higher session-replay rate than Classic runs', integration: 'seeded saw phase and per-round speed jitter; 1/120 s steps; Space/Enter to cut; pass the phone moved to the shell (same seed for both players)' },
  'hoop-shot': { atom: 'first ball scored', social: 'S03 challenge link; pass the phone', operator: 'O11 constrain (declaration) on Kadi', hyp: 'Call Your Shot runs have a higher challenge-send rate than Classic runs', integration: 'constant 1/240 s physics; seeded bar phase and wind per shot; call chips (1–5 keys); Space to shoot' },
  'nyanya-jetpack': { atom: 'first 50 m', social: 'S03 challenge link with ghost; S13 rescue by a friend', operator: 'O10 add a social frame on kati', hyp: 'H3: Rescue (Okoa) produces more new-player recruits per crash than Classic challenges (spec §11.3)', integration: 'course and mines from the run seed; hold/release tick log; ghost replay at 40% opacity; revive challenges' },
  'arrow-puzzle': { atom: 'first arrow out', social: 'S03 challenge link; daily board', operator: 'O08 on Giuthi (direction-reversing move)', hyp: 'Reversing Arrows daily boards have a higher session-replay rate than Classic daily boards', integration: 'keyboard focus ring (arrows + Enter); bump flash reduced to one 300 ms flash; generator proves solvability with reversing arrows' },
  'cap-drop': { atom: 'first move', social: 'S03 challenge link; daily board; branded template', operator: 'O11 constrain (centre rule) on Shisima', hyp: 'Through the Water boards have a higher completion-to-replay rate than Classic boards', integration: 'keyboard play (arrows, Enter, Shift+arrows); solver with visited-centre bit and node cap; skins/<brand>.json' },
  'lemon-squeeze': { atom: 'first clean cut', social: 'S03 challenge link; Place the Flies (sender sets the board)', operator: 'O02+O07 on Kiothi (pre-game redistribution)', hyp: 'Place the Flies challenges have a higher return-challenge rate than Classic challenges', integration: '1/60 s fly movement from the run RNG; juice credited from piece area (screen-independent); keyboard aim line; fly-placement editor' },
  'water-bugs': { atom: 'first move', social: 'S03 move-by-move link play; pass the phone', operator: 'O04, O10 on Shisima', hyp: 'Water Bugs link games reach a finished result at a higher rate than they are abandoned (> 50%)', integration: 'new for MVP: minimax AI, daily starting asymmetry, server-validated correspondence moves' },
};

const L = (o) => (o && (o.en || o)) || '';
for (const dir of await readdir(path.join(root, 'games'))) {
  const f = path.join(root, 'games', dir, 'stage.json');
  if (!existsSync(f)) continue;
  const g = JSON.parse(await readFile(f, 'utf8'));
  const x = EXTRA[g.id] || {};
  const nat = g.variants.native, cls = g.variants.classic;
  const v = nat || cls;
  const uCount = (v.notation.split('×')[1] || '').split('⊕')[0].split('+').filter((s) => /U\d/.test(s)).length;
  const rows = [
    ['1. Declare the stack', `Classic: \`${cls.notation}\`${nat ? `<br>Native: \`${nat.notation}\`` : ''}`, '✓'],
    ['2. Two-plus uncertainties', `${uCount} U source(s) in the ${nat ? 'Native' : 'Classic'} notation`, uCount >= 2 ? '✓' : '✗ (see notes)'],
    ['3. First atom in 10 s', `first atom: ${x.atom}; tracked as \`run.first_atom\`; TTFF as \`run.first_input\``, '✓ instrumented, measure after launch'],
    ['4. Feel first', `tunables in \`stage.json\`: ${Object.keys(g.tunables || {}).join(', ') || '–'}`, '✓'],
    ['5. One real operator', x.operator || '–', nat || g.id === 'water-bugs' ? '✓' : '✗'],
    ['6. One cultural mechanic', L((nat || cls).source) || '–', '✓'],
    ['7. Social frame by design', x.social || '–', '✓'],
    ['8. Payload designed in', `${(g.share && g.share.payload) || 'P03'}; share path in the result sheet`, '✓'],
    ['9. Rules in one sentence', `"${L(g.rule)}" (${L(g.rule).length} characters)`, L(g.rule).length <= 120 ? '✓' : '✗ over 120'],
    ['10. Pre-register', `block below, dated ${DATE}`, '✓'],
  ];
  const md = `# ${L(g.title)}

${L(g.rule)}

- **Slug:** \`${g.id}\` · **Modes:** ${g.modes.join(', ')}${g.turnBased ? ', link play (turn by turn)' : ''}
- **Score:** ${g.score.order === 'asc' ? 'lower is better' : 'higher is better'}${g.score.modes ? ' (per-mode rules in `stage.json`)' : ''} · **Tiebreak:** ${L(g.tiebreak) || 'none'}
- **Classic:** Chezability ${cls.chezability} · \`${cls.notation}\`
${nat ? `- **Native — ${L(nat.label)}:** Chezability ${nat.chezability} · \`${nat.notation}\`\n  ${L(nat.desc)} Source: ${L(nat.source)}.` : '- **Native:** this stage is native as built (the rules of Shisima, a Kenyan game), so it serves as the experiment\'s native control.'}
- **Integration:** ${x.integration || ''}

Source files: \`stage.json\` (manifest), \`game.js\` (stage), \`index.html\`, \`style.css\`${existsSync(path.join(root, 'games', dir, 'logic.js')) ? ', `logic.js` (pure rules, unit-tested)' : ''}${existsSync(path.join(root, 'games', dir, 'sim.js')) ? ', `sim.js` (pure simulation, unit-tested)' : ''}.

## Charter checklist (spec §8.2)

| Charter item | This stage | Check |
|---|---|---|
${rows.map((r) => `| ${r.map((c) => String(c).replaceAll('|', '\\|')).join(' | ')} |`).join('\n')}

## Pre-registration

\`\`\`
Game:                  ${L(g.title)}
Notation:              ${v.notation}
Chezability score:     ${nat ? `Classic ${cls.chezability}, Native ${nat.chezability}` : cls.chezability}  (V U M S O C)
Primary hypothesis:    ${x.hyp}
Falsifier:             the Native arm is no better than the Classic arm on the primary metric (95% interval includes 0 or is negative)
Comparison:            ${nat ? `${L(g.title)} Classic (borrowed) variant` : 'pooled Classic arms of the other stages'}
Sample / window:       first 4 weeks after launch, or 1,000 finished runs per arm, whichever is later
Analysis:              difference in proportions with a 95% interval; cohort = first-assigned variant (players.variant_cohort)
Result (publish win or loss): pending
Written:               ${DATE}
\`\`\`
`;
  await writeFile(path.join(root, 'games', dir, 'README.md'), md);
  console.log('wrote games/' + dir + '/README.md');
}
