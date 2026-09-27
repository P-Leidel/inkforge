# Spec: Milestone 3, Ink costs

**Done** (closed 2026-09-27; see [Outcome](#outcome)). Roadmap step 3 of the [GDD](../gdd.md#15-roadmap). Terms in **bold** are defined in [`CONTEXT.md`](../../CONTEXT.md). Builds on the [milestone 2 spec](m2-colours.md).

## Problem Statement

After milestone 2, every Colour works but every Colour is free. The game's promise is building under _scarce_ Ink (GDD §2, §10), and none of the later milestones can be tuned until Strokes and Fills cost something. Before scarcity can be judged against enemies (milestone 4), the price itself has to make sense: a player has to be able to look at a Stroke and know roughly what it will cost, and getting Ink back by undoing has to be predictable.

## Solution

The sandbox gains an **Ink Tank** per Colour and a price for every Stroke and Fill. Each Colour's gauge sits on the palette. While a Stroke is drawn, or while the pointer is over an Object that can be filled, the gauge greys out what it will cost. A Stroke or Fill that costs more than is left is refused whole. The parts of a Line that lie on another Line are free (overlap charging). Undo and the Eraser give back exactly what was paid. All of these rules live in a new headless **Game** layer above the Sandbox world, so the gallery, the stress tests and `npm run verdict` keep drawing for free.

Ink is unlimited by default, so the sandbox plays as it did in milestone 2. An **Ink costs** switch in the F2 panel turns the Tanks on. The same panel tunes the prices and the Tank sizes.

The milestone answers one question: **can a player read what a Stroke or a Fill will cost?**

## User Stories

### Ink Tanks

1. As a player, I want to see how much Ink of each Colour I have left on the palette, so that I know what I can still build.
2. As a player, I want red and black to be the scarcest Colours, so that they feel valuable.
3. As a player, I want every Colour to cost the same per amount of ink, so that one rule of thumb works for all five.

### Costs

4. As a player, I want a Line and an Outline to cost their length, so that longer Strokes cost more in a way I can see.
5. As a player, I want a Fill to cost less than its area in Line length, so that filling an Object is affordable.
6. As a player, I want the part of a new Line that lies on an existing Line to be free, so that joining and tracing Lines doesn't charge me twice.
7. As a player, I want a Line that crosses an Object, and every Object, to cost full price, so that the Squeeze can't be used for free Ink.

### Seeing the cost

8. As a player, I want the gauge to grey out what the Stroke I'm drawing will cost, so that I can see the price before I let go.
9. As a player, I want the gauge to grey out a Fill's cost when I hover over an Object I could fill, so that I know the price before I click.
10. As a player, I want the greyed-out part to turn red when it's more than I have, so that I know it will be refused.

### Not enough Ink

11. As a player, I want a Stroke I can't afford to be refused whole, with "Not enough <Colour>", so that I never get half of what I drew.
12. As a player, I want a Fill I can't afford to be refused the same way, so that the rule is the same for both.

### Getting Ink back

13. As a player, I want Ctrl+Z to give back exactly what I paid for the Stroke or Fill it takes back, so that undoing is free.
14. As a player, I want undoing a Line that has partly broken to give back only the standing Pieces' share, so that breaking still costs something.
15. As a player, I want the Eraser to give back what I paid for what it removes, so that tidying up while testing doesn't use up my Ink.
16. As a player, I want R to bring the Tanks back to what they held when physics last started, so that a retry starts with the same Ink.
17. As a player, I want Clear, a gallery demo and a stress test to fill every Tank, so that starting over really starts over.

### Tuning and debugging

18. As a developer, I want Ink to be unlimited until I turn on **Ink costs** in F2, so that building test scenes stays free.
19. As a developer, I want to edit the prices and the Tank sizes in F2, so that I can tune scarcity live.
20. As a developer, I want F1 to show each Tank in px², so that I can check the exact numbers.
21. As a developer, I want the Ink rules outside the Sandbox world, so that the gallery, the stress tests and the verdict are unaffected by them.

## Implementation Decisions

### Scope

- Builds on the finished milestone 2 and on the refactors after it: the list of what happened (#50), Arena bodies (#40) and Arena queries (#36).
- Ink Tanks, costs, overlap charging and refunds only. Locked Ink, Wave Ink, drops and the Core Zone move to milestone 4, with enemies ([ADR 0005](../adr/0005-wave-drawing-uses-wave-ink.md) lands whole there).
- No phases. Undo and the Eraser work paused and running, as in milestone 2. When the Build Phase comes, undo becomes Build Phase only.
- Every number below is a starting value, tuned with the F2 panel.

### Modules

- **Ink measure** (pure, `src/materials/ink.ts`, done in #59). Says how much Ink a Line, an Outline and a Fill is, in px²: a Line's length × its thickness, an Outline's perimeter × the Line thickness, a Fill's area. Mass, Blasts, Spills and Rubble read from it.
- **Sandbox world** (milestone 2). Stays free of Ink rules. Its commands report the Ink of what they made or took back (#59). The undo history leaves it: it gains `removeStroke(id)` and `removeFill(id)`, and the Game decides what to take back.
- **Game** (new, headless, `src/game/`). The rules layer over the Sandbox world. It owns:
  - the Ink Tanks, the prices and the **Ink costs** switch;
  - what each Stroke, Piece and Fill was charged;
  - the undo history;
  - the snapshot of all of these that R goes back to.

  It issues the Sandbox world's commands and reads the list of what happened to learn what broke or was erased. It never measures Ink itself: it prices the Ink the commands report. See [ADR 0009](../adr/0009-ink-rules-in-a-game-layer.md).
- **Drawing input** (new, headless, #60). Turns a press, a drag, a release and a hover into commands, and says what the preview and the flash show. It asks the Game what a Stroke or a Fill would cost and whether it can be afforded. It never works out a price itself.
- **Phaser scene** (milestone 2). Forwards pointer and key events to the drawing input, and draws the gauges.
- **Gallery, stress tests and verdict.** Unchanged: they build through the Sandbox world, below the Game.

### Units

- Ink is measured in px². The player sees **Line length**: px² ÷ the Line thickness (8 px). So a 400 px Line holds 400, and a 100 × 100 box's Outline holds 400 and its Fill 1,250.
- The gauges show whole units. F1 shows the exact px².

### Prices and Tanks (starting values)

- **Ink table** (pure data, owned by the Game, next to but apart from the material table):
  - `linePrice` 1: what a unit of a Line or an Outline costs.
  - `fillPrice` 0.25: what a unit of a Fill costs. A 100 × 100 box's Fill costs about 310.
  - Tank maximums, in Line length: grey 4000, blue 3000, green 3000, black 1500, red 1000.
- The same price for every Colour. Scarcity comes from the Tank sizes alone.
- A price only changes what you pay. Mass still follows the Ink in the Stroke, so a cheap Fill is still heavy.

### Charging

- A Line's price is `linePrice` × the Ink of its charged part (below), split over its Pieces: each Piece remembers what it cost.
- An Object's price is `linePrice` × its Outline's Ink. A Fill's is `fillPrice` × its Ink.
- The price is fixed when the Stroke or Fill is made. Nothing later changes it.
- A Stroke the pipeline rejects or drops, a Fill that misses, and "Already filled" cost nothing.
- With **Ink costs** off, everything is charged 0 and nothing is refused.

### Overlap charging

- A part of a new Line is free where its centreline lies inside an existing Line's band: within half the Line thickness (4 px) of that Line's centreline.
- Any Colour counts. Only standing Pieces count. The Terrain, Outlines, Rubble and Patches don't.
- Crossing a Line at an angle frees the few pixels inside its band. That is negligible and gets no special case.
- A Line that crosses an Object pays full price along the Object: the Squeeze moves the Object off it. Every Object pays full price.
- The free part is found once, when the Line is made, with the Arena queries' "lying on a Line" query. Undoing or breaking the Line underneath later charges nothing.
- A Piece's price is its share of the charged length, so a Piece that lies wholly on another Line costs nothing.

### Not enough Ink

- A Stroke or a Fill that costs more than its Colour's Tank holds is refused whole.
- A refused Stroke flashes like a rejected one, with "Not enough <Colour>". A refused Fill flashes its Outline, as "Already filled" does, with the same message.
- An Object bigger than a whole Tank can never be afforded with Ink costs on. With them off, it can.

### Refunds

- Undo and the Eraser give back exactly what was paid, never more. So drawing, running, undoing and erasing can never make Ink.
- **Undo:**
  - A Fill: what was paid for it.
  - An Object: what was paid for its Outline. Its Fill comes later in the history, so it is always undone first.
  - A Line: the price of its standing Pieces. Broken Pieces' Ink is spent.
  - Broken Objects and Lines whose every Piece broke are gone from the history, as in milestone 2.
- **Eraser:**
  - A whole Object: what was paid for its Outline and its Fill.
  - A Piece: what was paid for it.
  - Rubble, Droplets and Patches: nothing. They are a broken Fill's, and that Ink is spent.
  - What it erases is gone from undo, as in milestone 2, so it is never refunded twice.
- **Breaking** refunds nothing.
- A refund never fills a Tank beyond its maximum. It can only get there if the maximum was lowered after the Ink was spent; what doesn't fit is lost.

### Sandbox controls

- **Ink costs** (F2, off by default). Off: Ink is unlimited, everything is charged 0, and the gauges show ∞ with no preview. On: the Tanks count. Turning it off leaves the Tanks as they are, and turning it on again goes on from there. Lost on reload, like every F2 edit.
- **Ink section in F2.** `linePrice`, `fillPrice` and the five Tank maximums, editable live. A price edit applies to the next Stroke or Fill. Lowering a maximum empties the Tank down to it at once. **Copy as JSON** and **Defaults** cover them.
- **R** brings back the Tanks, what everything was charged and the undo history as they were when physics last started.
- **Clear**, loading a gallery demo and starting a stress test fill every Tank and empty the undo history.
- **Demos and stress tests** draw through the Sandbox world. The Strokes and Fills they make join the undo history at price 0, so Ctrl+Z still takes them back, and undoing or erasing them refunds nothing.
- **F1** shows each Tank's Ink in px² with the stats.

### Visuals

- Each palette swatch gets a gauge of its Colour's Tank and the number left in Line length.
- A pending cost is greyed out at the top of the gauge: the Stroke being drawn, or the Fill under the pointer. It turns red when it's more than is left.
- The Stroke's pending cost is an estimate from the raw samples, free parts included, re-worked out only when the Stroke has new samples. The exact price is known after the Stroke pipeline, when the Stroke is made. The estimate should be close enough that a refusal is never a surprise.
- With Ink costs off, the gauges show ∞.
- Placeholder art.

### Performance and exit criteria

Milestone 3 is done when all three hold:

1. **Feature-complete** as specified here.
2. **Readable cost.** A playtester who hasn't read the GDD builds with Ink costs on for 10 minutes. Then, for five Strokes and two Fills you show them, they estimate each cost from the gauges before drawing it, and get within about 25%.
3. **Performance.** The Demolition scene still averages at least 60 fps on the baseline machine (see the README) with no frame over 33 ms during the chain, with the gauges showing.

### Delivery order

Vertical slices, one GitHub issue each, linking to this spec. Each slice extends R, Clear and the demos to what it adds, and updates the README's controls table when it adds a control.

Before the slices, two refactors:

- **Ink measured once** (#58, done in #59). The Ink measure and the commands' Ink outcomes.
- **Drawing input** (#60, done in #67). The headless module that turns pointer events into commands. It owns the preview's throttle.

Then:

1. **Game and Ink Tanks** (#61, done in #68). `src/game/`, and the scene talks to the Game instead of the Sandbox world. Covers:
   - each Piece's Ink on a Line's outcome, and `removeStroke` and `removeFill` in the Sandbox world;
   - the Tanks and the Ink table;
   - Strokes and Fills charged at full price;
   - refused whole with "Not enough <Colour>";
   - the undo history moved into the Game, with refunds;
   - Eraser refunds;
   - R, Clear, demos and stress tests;
   - plain gauges on the palette;
   - the **Ink costs** switch in F2, off by default;
   - the Tanks in F1.
2. **Cost previews** (#62, done in #70). The greyed-out pending cost while drawing and on hover over a fillable Object, red when over.
3. **Overlap charging** (#64, done in #71). The free parts, a price per Piece from them, and the free part in the preview.
4. **Ink section in F2** (#63, done in #69). The prices and Tank maximums, live.
5. **Readable cost and frame rate** (#65, for a person, not an agent; passed). The readability test and the Demolition frame rate on the baseline machine.

2 and 4 can run in parallel.

After the slices, three refactors from the [architecture review after #71](../adr/reports/architecture-review-2026-09-27-after-71.html). They change no behaviour, and land before the milestone 4 spec is written:

- **Ink Tanks in one module** (#72, done in #82). The Tank rules, their snapshot, and one reading for the gauges and F1, named so that milestone 4's Locked Ink joins it without renaming.
- **What would this Stroke do** (#73, done in #83). One Game query for a Stroke and one for a Fill, the raw-samples measure in the Ink measure, and one throttle rule for both.
- **Exhaustive switches** (#74, done in #81). Typed linting, so the compiler lists where enemies must be handled.

The review's other candidates wait for milestone 4 (#75 to #79), each with a note on when to revisit it.

## Testing Decisions

- As before, a good test drives a module through its public commands and checks outcomes the player would notice: "a 400 px grey Line took 400 from the grey Tank", "undoing it gave the 400 back". Tests don't inspect internal stages or engine objects.
- **Seam 1: pure units.**
  - The Ink measure: a straight Line, a Line with a custom thickness, a square's Outline and its Fill.
  - Masses are bit-identical to milestone 2's.
- **Seam 2: the headless Game, over a real Sandbox world.** Each test sets **Ink costs** explicitly.
  - With costs on: a Line, an Object and a Fill take their prices from the right Tank.
  - A Stroke or a Fill that costs more than is left is refused, and the Tank is unchanged.
  - Undo gives back exactly the price, for a Line, an Object and a Fill, and for a Line with broken Pieces, only the standing Pieces' share.
  - The Eraser gives back an Object's and a Piece's price, and nothing for Rubble, Droplets or Patches.
  - Draw, run, break, undo, erase and R in any order never leave a Tank above what it held before the Ink was spent.
  - R brings back the Tanks and the history as they were at the snapshot. Clear fills the Tanks.
  - A demo's Strokes can be undone and refund nothing.
  - With costs off: an Object bigger than a whole Tank is drawn and filled, nothing is charged, and undoing it refunds nothing.
  - Overlap charging: a Line drawn exactly along another costs nothing; one drawn half along it costs half; one along the Terrain or an Outline costs full; one across an Object costs full; the free part stays free after the Line underneath is undone.
- **Seam 3: the headless drawing input, over a real Game.** Sample paths in, commands, previews and flashes out: the pending cost while drawing, the Fill cost on hover, red when over, "Not enough <Colour>" on release.
- **Unchanged:** the Sandbox world's own tests, the gallery replay tests, the render budget test and `npm run verdict` run below the Game and must pass as they are.
- **Browser only.** The readability test and the frame rate.

## Out of Scope

- Locked Ink, Wave Ink, drops and the Core Zone (milestone 4).
- The Build Phase, Wave and Aftermath, and undo becoming Build Phase only (milestones 4 and 5).
- Enemies and the Ink Core (milestone 4).
- Per-Colour prices. The Ink table can grow them later if the Tanks alone don't give enough scarcity.
- Per-level Tank amounts and the Campaign's reset every Wave (milestone 5).
- Upgrades, and recycling Ink from erased Strokes in Roguelite Mode.
- Final art.

## Further Notes

- Decided while writing this spec, from #38:
  - The Sandbox world gets no phase. A Game layer above it owns the Tanks and the undo history, and later the phases ([ADR 0009](../adr/0009-ink-rules-in-a-game-layer.md)).
  - Undo keeps working while running until there are phases. The test "undo works while running" (`src/sandbox/sandbox-world.test.ts`) moves to the Game with the undo history, and covers the refund too.
  - Undo refunds exactly what was paid: the Stroke's and the Fill's price, and only the standing Pieces' share of a Line.
  - Overlap charging is in, on the Arena queries' "lying on a Line" query.
- The Eraser now refunds what was paid for what it removes, so `CONTEXT.md` changes. That is a sandbox rule. GDD §10's "erasing a Stroke from an earlier Wave gives no ink back" is about the game with Waves, and is untouched until milestone 4 or 5 decides whether the game has erasing at all.
- Locked Ink, Wave Ink, drops and the Core Zone moved to milestone 4 because they need kills and the Ink Core. The GDD roadmap is updated to v0.5.
- Numbers to tune by feel: `linePrice`, `fillPrice` and the five Tank maximums. They can only be judged against enemies, in milestone 4.

## Outcome

Milestone 3 closed on 2026-09-27. All three exit criteria hold: every slice shipped, and the readability test and the Demolition frame rate passed in the browser (#65).

What the sandbox gained:

- A headless **Game** (`src/game/`) over the Sandbox world, as [ADR 0009](../adr/0009-ink-rules-in-a-game-layer.md) decided. It owns the Ink table, the Ink Tanks, pricing, the **Ink costs** switch, the undo history with its refunds, and the snapshot R returns to. The gallery, the stress tests and `npm run verdict` still build below it, for free.
- A headless **Drawing input** (`src/input/`) that turns pointer events into Game commands, previews and flashes, so the Phaser scene only forwards events and draws.
- Gauges on the palette with the pending cost greyed out, red when it's more than is left; "Not enough <Colour>" refusals; overlap charging; and the Ink section in F2.

Refactors along the way, none changing behaviour:

- Before the slices: **Ink measured once** (#58, in #59), so every command reports the Ink it made or took back and the Game only prices it; and **Drawing input** (#60, in #67), which moved the input rules out of the scene.
- After the slices, from the [architecture review after #71](../adr/reports/architecture-review-2026-09-27-after-71.html):
  - **Ink Tanks in one module** (#72, in #82). `src/game/ink-tanks.ts` owns spending, refunds, affordability and the snapshot, and gives the gauges and F1 one reading, ready for milestone 4's Locked Ink.
  - **What would this Stroke do** (#73, in #83). The Ink measure measures raw samples (`samplesInk`), the Game answers with two looks (`lookAtStroke`, `lookAtFill`) priced by `prospect`, and Drawing input keeps one throttle rule. The Game no longer measures Ink itself.
  - **Exhaustive switches** (#74, in #81). Typed linting with `switch-exhaustiveness-check`, so a new kind of Thing, Form or Happening, such as milestone 4's enemies, fails lint wherever it isn't handled.
- At the close, `src/rendering/` was split by what it draws: `rendering/` keeps the Arena, `ui/` the controls and `debug/` the F1 and F3 tools.

Carried to milestone 4: the review's other candidates (#75 to #79), and tuning `linePrice`, `fillPrice` and the Tank maximums against enemies.
