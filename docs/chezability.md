---
title: Chezability
subtitle: The playability bedrock of Chezable
aliases: [Chezability, playability, game primitives library, Chezable primitives]
version: 0.1
date: 2026-10-03
status: draft — harvested, deduplicated, not yet play-tested
related: [[Chezable]], [[Hook Library]], [[Network Effects Loop Library]], [[Kiwanda]], [[casual-games]]
---

# Chezability

*Chezability (from* cheza*, to play): the property of a design that makes it playable, replayable and shareable. This document is the primitive library Chezable games are built from.*

---

## 0. Purpose and honest bound

The first four Chezable builds (Cut it in half, Nyanya Jetpack, Kata Ndimu, Zamia) borrowed most of their layers from TikTok effects and existing games. Chezability is the fix. It is a deduplicated set of game primitives harvested from game-design literature, tabletop and video games, and Kenyan and East African traditional games. It also includes a notation for combining them and the operators that turn borrowed parts into new games.

It is the third library in the family:

| Library | Answers | Unit | Success metric |
|---|---|---|---|
| [[Hook Library]] | Why does a scroll stop? | mechanism → grammar → instantiation → payload | advance rate |
| [[Network Effects Loop Library]] | Why does value rise with others? | loop atom | retention vs connected others |
| **Chezability** | Why does play start, continue and spread? | primitive × operator × source | replay, challenge-send and clip rates |

**Honest bound.** The notation generates candidates. It cannot predict fun. Only play data can, the same way only advance rate validates a hook. Every seed in this document is a hypothesis until it has numbers.

---

## 1. The thesis in six lines

1. Input verbs are nearly exhausted. Originality almost never comes from a new verb.
2. Breakouts come from applying an **operator** to old primitives: remove a verb, share an input, synchronise a board, invert a goal, add physics. Wordle, roll-and-write, Vampire Survivors, Suika and Yavalath all fit this pattern.
3. Recombination is a proven route to novelty. Browne's LUDI system evolved new games from encoded rule fragments, and one of them, Yavalath, was commercially published and ranked among the best abstract games (§19).
4. Every game is a stack of **uncertainty** sources. A game with one source is thin, and good games declare two or more.
5. **Cultural mechanics beat cultural skins.** A Kenyan tomato on Jetpack Joyride is a skin. Giuthi's direction-reversing multilap sowing is a mechanic that almost no casual game has.
6. The **social frame** is where Chezable's network effects attach. Design it in from the start rather than adding it afterwards.

---

## 2. The Chezability stack

| Code | Layer | Question it answers | Harvested from |
|---|---|---|---|
| **D** | Play drive | Why do people want this? | Caillois; MDA aesthetics; Lazzaro; Cheska's classification as used in Kenyan studies |
| **V** | Verb | What does the player physically do? | Järvinen; Sicart; Anthropy & Clark; folk games |
| **U** | Uncertainty | What makes the outcome unknown? | Costikyan; Elias, Garfield & Gutschera; Engelstein & Shalev |
| **K** | Skill loop | What is being learned, and how deep does it go? | Cook (skill atoms); Koster; Lantz et al. (depth); Isaksen et al. |
| **M** | Mechanism | What rule structures run the game? | Engelstein & Shalev; BGG mechanics; Björk & Holopainen; folk and digital games |
| **E** | Economy | How do resources flow? | Adams & Dormans (Machinations) |
| **F** | Feel | How does it feel in the hand? | Swink; Juul (casual); Nealen et al. (minimalism) |
| **S** | Social frame | Who plays with whom, when? | Folk games; party and digital games; [[Network Effects Loop Library]] |
| **P** | Payload | What leaves the session and travels? | [[Hook Library]]; Wordle; TikTok |
| **O** | Operator | What transformation makes it new? | Browne (LUDI, ludemes); game history; Isaksen (game-space tuning) |
| **C** | Cultural source | Where does the mechanic come from? | Kenyan and East African games; everyday Kenyan life |

### 2.1 Notation

Same chemistry logic as the Hook Library:

```
D-drive | V × U ⊕ M → S → P   [O applied to C]
```

| Symbol | Meaning | Origin |
|---|---|---|
| `×` | combines (verb with uncertainty) | Hook Library |
| `⊕` | adds a mechanism | Hook Library |
| `→` | instantiates (a higher pattern is realised by a lower one) | Björk & Holopainen |
| `~` | modulates (changes the character of another primitive) | Björk & Holopainen |
| `⊥` | potentially conflicts (e.g. perfect information ⊥ hidden information) | Björk & Holopainen |
| `[O..]` | operator applied | Chezability |

Example, Zamia: `D01+D02 | V12 × U13+U03 ⊕ M40 → S07+S08 → P03  [O04]`

---

## 3. Layer D: Play drives

Deduplicated across Caillois's four play types, the eight MDA aesthetics, Lazzaro's four keys to fun, Bartle's player types, and Cheska's classification as applied to Akamba and Gusii games. The Kenyan studies add three drives that Western taxonomies under-name: detection, malevolence and survival.

| ID | Drive | Plain meaning | Merged from | Kenyan exemplar |
|---|---|---|---|---|
| D01 | Agon | competing, beating someone or something | Caillois agon; MDA challenge; Lazzaro hard fun | Bao, kati |
| D02 | Alea | surrendering to fate and chance | Caillois alea; Cheska "chance only" | stone toss and luck rounds |
| D03 | Mimicry | pretending, playing a role | Caillois mimicry; MDA fantasy; Cheska imagination and simulation | kalongolongo |
| D04 | Ilinx | vertigo, pleasurable disorder | Caillois ilinx | spinning games; physics chaos |
| D05 | Sensation | pleasure of senses and juice | MDA sensation | — |
| D06 | Narrative | drama unfolding | MDA narrative | told-after stories |
| D07 | Fellowship | being together | MDA fellowship; Lazzaro people fun; Bartle socialisers; Cheska group interaction | most folk games |
| D08 | Discovery | exploring the unknown | MDA discovery; Lazzaro easy fun; Bartle explorers | — |
| D09 | Expression | self-expression and making | MDA expression | drawing on the whiteboard |
| D10 | Pastime | low-stakes time-filling | MDA submission | idle play |
| D11 | Detection | finding the hidden | Cheska/Gusii detection games | brikicho |
| D12 | Malevolence | sanctioned mischief, hitting or tricking others | Gusii malevolence; Bartle killers | kati hits; Enkeshui illegal-move tolerance |
| D13 | Survival | staying in, staying alive | Gusii survival games | kati dodgers |
| D14 | Rhythm & song | play bound to chant, beat or body | Cheska rhythm and singing (Akamba) | brikicho chant; rope games |
| D15 | Meaning | play that changes something real | Lazzaro serious fun | chama-style stakes |

