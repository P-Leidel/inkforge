# Spec: Milestone 5, Defence loop

**Planned.** Roadmap step 5 of the [GDD](../gdd.md#15-roadmap). Terms in **bold** are defined in [`CONTEXT.md`](../../CONTEXT.md). Builds on the [milestone 4 spec](m4-enemies-and-ink-core.md) and on [ADR 0012](../adr/0012-continuous-building-between-intermissions.md), which replaced its Build Phase.

## Problem Statement

After milestone 4 and the work since, the **Defence loop** runs: a **Level** brings its Arena, its Waves and its Tank maximums, Waves follow one another with an **Intermission** between them, every Intermission refills the Tanks and Freezes resting Objects again (the **Aftermath**), and a destroyed Ink Core loses the Level. But every Level the player can load is a test bed: the sandbox, the gallery demos and the stress tests. Nothing tells the player what is coming, nothing teaches the Colours in order, and there is no way from one Level to the next. The game's question, whether building under scarce Ink is fun (GDD §1), needs a Campaign to be asked of someone who has never seen the sandbox.

Milestone 4 also left four rules marked provisional (ADR 0012) that only real Levels can settle, and the GDD still describes the retired Build Phase and Core Zone.

## Solution

A **Campaign** of three handmade Levels, opened from a new title screen beside the Sandbox and the Gallery. Each Level adds Colours and Enemy types to the last: Level 1 has grey and black against Crawlers and Runners, Level 2 adds blue, green and Heavies, Level 3 adds red, a Pit and every type mixed. A Colour a Level doesn't have is greyed out on the palette. Clearing a Level unlocks the next; which Levels are unlocked is saved in the browser.

The **Analysis** arrives in the Intermission: before every Wave, the Intermission panel shows the next Wave's Enemy types and counts, and one line when a Colour or Enemy type appears for the first time.

The provisional rules become F2 switches, settled by the exit playtest. The Eraser leaves the Campaign. Each Arena says which side its Spawn is on, so a later Arena can have its Ink Core elsewhere.

The milestone answers one question: **do three Levels in a row teach the Colours one step at a time, each a fair puzzle under scarce Ink?**

## User Stories

### Campaign

1. As a player, I want a title screen with Campaign, Sandbox and Gallery, so that the game and the test beds are apart.
2. As a player, I want a Level list that shows which Levels I have unlocked, so that I can pick up where I left off.
3. As a player, I want clearing a Level to unlock the next and offer to play it, so that the Campaign moves on.
4. As a player, I want losing a Level to offer retrying the Wave, restarting the Level or going back to the list, so that a loss is never a dead end.
5. As a player, I want to be told when I have cleared the whole Campaign, so that the run has an end.
6. As a player, I want my unlocked Levels remembered after I close the browser, so that I don't start over.

### Teaching

7. As a player, I want each Level to bring in a few new Colours and Enemy types, so that I learn one thing at a time.
8. As a player, I want a Colour this Level doesn't have greyed out on the palette, and refused with "Not in this Level", so that I know it exists and why I can't use it yet.
9. As a player, I want a one-line hint when a Colour or Enemy type appears for the first time, so that I know what it is for.

### Analysis

10. As a player, I want to see each Enemy type and how many of it the next Wave sends, before every Wave and before the first, so that I can build for it.

### Levels

11. As a player, I want each Level's Arena to be shaped for what it teaches, so that walls, bridges, drops and traps each have their place.
12. As a player, I want Waves that grow within a Level, so that a defence that held early is tested later.

### Tuning and debugging

13. As a developer, I want the provisional rules as F2 switches, so that the playtest can decide them.
14. As a developer, I want F1 and F2 in the Campaign, so that I can measure and tune a Level while playing it.
15. As a developer, I want each Arena to say which side its Spawn is on, so that a later Arena can put its Ink Core in the middle.

## Implementation Decisions

### Scope

- Builds on the finished milestone 4 and on the refactors after #117: a lost Wave as a phase (#122), R's one checkpoint (#125) and the Session as the headless home of what is being played (#126).
- Three handmade Levels. The boss arena and the Siege Walker are milestone 6.
- **No pick of rewards.** The Campaign has no upgrades ([ADR 0006](../adr/0006-campaign-before-roguelite.md)); the rewards screen stays a summary. A pick of 1 of 3 is Roguelite Mode's. This answers candidate 4 of the [architecture review after #117](../adr/reports/architecture-review-2026-10-01-after-117.html).
- One Spawn per Arena, on the left in all three Levels. Several Spawns, and Spawns on both sides, are later.
- Saved: which Levels are unlocked, nothing else. No resuming mid-Level; F2 edits stay lost on reload.
- Every number below is a starting value, tuned with the F2 panel.

### Spawn side

- An Arena's Spawn names its side, left or right. The Arena query's Spawn edge (what can't be drawn beyond, and what goes out over it and is removed), the Spawn arrow and where a new Enemy stands beside the Spawn all read it, instead of assuming the screen's left edge.
- Enemies already walk toward the Ink Core, so walking is unchanged.
- No change in behaviour: every existing Arena keeps its Spawn on the left, and the gallery replay tests pass as they are. One test sends a Crawler in from a right-side Spawn of a mirrored sandbox Arena and sees it reach the Ink Core.
- "Left edge" leaves the comments, `CONTEXT.md` and the GDD wherever it is said as a rule; it becomes "the Spawn's edge".

### Provisional rules

- Three F2 switches, in a **Rules** section, with today's defaults:
  - **Build between Waves** (on): drawing, filling and undo in an Intermission and once the Level is cleared (`buildBetweenWaves`).
  - **Undo during a Wave** (on), with its full refund.
  - **Build while paused** (on): drawing, filling and undo while a Wave is paused.
- Covered by **Copy as JSON** (under `rules`) and **Defaults**. The exit playtest decides each one, recorded in an ADR, and the `PROVISIONAL` notes in `game.ts` and `defence-loop.ts` go with it.
- **The Eraser is a sandbox tool.** It is on the toolbar in the Sandbox and the Gallery, and not in the Campaign. The game has no erasing, so GDD §10's "erasing a Stroke from an earlier Wave gives no ink back" is settled by there being nothing to erase.

### Colours a Level doesn't have

- A Level's Tank maximum of 0 for a Colour means the Level doesn't have it.
- The palette shows it greyed out, and key 1–5 or a click still selects it, so drawing with it is refused with "Not in this Level", flashing like any refusal. Checked before the price, so it never reads "Not enough".
- The sandbox, the gallery and the stress tests have every Colour, as now.

### Analysis

- The Intermission panel, before every Wave including the first, lists the next Wave: each Enemy type it sends and how many. Arrival order and gaps stay hidden.
- Below it, one line for each Colour or Enemy type that is new in this Wave: new to the Campaign, not just to the Level. The hint texts live with the Levels, one per Colour and Enemy type, for example "New: blue bounces whatever hits it".
- The Spawn arrow's count shows how many are still to come, as now.
- Outside the Campaign (the sandbox with Waves on, the gallery), the panel shows the next Wave without hints.

### The three Levels

Each is a plain `Level` (Arena, Waves, Tanks) in `src/levels/`. The Arena sketches below are rough; each Level's slice turns its sketch into Terrain, tuned by playing it in the browser.

| | Colours | Enemies | Arena | Waves (Enemies each) |
|---|---|---|---|---|
| **1** | grey, black | Crawlers, then Runners | Flat ground from the Spawn, rising in two terraces to the Ink Core. Room for walls and for dropping things. | 3: 4, 6, 6 |
| **2** | adds blue, green | adds Heavies | A valley in the middle between a ledge on each side, so the path crosses a gap: bridges, bounces, and Heavies wearing through what they cross. | 4: 5, 6, 8, 8 |
| **3** | adds red | all three, mixed | A Pit in the middle, an overhang above the lane to hang Objects from, and the Ink Core on a low plateau. | 5: 6, 8, 10, 10, 12 |

- **Tanks:** today's Tank maximums for the Colours a Level has, 0 for the rest.
- Each Level's Waves mix types as its slice decides, within the counts above: Level 1 brings Runners in its later Waves, Level 2 brings Heavies in its later Waves, Level 3 mixes all three throughout.
- Nothing is built in advance in any of them.

### Campaign flow

- **Title screen**: Campaign, Sandbox, Gallery. Today's toolbar is the in-game bar, with a way back to the title screen.
- **Level list**: the three Levels; Level 1 is always unlocked, each other once the one before is cleared. Locked Levels show but can't be opened.
- **Level cleared**: the panel offers **Next Level** and **Level list**. After Level 3 it says "Campaign cleared" and offers the Level list.
- **Level lost**: the panel offers **Retry Wave** (R), **Restart Level** (Clear) and **Level list**.
- F1 and F2 work in the Campaign as everywhere.

### Saving

- Which Levels are unlocked, as one small record in `localStorage`, under a versioned key. Unreadable or missing means only Level 1 is unlocked.
- Nothing else is saved.

### Modules

- **Levels** (new, `src/levels/level-1.ts` to `level-3.ts`). Plain data: Arena, Waves, Tanks, and their hint texts.
- **Campaign** (new, headless, in `src/game/`). Holds the Levels in order, says which are unlocked, unlocks the next when one is cleared, and saves through a small storage port: `localStorage` in the browser, a fake in tests. It knows nothing of Phaser.
- **Session** (#126). Gains playing a Campaign Level and the next one, and tells the Campaign when a Level is cleared.
- **Defence loop.** Its reading gains the next Wave's counts for the Analysis. The provisional rules become its options, set from F2 through the Game.
- **Game.** The "Not in this Level" refusal; Eraser availability by what is being played.
- **Arena and Arena query.** The Spawn's side.
- **Scene and UI.** The title screen and the Level list, the panel's Analysis, hints and buttons, the greyed palette, and F2's Rules section. They draw readings and forward clicks; no rule lives there.

### Visuals

- Placeholder art throughout: a plain title screen and Level list in the existing text-button style, greyed palette entries, and the Analysis as text on the existing panel.

### Performance and exit criteria

Milestone 5 is done when all three hold:

1. **Feature-complete** as specified here.
2. **Learning curve.** A playtester new to the game clears all three Levels with F2 untouched, in at most 3 tries each, and can say what each new Colour is for when it appears. The same playtest decides the three provisional switches, recorded in an ADR.
3. **Performance.** Level 3's biggest Wave against a full defence averages at least 60 fps on the baseline machine (see the README) with no frame over 33 ms.

### Delivery order

Vertical slices, one GitHub issue each, linking to this spec. Each slice extends R, Clear and the demos to what it adds, and updates the README's controls table when it adds a control.

1. **Spawn side.** The Arena names its Spawn's side; the Arena query, the arrow and spawning read it. No change in behaviour.
2. **Campaign flow.** The Campaign module and its storage port, the title screen, the Level list, unlocking, the cleared and lost panels with their buttons, and saving. Three stand-in Levels (the sandbox Arena with short Waves) until the real ones land.
3. **Colours a Level doesn't have.** The greyed palette and "Not in this Level".
4. **Analysis.** The next Wave's counts on the Intermission panel, and the first-appearance hints.
5. **Rules switches.** F2's Rules section for the three provisional rules, and the Eraser out of the Campaign.
6. **Level 1.**
7. **Level 2.**
8. **Level 3.**
9. **Learning curve and frame rate** (for a person, not an agent). The playtest, the ADR on the provisional rules, and Level 3's frame rate on the baseline machine.

1 to 5 can run in parallel. 6, 7 and 8 follow 2 and 3, and can run in parallel with each other. 9 comes last.

## Testing Decisions

- As before, a good test drives a module through its public commands and checks outcomes the player would notice: "clearing Level 1 unlocks Level 2", "a blue Stroke in Level 1 is refused with Not in this Level". Tests don't inspect internal stages or engine objects.
- **Seam 1: pure units.** The Campaign's unlocking over a fake store, including an unreadable record; which Colours and Enemy types are new in a Wave of the Campaign.
- **Seam 2: the headless Sandbox world.** A Crawler from a right-side Spawn reaches the Ink Core; something pushed out over a right-side Spawn edge is removed; a Stroke past it is clipped.
- **Seam 3: the headless Game and Session.**
  - Playing a Campaign Level and clearing its last Wave unlocks the next and saves it; Next Level loads it at its first Wave.
  - A lost Level keeps the Campaign as it was; Restart Level loads it again from Wave 1.
  - A Stroke or a Fill in a Colour the Level doesn't have is refused with "Not in this Level", with Ink costs on or off.
  - Each provisional switch, turned off, bars what it names; the Eraser is barred in the Campaign.
  - The Defence loop's reading gives the next Wave's counts in every Intermission, the first included.
- **Seam 4: the Levels.** Each loads and is one screen, has the Colours and Enemy types its row in the table gives it, and a Crawler sent in with no defence either reaches the Ink Core or, in Level 3, dies in the Pit: no Level traps an Enemy against Terrain.
- **Unchanged:** the gallery replay tests, the render budget test and `npm run verdict` pass as they are.
- **Browser only.** The title screen and the Level list, the feel of each Level, the playtest and the frame rate.

## Out of Scope

- The Siege Walker and the boss arena (milestone 6).
- A pick of rewards, upgrades and Roguelite Mode.
- Several Spawns, Spawns on both sides, an Ink Core in the middle.
- Resuming mid-Level; saving F2 edits.
- Final art.

## Further Notes

Decided while writing this spec:

- The milestone's question is the Campaign's learning curve, with each Level a fair puzzle as its condition. The GDD's go/no-go test needs the boss and stays with milestone 6.
- The Campaign has no pick of rewards; the rewards screen stays a summary (candidate 4 of the review after #117).
- The three provisional rules of ADR 0012 become F2 switches with today's defaults, decided by the exit playtest. The Eraser is a sandbox tool only, so the game has no erasing.
- The Spawn on the left and the Ink Core on the right is not a rule of the game: each Arena says which side its Spawn is on. All three Levels keep it on the left.
- A Colour a Level doesn't have is shown greyed and refused, not hidden, so the player sees what is coming.
- The Analysis shows types and counts, not order or gaps.
- Only unlocked Levels are saved.
- The GDD (v0.7) and `CONTEXT.md` are brought in line with ADR 0012 alongside this spec: the core loop, the economy and the controls lose the Build Phase, the Core Zone, Locked Ink and Wave Ink, and the **Aftermath** joins the glossary.
- Numbers to tune by feel: every Level's Waves and Tanks, and the Arena shapes.