**Modifier: paidia ↔ ludus** (Caillois). This is the dial from free improvisation to strict rules. Most digital casual games sit near ludus. Folk play, like the whiteboard games, sits near paidia. Chezable can exploit the gap.

---

## 4. Layer V: Verbs

A mechanic is something the player invokes to act on the game state (Sicart's definition). Järvinen frames mechanics as verbs. Inputs below are phone, physical and phygital.

| ID | Verb | Notes | Example |
|---|---|---|---|
| V01 | Tap | discrete trigger | Flappy |
| V02 | Tap-to-stop | timing against motion | Cut it in half |
| V03 | Hold / charge | continuous input, variable output | Nyanya Jetpack |
| V04 | Release | the moment of letting go | slingshots |
| V05 | Swipe / slash | directional gesture | Kata Ndimu, Fruit Ninja |
| V06 | Drag / place | position an object | Tetris, tile laying |
| V07 | Aim-and-flick | vector plus power | **bano**, carrom |
| V08 | Trace / draw | freeform path | line-drawing puzzles |
| V09 | Tilt | device orientation | marble mazes |
| V10 | Shake | device motion | dice shakers |
| V11 | Voice / blow | microphone input | candle games |
| V12 | Choose | select among options | Zamia go/return |
| V13 | Sow / distribute | spread units one by one along a path | **mancala family** |
| V14 | Merge | combine like with like | 2048, Suika |
| V15 | Rotate | turn a piece or the world | Tetris |
| V16 | Pass | hand control (or the phone) to another | hot-seat |
| V17 | Call / declare | speak an announcement that has rule force | **"Niko Kadi!"**, Uno; **brikicho** call |
| V18 | Bid | commit a value competitively | auctions |
| V19 | Hide | conceal self or object | **brikicho** |
| V20 | Seek / reveal | uncover (flip, scratch, search) | memory |
| V21 | Toss-and-gather | throw up, collect, catch | jacks-family stone games |
| V22 | Dodge | avoid an incoming threat | **kati** |
| V23 | Throw | project at a target | **kati** throwers |
| V24 | Jump | clear a threshold | **blada** |
| V25 | Wait | deliberate inaction as a move | push-your-luck stays |
| V26 | Count / estimate | judge quantity | mancala (and its taboo in Igisoro) |
| V27 | Vote / point | collective choice | Werewolf, Jackbox |
| V28 | Capture (camera) | photograph or scan the world | AR, scavenger hunts |

---

## 5. Layer U: Uncertainty

Costikyan argues that uncertainty is what makes games engaging. He catalogues sources including performative uncertainty, analytic complexity, hidden information, narrative and development anticipation, and perception. Engelstein & Shalev split randomness into *input* (before you decide) and *output* (after you decide).

| ID | Source | Meaning | Example | Compound of |
|---|---|---|---|---|
| U01 | Performative | Can I execute? | Flappy, bano flicks | — |
| U02 | Solver | Can I find the solution? | daily puzzles | — |
| U03 | Player unpredictability | What will they do? | Shisima, Bao | — |
| U04 | Input randomness | random state, then decide | roll-and-write | — |
| U05 | Output randomness | decide, then random result | dice combat | — |
| U06 | Analytic complexity | too many branches to see | Bao, Giuthi multilap | — |
| U07 | Hidden information | facts I can't see | Kadi hands | — |
| U08 | Narrative anticipation | what happens next in the story | — | — |
| U09 | Development anticipation | what I'll unlock or become | meta-progression | — |
| U10 | Perception | can I see or judge it correctly? | **Igisoro's no-counting norm** | — |
| U11 | Semiotic | what does this symbol mean? | rule-discovery games | — |
| U12 | Schedule | when the world (or a friend) returns | async challenges, Cityville | — |
| U13 | Push-your-luck | continue or bank against escalating risk | Zamia, Can't Stop | U04/U05 + V12 |
| U14 | Bluff | belief about intent and hidden facts | poker, Enkeshui cheating | U03 + U07 |

**Rule:** every Chezable game declares its U-stack. One source means a toy. Two or three is the target.

---

## 6. Layer K: Skill loops and depth

| ID | Primitive | Meaning | Source |
|---|---|---|---|
| K01 | Skill atom | Action → Simulation → Feedback → Modeling. The player acts, the game updates, the player sees the change and updates their mental model. | Cook 2007 |
| K02 | Skill chain | Atoms depend on earlier atoms, so mastery builds in a graph | Cook 2007 |
| K03 | Burnout | an atom is mastered and no longer generates interest | Cook 2007 |
| K04 | Broken chain | the player cannot learn a needed atom, so frustration and quitting follow | Cook 2007; Koster |
| K05 | Strategy ladder | depth is the number of distinct skill levels a game supports between novice and master | Lantz et al. 2017 |
| K06 | Hazard curve | probability of failing at each point, measured by survival analysis | Isaksen et al. 2015/2018 |
| K07 | Loop length | seconds (core), minutes (session), days (meta) | Cook (loops and arcs) |
| K08 | Empirical chain | the real skill chain, elicited from play data rather than designer intent | Horn et al. (cognitive task analysis) |

**Chezable targets:** close the first skill atom within 10 seconds. Every game needs at least three rungs on its ladder so the day-30 player is still learning.

---

## 7. Layer M: Mechanism catalogue

Organised by the 13 chapters of Engelstein & Shalev's *Building Blocks of Tabletop Game Design*: structure, turn order, actions, resolution, game end, uncertainty, economics, auctions, worker placement, movement, area control, set collection and cards. Digital-native and folk families are appended. Björk & Holopainen catalogue 296 patterns; this layer folds them into these families rather than listing all 296 (see §18).

### 7.1 Structure
| ID | Mechanism | Example |
|---|---|---|
| M01 | Competitive | most games |
| M02 | Cooperative | Pandemic |
| M03 | Team vs team | police & robber |
| M04 | Semi-cooperative / traitor | Battlestar Galactica |
| M05 | Solo vs system | Zamia solo |
| M06 | Asymmetric roles | **kati** (2 throwers vs many dodgers) |
| M07 | Legacy / persistent change | Risk Legacy |
| M08 | Campaign / episodic | daily trench series |

### 7.2 Turn order and structure
| ID | Mechanism | Example |
|---|---|---|
| M09 | Fixed rotation | Shisima |
| M10 | Simultaneous action | rock-paper-scissors |
| M11 | Real-time | kati, arcade |
| M12 | Bid / pay for turn order | auctions for position |
| M13 | Time track (furthest-behind moves) | Tokaido |
| M14 | Interrupt / reaction | **Kadi** penalty counters |
| M15 | Extra turn / continuation | **Mbothe** capture grants another turn |
| M16 | Phased game (rules change by phase) | **Bao** namua → mtaji phases |

### 7.3 Actions
| ID | Mechanism | Example |
|---|---|---|
| M17 | Action points | Pandemic |
| M18 | Action drafting / role selection | Puerto Rico |
| M19 | Rondel | Antike |
| M20 | Programmed actions | RoboRally |
| M21 | Variable player powers | Cosmic Encounter |
| M22 | Free pre-game seeding | **Kiothi** (one pit redistributed anywhere); **Igisoro** chosen start |

### 7.4 Resolution
| ID | Mechanism | Example |
|---|---|---|
| M23 | Dice / random check | most RPGs |
| M24 | Stat comparison | Top Trumps |
| M25 | Rock-paper-scissors | — |
| M26 | Dexterity resolution | **bano**, carrom, Jenga |
| M27 | Voting | Werewolf |
| M28 | Opponent-as-referee | **Enkeshui**: catching illegal moves is the opponent's job |

### 7.5 Game end and victory
| ID | Mechanism | Example |
|---|---|---|
| M29 | Race | Ludo |
| M30 | Points | most Euros |
| M31 | Elimination / last standing | **kati** |
| M32 | Pattern formation (n-in-a-row) | **Shisima** (line must pass through centre) |
| M33 | Capture majority | **mancala** family |
| M34 | Shedding (empty your hand) | **Kadi** |
| M35 | Inverted goal (misère) | Yavalath (four wins, three loses) |
| M36 | Two-stage win (earn, then finish) | **bano** (strike rival, then sink own) |
| M37 | Catch-up / rubber band | Mario Kart items |
| M38 | Repetition draw | **Shisima** (thrice-repeated moves = tie) |

### 7.6 Uncertainty mechanisms
| ID | Mechanism | Example |
|---|---|---|
| M39 | Push your luck | Zamia, Can't Stop |
| M40 | Hidden roles | Werewolf |
| M41 | Bluffing | Coup; Enkeshui illegal moves |
| M42 | Deduction | Clue, Mastermind, Wordle |
| M43 | Memory | concentration |
| M44 | Perception constraint | **Igisoro** masters never count openly |

### 7.7 Economics
| ID | Mechanism | Example |
|---|---|---|
| M45 | Income / engine | Splendor |
| M46 | Trading / negotiation | Catan; haggling |
| M47 | Market / price track | Power Grid |
| M48 | Loans / debt | — |
| M49 | Upgrades | roguelites |
| M50 | Feeding obligation | **Mbothe**: must replenish an empty opponent |

### 7.8 Auctions
Engelstein & Shalev catalogue about 18 auction types. These five are the core.

| ID | Mechanism |
|---|---|
| M51 | Open ascending (English) |
| M52 | Sealed bid |
| M53 | Descending (Dutch) |
| M54 | Once-around |
| M55 | All-pay |

### 7.9 Worker placement
| ID | Mechanism | Example |
|---|---|---|
| M56 | Worker placement (blocking spaces) | Agricola |

### 7.10 Movement
| ID | Mechanism | Example |
|---|---|---|
| M57 | Point-to-point along lines | **Shisima** |
| M58 | Roll-and-move | Snakes & Ladders |
| M59 | Sowing (distribute units one per space) | **all mancala** |
| M60 | Relay / multilap sowing | **Bao, Omweso, Igisoro, Mbothe** |
| M61 | Direction-reversing multilap | **Giuthi** |
| M62 | Either-direction sowing | **Giuthi** |
| M63 | Reverse-capture sow | **Omweso** |
| M64 | Pick-up and deliver | Firefly |
| M65 | Physical (flick / dexterity) movement | **bano** |

### 7.11 Area control
| ID | Mechanism | Example |
|---|---|---|
| M66 | Area majority | El Grande |
| M67 | Enclosure | Go |
| M68 | Protected cells | **Mbothe** (exactly-2 pits skipped); **Kiothi** (pits immune until first sown) |

### 7.12 Set collection and tiles
| ID | Mechanism | Example |
|---|---|---|
| M69 | Set collection | rummy |
| M70 | Drafting (pick and pass) | 7 Wonders |
| M71 | Tile laying / pattern building | Carcassonne, Azul |

### 7.13 Card mechanisms
| ID | Mechanism | Example |
|---|---|---|
| M72 | Hand management | most card games |
| M73 | Deckbuilding | Dominion, Slay the Spire |
| M74 | Trick-taking / follow suit | whist |
| M75 | Ladder climbing | Tichu |
| M76 | Match suit/rank shedding | **Kadi**, Crazy Eights |
| M77 | Question–answer pairing | **Kadi** (8s and Queens must be answered) |
| M78 | Penalty stacking / counter-chain | **Kadi** 2s and 3s |
| M79 | Declaration requirement | **"Niko Kadi!"** before the winning move |
| M80 | Chain finish (win by dumping a legal chain in one move) | **Kadi** |

### 7.14 Digital-native families
| ID | Mechanism | Example |
|---|---|---|
| M81 | Merge | 2048, Suika |
| M82 | Corridor / endless runner | Jetpack Joyride, Nyanya Jetpack |
| M83 | Auto-action (attack removed from player) | Vampire Survivors |
| M84 | Multiplier combo engine | Balatro |
| M85 | Physics stacking | Stack, Suika |
| M86 | Rhythm / beat match | rhythm games |
| M87 | Shared random input, private choices | roll-and-write |
| M88 | Daily seeded single board | Wordle, Zamia daily trench |
| M89 | Roguelite run + meta-progression | Hades |
| M90 | Idle / incremental | Cookie Clicker |
| M91 | Phone-as-controller party | Jackbox |
| M92 | Spoiler-free result share | Wordle grid |

### 7.15 Folk and childhood families (East African emphasis)
| ID | Mechanism | Example |
|---|---|---|
| M93 | Call-and-response readiness check | **brikicho** ("Brikicho?" "Banture!" until silence) |
| M94 | Home-base touch = safe | **brikicho** (grab the base stick before being caught) |
| M95 | Rescue by catch | **kati** (catching the ball brings an eliminated player back) |
| M96 | Jail and jailbreak | police & robber |
| M97 | Escalating threshold | **blada**, elastics |
| M98 | Gauntlet / guarded margin | **shake** |
| M99 | Progressive gather rounds | jacks-family stone tossing |
| M100 | For-keeps stakes | **bano** (keep what you win) |
| M101 | Optional capture with spoken pass | **Igisoro** ("ndahise", I pass) |
| M102 | Countdown survival variant | **kati** (last dodger vs a countdown) |

---

## 8. Layer E: Economy and flow (Machinations)

Machinations represents a game's internal economy as resources flowing between nodes. Its feedback loops drive much of the emergent behaviour (Dormans 2011; Adams & Dormans 2012). Use this layer for cross-game coins, chama-style commons and engines.

### 8.1 Elements
| ID | Element | Role |
|---|---|---|
| E01 | Pool | holds resources (Zamia's shared air) |
| E02 | Source | creates resources |
| E03 | Drain | destroys resources |
| E04 | Converter | turns one resource into another |
| E05 | Trader | exchanges between parties |
| E06 | Gate | distributes flow, deterministically or randomly |
| E07 | Delay | holds a flow for time |
| E08 | Queue | releases one at a time |
| E09 | Register | displays or computes a value |
| E10 | End condition | triggers game end |
| E11 | Artificial player | scripted decisions for simulation |

### 8.2 Recurrent patterns
| ID | Pattern | Use in Chezable |
|---|---|---|
| E12 | Static engine | steady coin drip |
| E13 | Dynamic engine | invest to grow income |
| E14 | Converter engine | coins → boosts → score |
| E15 | Engine building | the core of deckbuilders |
| E16 | Static friction | flat cost per session |
| E17 | Dynamic friction | cost rises as you win (anti-snowball) |
| E18 | Stopping mechanism | diminishing returns |
| E19 | Attrition | players drain each other (kati, captures) |
| E20 | Escalating challenge | difficulty rises with success |
| E21 | Escalating complications | complexity rises over time |
| E22 | Playing-style reinforcement | your choices shape your build |
| E23 | Multiple feedback | stacked loops |
| E24 | Trade | player-to-player exchange |
| E25 | Slow cycle | periodic resets (daily trench) |
| E26 | Arms race | escalation between players |

**Cross-game coins:** design them as a converter engine with a stopping mechanism (E14 + E18). Coins only produce a network effect if they convert into something worth having in another game.

---

## 9. Layer F: Feel

| ID | Primitive | Meaning | Source |
|---|---|---|---|
| F01 | Input | the physical control | Swink |
| F02 | Response | how the game reacts in real time | Swink |
| F03 | Context | the space the response plays out in | Swink |
| F04 | Polish | effects that sell the interaction (juice) | Swink; Jonasson & Purho |
| F05 | Metaphor | what the thing "is" (tomato, marble, water bug) | Swink |
| F06 | Rules | rules that shape feel (gravity, friction) | Swink |
| F07 | Positive fiction | pleasant, low-threat theme | Juul, *A Casual Revolution* |
| F08 | Usability | playable with little prior knowledge | Juul |
| F09 | Interruptibility | can stop at any time | Juul |
| F10 | Lenient punishment | failure is cheap and quick to retry | Juul |
| F11 | Juiciness | abundant positive feedback | Juul |
| F12 | Minimalism | fewest rules for most depth | Nealen, Saltsman & Boxerman 2011 |
| F13 | Game-space tuning | small parameter changes produce new games | Isaksen et al. |

**Evidence for F13:** Isaksen and colleagues built a parameterised Flappy Bird and predicted each variant's difficulty with simulated play and survival analysis. Changing parameters alone produced variants that felt distinctly different. For one-touch Chezable games, tuning *is* design.

---

## 10. Layer S: Social frames

This is where [[Network Effects Loop Library]] atoms plug in. **NE** marks frames that need another person and can therefore carry a true network effect.

| ID | Frame | NE? | Example |
|---|---|---|---|
| S01 | Solo vs system | — | puzzles |
| S02 | Ghost / async race | weak | racing ghosts |
| S03 | Challenge link (async head-to-head) | **NE** | Cut it in half share card |
| S04 | Pass-the-phone (hot-seat) | local | Nyanya friend mode |
| S05 | Simultaneous, same room | local | Jackbox |
| S06 | Remote real-time | **NE** | io games |
| S07 | Shared commons | **NE** | Zamia shared air; chama pot |
| S08 | Daily seed (synchronised board) | social proof | Wordle, Zamia trench |
| S09 | Spectator participation | **NE** | Twitch votes; Enkeshui observers |
| S10 | Teams | **NE** | police & robber |
| S11 | Asymmetric many-vs-few | **NE** | kati |
| S12 | Hidden role | **NE** | Werewolf |
| S13 | Rescue / revive by another | **NE** | kati catch revives a friend |
| S14 | Etiquette layer (social norms with force) | culture | Igisoro no-counting; Enkeshui manners |
| S15 | Ladder / leaderboard | weak | tiers |
| S16 | Gifting | **NE** | lives sent between friends |

---

## 11. Layer P: Payloads

| ID | Payload | Travels as | Hook Library link |
|---|---|---|---|
| P01 | Near-miss clip | Reel / TikTok | M07 Suspended Outcome |
| P02 | Spoiler-free grid | text share | M09 Declared Threshold |
| P03 | Score / challenge card | link | — |
| P04 | Rank / tier badge | profile | — |
| P05 | Replay / ghost | link | — |
| P06 | Made artifact | image | M03 Literalised Metaphor |
| P07 | Anecdote ("I almost…") | conversation | — |
| P08 | Owned stake | coins, marbles kept | — |
| P09 | Physical trace | whiteboard photo | — |

---

## 12. Layer O: Mutation operators

This is the core of uniqueness. An operator transforms an existing primitive stack into a new one.

| ID | Operator | Transformation | Evidence |
|---|---|---|---|
| O01 | Remove | delete a verb or rule the genre assumes | Vampire Survivors removed attacking |
| O02 | Invert | flip a goal or role | Yavalath (three-in-a-row loses); misère play; Enkeshui makes the opponent the referee |
| O03 | Share | give all players the same random input | roll-and-write |
| O04 | Synchronise | everyone gets the same board on the same day | Wordle; Zamia trench |
| O05 | Hide / reveal | toggle what information is visible | Igisoro's no-counting norm hides quantities |
| O06 | Transpose | move a mechanic between media | bano → touchscreen flick; mancala → app |
| O07 | Hand off | pass control between players mid-action | hot-seat; relay sowing hands the move back to the board |
| O08 | Chain | output becomes the next input | multilap sowing; Balatro multipliers; Kadi penalty stacks |
| O09 | Compress | shrink a whole game to one move or one tap | daily one-move puzzles |
| O10 | Delay | resolve later, asynchronously | challenge links; correspondence chess |
| O11 | Constrain | add a restriction that creates depth | Shisima centre rule; Giuthi singletons unplayable |
| O12 | Physicalise | add physics to an abstract rule | Suika = merge + physics |
| O13 | Persist | state carries across sessions or games | legacy games; cross-game coins |
| O14 | Scale | change player count radically | 2-player → kati-style crowd |
| O15 | Reskin | change theme only | **lowest-value operator: never the only one applied** |

**Rule:** a Chezable game must apply at least one operator from O01–O14 to a borrowed stack. O15 alone does not count.

---

## 13. Layer C: Kenyan and East African sources

### 13.1 What the scholarship says

Kenyan traditional games are documented, but thinly. The main sources are Kenyatta University theses and books that are hard to access online.

- **Mount Kenya (Kikuyu, Embu, Meru):** Wanderi's thesis documents 39 traditional games of the region, arranged from simplest to most complex. It is the closest source to Kiambu.
- **Coast:** Wanderi's book describes 23 games of the coastal region, split into low and high skill organisation. It covers circle and chanting games, running and climbing, wrestling, archery and board games.
- **Akamba:** Munyao identified 23 games and classified them using Cheska's (1987) scheme. 14 are games of physical skill and strategy. The rest are spread across physical challenge, group interaction, rhythm and singing, imagination, mental, and environmental games.
- **Gusii:** a study of 26 games found categories including detection, survival, simulation and malevolence games. Those categories are why D11–D13 exist in this library.
- **Luo:** a 2026 paper treats Ajua (mancala) as a space where social identities are negotiated. It describes the game as framed as a men's game, with exclusion enforced through playing time, board construction and location, though excluded groups also played.

### 13.2 Game entries

Each entry gives a rule summary, the primitives extracted, and the source quality.

#### Mancala family (*bao*, *ajua*, *giuthi*…)

**Bao la Kiswahili** (Swahili coast, Zanzibar, Kenya, Tanzania)
- 4×8 board and 64 counters (*kete*), with a special square pit, the *nyumba* (house). Rules survived through oral tradition. The most influential transcription is de Voogt's (1991–95), learned from Zanzibari masters.
- Play has two phases: *namua*, where seeds enter from the hand, and *mtaji*, where all seeds are on the board. Captures from the opponent's front row are re-sown from the end pits (*kichwa*). A learner's version, *bao la kujifunza*, drops the nyumba rules.
- **Primitives:** M16 phased game, M60 relay sowing, M68 protected cell (nyumba), U06 analytic complexity.
- Source quality: secondary summary of a primary transcription. The phase details come from general knowledge of de Voogt's rules and should be re-checked against de Voogt.

**Giuthi** (Kikuyu, Embu)
- Played with beans in two rows of holes dug in the ground.
- A pit holding a single seed can never be played.
- Seeds may be sown in **either direction**.
- If the last seed lands in an occupied pit, those seeds are lifted and sown again in **the opposite direction**. This multilap continues until a seed lands in an empty pit.
- A capture requires the last seed to land in an empty pit on your own side **and** at least one seed sown into an opponent pit. Captures continue across consecutive empty pits.
- A player with no legal move passes.
- **Primitives:** M61 direction-reversing multilap, M62 either-direction sowing, O11 constrain (singletons dead), O08 chain.
- **Why it matters for Chezable:** it is a Kiambu-region mechanic, and the direction reversal is visually striking. It is almost absent from casual games.
- Source quality: rules transcribed by John Pratt (secondary), cited from Huxley and Driedger.

**Kiothi** (Meru)
- *Kiothi* means "to place". The board is 2×10, with 30 seeds each starting in the five rightmost pits of each row.
- **Before play, each player may lift one pit and distribute its seeds anywhere on the board, including into the opponent's pits.**
- Seeds in a pit are immune from capture until the pit's owner has sown from it.
- **Primitives:** M22 free pre-game seeding, M68 dormant immunity.

**Mbothe** (Pokomo, Tana River)
- Pits are dug in the ground and stones are the counters. The board is 2×10 with two stones per pit.
- Opponent pits holding **exactly two** stones are skipped when sowing, and you can't start from a two-stone pit unless forced.
- Landing in your own empty pit opposite an exactly-two pit captures it **and grants another turn**.
- If an opponent is left with no stones, you must choose a move that feeds them.
- **Primitives:** M68 protected count, M15 extra turn, M50 feeding obligation.

**Endodoi and Enkeshui** (Maasai, Kenya and Tanzania)
- Endodoi is played so fast that outsiders struggle to tell individual moves apart.
- Enkeshui games are village social events. Illegal moves happen, by mistake or deliberate cheating, and **it is the opponent's job to spot and reverse them**. Observers and players also follow an elaborate etiquette.
- **Primitives:** M28 opponent-as-referee, U14 bluff, S09 spectators, S14 etiquette layer, D12 malevolence.

**Omweso** (Uganda) and **Igisoro** (Rwanda, Burundi)
- Both use 4×8 boards. Omweso has no nyumba. Its signature rule is a reverse capture: clockwise sowing is allowed only to capture from your left-most holes.
- In Igisoro, players can choose their starting arrangement. Capturing is optional, and you must announce declining it ("ndahise", I pass).
- Igisoro masters never visibly count seeds. Counting on your fingers invites ridicule.
- **Primitives:** M63 reverse capture, M22 chosen start, M101 spoken pass, **M44 perception constraint / U10 perception uncertainty**.
- **Why it matters:** a social taboo works as a mechanic. Hide the numbers and the game becomes about judging by eye.

**Ajua** (Luo and widely in Kenya). A generic Kenyan name for mancala, also called *kigogo*. Rich in social meaning (§13.1).

#### Alignment

**Shisima** (Tiriki, Western Kenya)
- *Shisima* means body or source of water, and the pieces, *imbalavali*, are water bugs. The board is an octagon with four diameters, giving nine points.
- Each player has three pieces on fixed adjacent perimeter points, so movement starts on move one with no placement phase. Pieces move one step along a line into an empty point, with no jumping.
- Three in a row wins, and the line must run through the centre (the water). Repeating the same moves three times is a draw.
- Shisima resembles the conjectured Roman game "Rota", which has a placement phase that Shisima lacks.
- **Primitives:** M57 point-to-point, M32 pattern formation, O11 constrain (centre required), M38 repetition draw, F05 metaphor (bugs racing to water).

#### Cards

**Kadi** (Kenya; rules vary by region)
- Match the suit or rank of the top card. 2s and 3s are penalty cards: the next player draws or counters with a compatible penalty, and penalties stack.
- Queens and 8s are question cards that must be answered by a matching answer card in the same play.
- Kings reverse direction, Jacks jump players (in some rule sets), and Aces request a suit.
- You must announce **"Niko Kadi!"** before you can win. You win by legally playing all your remaining cards in a single move.
- **Primitives:** M76, M77, M78, M79, M80, M14, V17, O08 chain.
- **Note:** Kadi is being digitised already (KadiGame app, itch.io builds). Chezable's angle should be **extracting** its primitives into new games rather than rebuilding Kadi.

#### Physical and childhood games

**Bano** (marbles)
- Played on smooth dusty ground. Skill rests on vision and aim, and the goal is to get marbles into designated holes.
- A common circle variant: knock marbles out of a drawn ring and **keep what you win**.
- **Mbogo's recalled variant:** hit an opponent's marble, then flick your own into a hole to convert the hit into a win.
- **Primitives:** V07 aim-and-flick, M26 dexterity, **M36 two-stage win**, M100 for-keeps, U01 performative.
- Source quality: thin. Published accounts are anecdotal. Mbogo's recall is primary evidence, and variants should be field-recorded (§13.5).

**Kati** (dodgeball family, sometimes *kati lengalenga*)
- The ball is made of socks or paper. Two throwers at opposite ends try to hit the dodgers in the middle, and a hit means out.
- **A dodger who catches the ball can bring an eliminated player back.**
- The game ends when all dodgers are out. In one variant, a countdown decides whether the last dodger or the throwers win.
- **Primitives:** M06 asymmetric roles, M31 elimination, **M95 rescue by catch**, M102 countdown, S11, S13, D12, D13.

**Brikicho** (hide and seek)
- After counting, the seeker calls "Brikicho?" and hiders answer "Banture!". The exchange "Nikuje?" / "Hapana" (Shall I come? / No) repeats until silence means everyone is hidden.
- The seeker counts at a base, often a stick or stone. A hider who sneaks back and grabs the base before being caught is safe.
- **Primitives:** M93 call-and-response readiness, M94 home-base safe, V19 hide, D11 detection, D14 rhythm.

**Blada** (rubber band jumping): a long rubber loop held by two players, with others jumping in and out of the gap. Comparable games raise the height in stages. **Primitives:** V24, M97 escalating threshold.

**Shake**: cross a marked grid to the end without being touched by guards on the margins. **Primitives:** M98 gauntlet.

**Police and robber**: teams, with captured players held in a "cell" until their side prevails. **Primitives:** M03, M96 jail and jailbreak.

**Kalongolongo / cha baba na cha mama** (playing house): a re-enactment of family roles, notable as one of the few games boys and girls freely played together. **Primitives:** D03 mimicry, role assignment, paidia.

**Animal-based games** (*nyoka*, *mbwa na kuku*, *simba na mbuzi*): chase and line games imitating animal behaviour. Source quality is low (an uncited Scribd document), so verify before use.

### 13.3 Everyday-life mechanics (design hypotheses, unsourced)

These are isomorphisms observed from Kenyan life, not documented games. Treat them as hypotheses to test.

| ID | Life source | Mechanic it maps to | Primitive stack |
|---|---|---|---|
| CL01 | Matatu *kujaza* (filling seats before departure) | push-your-luck with a wait verb | V25+V04 × U13+U03 ⊕ M39 |
| CL02 | *Bei gani* (haggling) | bluff against a hidden reservation price | V18 × U14 ⊕ M46 |
| CL03 | Chama merry-go-round | rotating shared commons, social dilemma | S07 ⊕ E01+E24 |
| CL04 | M-Pesa float (agent liquidity) | resource balancing across two pools | E01×2 + E06 |
| CL05 | Mama mboga stall | market pricing under spoilage (decay drain) | M47 + E03 |
| CL06 | Jua kali workshop | convert scrap into products | E04 converter engine |

**Check before building:** "Matatu Manager" was shown at the first Kenya Games Festival, so the matatu theme is not unclaimed. Differentiate on mechanic (CL01), not theme.

### 13.4 Contemporary Kenyan games landscape

Kenyan studios already build culturally inspired casual games: Ugali Sosa (eat ugali and meat, avoid peels and chilli), Sheng Word League, Matatu Manager, Dereva Academy, Bazuu (Kenyan charades), and several Kadi apps. Most map onto standard genre mechanics with Kenyan themes and dialogue, which is the gap Chezability targets. **Chezable's edge is mechanics extracted from Kenyan play, not Kenyan skins on global mechanics.**

### 13.5 Gaps and how to close them

| Gap | Action |
|---|---|
| Bano, brikicho, blada rules are anecdotal | Field-record variants with kids and adults in Kiambu. Film rule explanations (the whiteboard and TikTok habit already fits). Log variant, region and age group. |
| Wanderi's Mount Kenya thesis (39 games) not read | Request it from the Kenyatta University library. It is the single most relevant source for Kiambu. |
| Wanderi's coastal book (23 games) not read | Buy it (OSSREA, 2011). |
| Bao phase rules only checked at secondary level | Read de Voogt's transcription directly. |
| Kenyan theses blocked from automated access | Manual download from the KU repository. |
| Ludii database not yet mined for East African games | Search Ludii for the Bao, Omweso, Igisoro and Kenyan mancala entries and use them as playable reference implementations. |

---

## 14. Decomposing the first four Chezable games

| Game | Notation | Borrowed layers | Native layers | Operators |
|---|---|---|---|---|
| Cut it in half | D01 \| V02 × U01 → S03+S04 → P01+P03 | V, U, M (TikTok effect) | S03 challenge link | none |
| Nyanya Jetpack | D01+D05 \| V03 × U01 ⊕ M82+M88 → S03+S04 → P04 | V, U, M82 (Jetpack Joyride) | seeded course, tiers | O04 (weak) |
| Kata Ndimu | D05+D01 \| V05/V08 × U01 ⊕ M85-ish → S01 → P01 | V, U (Fruit Ninja) | cut geometry → juice volume | O12 (partial) |
| Zamia | D01+D02 \| V12 × U13+U03 ⊕ M39 → S07+S08 → P03 | M39 and the whole structure (Deep Sea Adventure) | Swahili-coast theme, daily trench | O04, O15 |

**Diagnosis:** the native work is concentrated in the social frame and the daily seed. The cultural layer is reskin only (O15). None of the four uses a C-layer mechanic.

---

## 15. The Chezability charter

1. **Declare the stack.** Every game ships with its notation line.
2. **Two-plus uncertainties.** At least two U sources.
3. **First atom in 10 seconds.** The first skill atom closes in under 10 s, with at least three rungs on the strategy ladder.
4. **Feel first.** For one-touch games, tune the game space (F13) before adding features.
5. **One real operator.** At least one of O01–O14 applied. O15 alone fails.
6. **One cultural mechanic.** At least one primitive from §13 (C or CL), not just a theme.
7. **Social frame by design.** Pick an S frame that needs another person (NE) for at least one mode.
8. **Payload designed in.** Name the P the session produces and make it recordable.
9. **Rules in one sentence.** If the core can't be explained in one sentence, compress (O09).
10. **Pre-register, then publish losses.** Same discipline as the other libraries.

**Chezability score (0–6):** one point each for a non-borrowed V, U, M, S, O and C-mechanic. Launch threshold: **≥3, including C and O.**

---

## 16. Candidate seeds

Hypotheses generated from the library. None has been played.

**S-1 Giuthi Moja (one move, daily)**
`D08+D01 | V13+V12 × U02+U06 ⊕ M61+M62 → S08 → P02  [O09, O04 on Giuthi]`
Everyone gets the same seeded Giuthi position daily. Pick a pit and a direction. The multilap reversal plays out as an animation, and the score is seeds captured, shared as a spoiler-free grid. Score: V, U, M, O, C = 5.

**S-2 Bano Mbili (strike, then sink)**
`D01 | V07 × U01+U03 ⊕ M36+M100 → S03 → P01  [O06, O10 on bano]`
Flick to hit a rival's marble, then sink your own to convert the hit. In async play, the rival's last board is your arena. Keeps are coins (E14). Score: U, M, S, O, C = 5.

**S-3 Kati Async (revive a friend)**
`D13+D12 | V22 × U01+U03 ⊕ M06+M95 → S11+S13 → P01  [O10, O14 on kati]`
Throwers record throw patterns, and dodgers survive them later. A dodger who catches the ball can revive a knocked-out friend through a link. Revival needs another person, so this is the strongest network-effect seed.

**S-4 Bila Kuhesabu (no counting)**
`D01 | V13 × U10+U03 ⊕ M59+M44 → S03 → P03  [O05 on Igisoro]`
Mancala with no numbers shown, only piles. You judge by eye. A "count" peek costs points, echoing the Igisoro norm against counting.

**S-5 Niko! (declare before you win)**
`D01+D07 | V12+V17 × U07+U03 ⊕ M76+M77+M78+M79 → S04 → P07  [O09, O06 on Kadi]`
A two-minute shedding duel built from Kadi primitives. You must tap "Niko!" at the right moment, and forgetting it costs you. Pass-the-phone or async.

**S-6 Mlinzi (opponent as referee)**
`D12+D11 | V12 × U14 ⊕ M28+M41 → S03 → P07  [O02 on Enkeshui]`
Wraps any simple Chezable game (Shisima, say). You may move illegally, and the opponent has a window to catch it. A caught cheat is penalised, and a missed one stands.

**S-7 Shisima Daily**
`D01 | V06 × U03 ⊕ M57+M32+M38 → S03+S08 → P03  [O04, O10 on Shisima]`
Async, move-by-move Shisima via link, with a daily seeded starting asymmetry. It is a slow cycle (E25), cheap to build and culturally exact.

**S-8 Kujaza (fill the matatu)**
`D01+D02 | V25+V04 × U13+U03 ⊕ M39 → S02 → P01  [O06 on CL01]`
Hold to wait while passengers board, and release to depart. Rival matatus, police checks and impatient passengers escalate the risk. Differentiate from Matatu Manager on mechanic.

**S-9 Blada Ladder**
`D14+D01 | V24 × U01 ⊕ M97+M86 → S04 → P01  [O06 on blada]`
One-touch rhythm jumping with rising thresholds, set to a chant beat.

---

## 17. Measurement and pre-registration

| Metric | Definition | Starting target (hypothesis) |
|---|---|---|
| TTFF | time to first feedback | < 3 s |
| First-atom close | time until the player shows the first learned skill | < 10 s |
| Session replay | sessions with ≥2 runs | > 50% |
| D2 return | players returning on day 2 | track the baseline first |
| Challenge-send rate | sessions that send a link | track the baseline first |
| Challenge accept rate | links that produce a play | track the baseline first |
| Clip / share rate | sessions producing a shared P | track the baseline first |
| Rescue invites (S13) | revive links sent per knocked-out player | S-3 only |
| Ladder spread | score distribution has ≥3 visible clusters | proxy for K05 depth |

**Pre-registration block (copy per game):**

```
Game:
Notation:
Chezability score:            (V U M S O C)
Primary hypothesis:           e.g. challenge-send rate ≥ X% of sessions
Falsifier:                    the result that kills the hypothesis
Comparison:                   which earlier Chezable game is baseline
Sample / window:
Result (publish win or loss):
```

---

## 18. Dedup log

How overlapping catalogues were merged:

| Overlap | Resolution |
|---|---|
| Caillois agon / MDA challenge / Lazzaro hard fun | → D01 |
| Caillois mimicry / MDA fantasy / Cheska imagination + simulation | → D03 |
| MDA fellowship / Lazzaro people fun / Bartle socialisers / Cheska group interaction | → D07 |
| Bartle killers / Gusii malevolence | → D12 |
| Costikyan randomness / Engelstein input–output randomness | split into U04 and U05 |
| Costikyan hidden information + player unpredictability | kept separate (U03, U07); the compound is U14 bluff |
| Cook skill atom / Koster game atoms / Järvinen verbs | K01 for the learning loop; V layer for the input |
| B&H "Perfect Information" ⊥ "Randomness" | kept as an example ⊥ bond |
| B&H 296 patterns | folded into M families; the full list belongs in an appendix once the book is in hand |
| Engelstein ~18 auction types | five cores (M51–M55) |
| Machinations Worker Placement pattern vs E&S worker placement | → M56 (rules) and E-layer flow (economy view) |
| Mancala variants (Bao, Omweso, Igisoro, Giuthi, Kiothi, Mbothe, Endodoi, Enkeshui) | one sowing core (M59–M60) plus distinctive rules as separate primitives (M61–M63, M22, M28, M44, M50, M68, M101) |
| Kati / Liberian lappa / dodgeball | asymmetric throw-dodge core, with rescue-by-catch (M95) as the Kenyan distinctive |

**v0.2 work:** a full B&H appendix, the full E&S 3rd-edition list, the full BGG mechanics list, and mining Ludii's game database for every East African entry.

---

## 19. Sources

### Design literature (verified this pass)
- Costikyan, G. (2013). *Uncertainty in Games*. MIT Press (Playful Thinking). https://jesperjuul.net/ludologist/?p=1786
- Cook, D. (2007). The Chemistry of Game Design. Gamasutra / Game Developer. https://www.gamedeveloper.com/design/the-chemistry-of-game-design
- Björk, S., Lundgren, S. & Holopainen, J. (2003). Game Design Patterns. *Level Up* (DiGRA). https://research.chalmers.se/publication/?id=9284 ; Björk & Holopainen (2005), *Patterns in Game Design* (296 patterns; instantiates / modulates / potentially conflicting). See Loh, https://courses.cs.duke.edu/compsci307d/current/readings/p237-loh.pdf
- Engelstein, G. & Shalev, I. (2019; 2nd ed. 2022; 3rd ed.). *Building Blocks of Tabletop Game Design: An Encyclopedia of Mechanisms*. CRC Press. https://www.routledge.com/Building-Blocks-of-Tabletop-Game-Design-An-Encyclopedia-of-Mechanisms/Engelstein-Shalev/p/book/9781032015811
- Dormans, J. (2011). Simulating Mechanics to Study Emergence in Games. AIIDE. https://ojs.aaai.org/index.php/AIIDE/article/view/12477 ; Dormans (2012), *Engineering Emergence* (PhD). https://eprints.illc.uva.nl/id/eprint/2118/ ; Adams & Dormans (2012), *Game Mechanics: Advanced Game Design*.
- Browne, C. et al. Digital Ludeme Project and Ludii. https://pmc.ncbi.nlm.nih.gov/articles/PMC7194251 ; https://arxiv.org/pdf/1907.00240 ; https://ludeme.eu/project/index.html
- Browne, C. (2011). *Evolutionary Game Design*. Springer; Yavalath, ICGA Journal 35(1). https://content.iospress.com/articles/icga-journal/icg35103 ; Humies gold 2012. https://sig.sigevo.org/article4-Computer-designed-board-game-wins-2012-Humies
- Isaksen, A., Gopstein, D. & Nealen, A. (2015). Exploring Game Space Using Survival Analysis. FDG; Isaksen & Nealen (2015), AIIDE. https://ojs.aaai.org/index.php/AIIDE/article/view/12846

### Design literature (standard references, not re-fetched this pass)
- Caillois, R. (1958/1961). *Man, Play and Games*.
- Hunicke, R., LeBlanc, M. & Zubek, R. (2004). MDA: A Formal Approach to Game Design and Game Research.
- Lazzaro, N. (2004). Why We Play Games: Four Keys to More Emotion.
- Sicart, M. (2008). Defining Game Mechanics. *Game Studies* 8(2).
- Järvinen, A. (2008). *Games without Frontiers* (PhD, Tampere).
- Elias, G. S., Garfield, R. & Gutschera, K. R. (2012). *Characteristics of Games*. MIT Press.
- Swink, S. (2008). *Game Feel*.
- Juul, J. (2010). *A Casual Revolution*.
- Koster, R. (2004). *A Theory of Fun*; "game grammar" talks.
- Lantz, F., Isaksen, A., Jaffe, A., Nealen, A. & Togelius, J. (2017). Depth in Strategic Games.
- Nealen, A., Saltsman, A. & Boxerman, E. (2011). Towards Minimalist Game Design. FDG.
- Anthropy, A. & Clark, N. (2014). *A Game Design Vocabulary*.
- Horn, B. et al. Empirical skill-chain elicitation. https://par.nsf.gov/servlets/purl/10049718

### Kenyan and East African games
- Bao (game). https://en.wikipedia.org/wiki/Bao_(game) (citing de Voogt's 1991–95 transcription)
- Giuthi. https://en.wikipedia.org/wiki/Giuthi ; Pratt, J. P. (2009). Giuthi Rules. https://www.johnpratt.com/items/mancala/giuthi.html
- Kiothi. https://en.wikipedia.org/wiki/Kiothi
- Mbothe. https://en.wikipedia.org/wiki/Mbothe
- Endodoi. https://en.wikipedia.org/wiki/Endodoi ; Enkeshui. https://en.wikipedia.org/wiki/Enkeshui
- Omweso. https://Www.wikipedia.org/wiki/Omweso ; University of Waterloo Games Museum, Omweso. https://healthy.uwaterloo.ca/museum/VirtualExhibits/countcap/pages/omwe.html
- Igisoro. https://en.wikipedia.org/wiki/Igisoro ; Mancala World. https://mancala.fandom.com/wiki/Igisoro
- Shisima. https://en.wikipedia.org/wiki/Shisima ; Paukwa. https://paukwa.or.ke/shisima ; What Do We Do All Day. https://www.whatdowedoallday.com/shisima/
- Kadi rules. https://www.dev.to/w3ndo/building-kadi-the-kenyan-version-of-poker-part-1-the-rules-2l37 ; https://afrolabs.itch.io/kadi
- Bano. Paukwa. https://www.paukwa.or.ke/story-series/kegames/bano/ ; Toyzoona. https://toyzoona.net/blogs/news/outdoor-active-play-ideas
- Kati, blada, shake, bano. Nairobi News. https://nairobinews.nation.africa/childhood-games-a-trip-down-memory-lane/ ; Global Playground. https://www.globalplayground.org/international-play-day ; Twiga Stationers (brikicho, police & robber, kati). https://twigastationers.com/games-to-play-with-your-children-this-holiday-season/
- Kalongolongo and ajua/kigogo. https://africaiblogyou.wordpress.com/tag/african-childhood-games/
- Wanderi, P. M. Traditional games of the people of Mount Kenya region (thesis). https://ir-library.ku.ac.ke/items/9908e1f1-bb0c-45b5-94e2-8d8645fc57e8
- Wanderi, P. M. (2007/2011). *The Indigenous Games of the People of the Coastal Region of Kenya*. OSSREA. https://erepository.mku.ac.ke/entities/publication/071de3f6-b763-4075-964c-9353d3630488/full
- Munyao, K. R. The traditional games of the Akamba of Kenya (thesis). https://ir-library.ku.ac.ke/items/d9c7e5c6-2e7b-4e2e-87bf-b8bceb4f7b7e
- Elements of Traditional Games of the Gusii Community of Kenya (thesis). https://ir-library.ku.ac.ke/handle/123456789/11062
- Ajua Game Among the Luo of Kenya. *International Journal of the History of Sport* 42(15), 2025/26. https://www.tandfonline.com/doi/abs/10.1080/09523367.2025.2606740
- Mwangi, P. W. Traditional games and dances of Mount Kenya region. https://ir-library.ku.ac.ke/bitstreams/c5a6955e-1b00-4831-8388-176452c768d7/download

### Contemporary Kenyan games
- Ugali Sosa. https://gamesindustryafrica.com/2023/01/13/shauku-games-and-uso-games-collaborate-to-launch-ugali-sosa/
- Kenya Games Festival recap (Jiwe). https://ke.linkedin.com/in/jitumoto-animations
- Bazuu. https://creativesgarage.org/bazuu
- KadiGame app. https://mwm.ai/apps/kadigame/6784455573
