# Spec: Milestone 4, Enemies and Ink Core

**Planned.** Roadmap step 4 of the [GDD](../gdd.md#15-roadmap). Terms in **bold** are defined in [`CONTEXT.md`](../../CONTEXT.md). Builds on the [milestone 3 spec](m3-ink-costs.md).

## Problem Statement

After milestone 3, every Stroke and Fill costs Ink, but nothing threatens anything. The game's question is whether building physical defences under scarce Ink is fun (GDD §1), and that can only be judged against enemies. Milestone 3 also left its prices and Tank sizes untuned, because scarcity means nothing until something has to be stopped. And the other half of the Ink economy, Locked Ink, Wave Ink, Drops and the Core Zone ([ADR 0005](../adr/0005-wave-drawing-uses-wave-ink.md)), needs kills and a Wave to exist at all.

## Solution

**Enemies** walk in from the **Spawn**, beyond the Arena's left edge, toward the **Ink Core** on the plateau at the right. They are upright physics bodies pushed along by a capped force ([ADR 0010](../adr/0010-enemies-walk-by-capped-force.md)), so glue, bounce, Blasts and blows act on them through the simulation. Whatever blocks them, a Line or an Object, they wear down by **Pressing**; what they stand on wears too. They take damage from hits, falls and Blasts, die at 0 HP or below the screen, and let out a **Drop** of Ink. One that reaches the Ink Core damages it and disappears. Three types: **Crawler**, **Runner** and **Heavy**.

A minimal **Wave** arrives with them. Behind a **Waves** switch in F2 (off by default, like **Ink costs**), paused becomes the **Build Phase** and Space starts a Wave: a list of Enemies set in F2 comes in from the Spawn, Build Phase leftovers become **Locked Ink**, and the player can only spend **Wave Ink**, only inside the **Core Zone**. The Wave ends when every Enemy is gone or the Ink Core is destroyed. The Analysis, the Aftermath, sequences of Waves and the three arenas stay in milestone 5.

The milestone answers one question: **do the three enemy types each demand a different defence?**

## User Stories

### Enemies

1. As a player, I want Enemies to walk in from beyond the edge of the screen toward the Ink Core, so that I defend a place rather than chase them.
2. As a player, I want Enemies to walk over whatever they stand on and climb gentle slopes, so that my ramps and bridges are paths for them too.
3. As a player, I want an Enemy blocked by a Line or an Object to wear it down, so that every defence buys time and none lasts forever.
4. As a player, I want what Enemies walk on to wear as well, so that a bridge under a queue of Enemies gives way eventually.
5. As a player, I want a Crawler, a Runner and a Heavy that behave clearly differently, so that one defence doesn't stop all three.
6. As a player, I want a Heavy to shove light Objects out of its way, so that only something heavy or fixed stops it.
7. As a player, I want Enemies to push and queue behind each other, so that a wall holds back a crowd, not one at a time.

### Hurting Enemies

8. As a player, I want hits, falls and Blasts to hurt Enemies by the same rule as everything else, so that dropping a boulder or blowing up a bomb works the way I expect.
9. As a player, I want an Enemy that falls into a Pit to die, so that a Pit is a trap.
10. As a player, I want red to go off under an Enemy that walks onto it, so that red Lines are mines.
11. As a player, I want glue to slow Enemies, blue to bounce them and a green Object to stick to one and weigh it down, so that every Colour matters against them.
12. As a player, I want to see how hurt an Enemy is, so that I can judge whether my trap is working.

### Ink Core

13. As a player, I want an Enemy that reaches the Ink Core to damage it and disappear, so that every one that gets through costs me.
14. As a player, I want to see the Ink Core's HP, and to be told when it is destroyed, so that I know how close I am to losing.

### Waves and Ink

15. As a player, I want Space to start a Wave in which the listed Enemies come in one after another, so that I can build first and then watch the defence play out.
16. As a player, I want what I didn't spend while building to be Locked during the Wave, so that I can't just keep building anywhere.
17. As a player, I want killed Enemies to drop Ink I can spend at once, inside the Core Zone, so that a good defence feeds a last line near the Ink Core.
18. As a player, I want a Pit kill to drop Ink too, so that a trap pays like a fight.
19. As a player, I want the gauges to show my Locked Ink apart from my spendable Ink, so that I know what I can draw right now.
20. As a player, I want a Stroke outside the Core Zone during a Wave to be refused with "Outside the Core Zone", so that I know why it wasn't drawn.
21. As a player, I want pausing during a Wave to keep the Wave's rules, so that pausing is not a way to build freely.
22. As a player, I want undo to work only in the Build Phase, so that a Wave's mistakes stay made.

### Tuning and debugging

23. As a developer, I want every Enemy number in an enemy table I can edit in F2, so that I can tune the three types live.
24. As a developer, I want Shift+1/2/3 to send in a Crawler, a Runner or a Heavy at any time, so that I can test without setting up a Wave.
25. As a developer, I want the Waves switch off by default, so that the sandbox stays a sandbox.
26. As a developer, I want R to bring back the Enemies, the Ink Core and the Wave as they were when physics started, so that a retry plays out the same.

## Implementation Decisions

### Scope

- Builds on the finished milestone 3 and on the five refactors from the [architecture review after #71](../adr/reports/architecture-review-2026-09-27-after-71.html) (#75 to #79), which land first with the answers below.
- Crawler, Runner and Heavy. The Siege Walker is milestone 6.
- One Arena: the sandbox Arena, changed as below. Per-level arenas are milestone 5.
- A minimal Wave only. The Analysis (the next Wave shown in advance), the Aftermath (resting Objects Frozen again), sequences of Waves, per-level Tank amounts and the Campaign's reset every Wave are milestone 5.
- Every number below is a starting value, tuned with the F2 panel.

### Arena

- **Spawn.** The left wall goes. The ground carries on beyond the left edge, out of view, as an entry lane of Terrain about 240 px long, closed at its far end by a Terrain wall. Enemies appear at the lane's far end and walk in over the edge. Nothing can be drawn there: drawing stays in view, and a Stroke that runs past the left edge is clipped there, as it is cut at the Terrain. A small arrow at the left edge shows where they come in, with the number still to come during a Wave.
- **Out over the Spawn edge.** Anything but an Enemy that goes wholly out of view over the left edge is removed, like a Droplet that leaves the Arena: no Debris, no Fill comes out, red doesn't go off, nothing is refunded. So nothing the player can't see or reach ever blocks the lane.
- **The pit is filled in.** The ground runs flat from the Spawn to the slope. A gap with a floor would trap Enemies against Terrain that never breaks.
- **Pit.** A gap in the Terrain open to the bottom of the screen. The sandbox Arena has none; the gallery gets per-demo Terrain and a Pit demo (slice 9).
- **Ink Core.** On the plateau at the top of the slope, against the right wall. The right wall stays.

### Enemies

- **Body.** An upright rounded box that never rotates, about one Piece wide. It collides with everything, other Enemies included, so a queue forms behind whatever blocks the first.
- **Walking** ([ADR 0010](../adr/0010-enemies-walk-by-capped-force.md)). A horizontal force pushes it toward its type's walking speed, toward the Ink Core's side, and is never more than its type's **push** (a multiple of its own weight). It walks only while standing on something no steeper than 45°; in the air it doesn't push. There is no pathfinding (GDD §9). An Enemy thrown back over the left edge walks in again.
- **Floor or not.** The physics module reports each touching pair with its normal. The Material rules decide: a surface no steeper than 45° is something the Enemy stands on; anything steeper, or an Object it pushes against at its push limit without getting past, is something it presses.
- **Pressing wear.** Every Piece or Object an Enemy presses loses durability at the Enemy type's **pressing** rate per second, Frozen Objects included. What it stands on loses durability at **floor wear** × that rate (1 to start). Wear depends on the time in contact, not on how hard it pushes. Pressing never wakes a Frozen Object; only hits do, as before. Terrain, Rubble and the Ink Core never wear. An Object an Enemy can shove is pushed, not pressed.
- **Red under an Enemy.** No trigger rule ([ADR 0008](../adr/0008-red-explodes-when-destroyed.md) holds). Red's durability is so low that pressing wear or floor wear destroys it within about a second, as the Enemy is on it, and it explodes as usual.
- **Damage.** An Enemy has HP and a damage threshold. Hits damage it by the one rule, both sides of the collision: a hit above its threshold deals damage that grows with the impulse, and the thing it hit is checked against its own threshold. A fall is a hit on what it lands on, so a long drop hurts it, and a Heavy landing on a grey Line damages the Line. Blasts damage and push it. Enemies have no impact limit: blue's third-impact break is an Object's.
- **Ink effects.** None is new. Glue drags an Enemy like any moving body, so it slows Heavies less ([ADR 0007](../adr/0007-glue-drags-every-moving-body.md)). Blue bounces it. A Droplet lands on it as a Patch, which moves with it, so a blue-coated Enemy bounces off what it hits. A green Object sticks to it and weighs it down.
- **Death.** At 0 HP, or when it falls below the bottom of the screen, an Enemy dies: it pops (a burst like Debris, purely visual) and lets out its Drop. It never breaks into pieces and releases nothing physical.
- **Reaching the Ink Core.** An Enemy that touches the Ink Core deals its type's core damage and disappears, dropping nothing.
- **Strokes and Enemies** (#79). A Line crossing an Enemy or the Ink Core is cut there, as at the Terrain. An Object may not overlap an Enemy or the Ink Core; it shows red and is refused.
- **Spawning outside a Wave.** Shift+1, Shift+2 and Shift+3 send in a Crawler, a Runner or a Heavy from the Spawn, paused or running, Waves on or off.

### Ink Core

- A static body, about 96 × 96, that Enemies collide with. Only an Enemy reaching it damages it: hits, Blasts, Rubble and pressing don't.
- HP 10 to start, shown as a bar on it.
- At 0 HP it shows "Ink Core destroyed", the Wave ends and physics stops. R starts over. There is no run to lose until milestone 5.

### Enemy table

- **Pure data** in `src/materials/enemy-table.ts`, next to but apart from the material table: Enemies are not Colours and have no role. The module from #76 answers what a thing's numbers are, from the material table for ink and from the enemy table for Enemies, and applies F2 edits again from it.
- Per type: width, height, density, walking speed, push, pressing rate, HP, damage threshold, core damage and Drop ranges. Shared: floor wear, the Ink Core's HP and the Core Zone's size.
- Starting values:

  | | Crawler | Runner | Heavy |
  |---|---|---|---|
  | Size (px) | 40 × 40 | 32 × 44 | 64 × 64 |
  | Walking speed (px/s) | 60 | 180 | 40 |
  | Push (× own weight) | 1 | 0.6 | 3 |
  | Pressing (durability/s) | 300 | 150 | 1500 |
  | HP | 3000 | 1500 | 12000 |
  | Damage threshold | 300 | 200 | 1500 |
  | Core damage | 1 | 1 | 3 |

  So a Crawler wears through a grey Piece (6000) in about 20 s and a Heavy in about 4 s; a Heavy takes about 13 s on a black Piece (20000). Density is set so a Heavy weighs about four Crawlers and a Runner about half of one.
- **Drop ranges**, in Line length, drawn evenly per Colour:

  | | grey | blue | green | black | red |
  |---|---|---|---|---|---|
  | Crawler | 40–100 | 0–40 | 0–40 | 0–15 | 0–10 |
  | Runner | 20–60 | 20–60 | 0–40 | 0–10 | 0–10 |
  | Heavy | 60–150 | 0–40 | 20–60 | 20–60 | 10–40 |

- F2 gains an **Enemies** section with every value, covered by **Copy as JSON** (under `enemies`) and **Defaults**.

### Drops

- Every death lets out a Drop except reaching the Ink Core, Pit and off-screen deaths included: a trap kill pays like a fight.
- A Drop is a random amount of every Colour from the type's ranges, drawn from the seeded random at the moment of death, so it is part of replay order.
- It goes into the Ink Tanks at once, as Wave Ink. What doesn't fit is lost. A burst of coloured dots flies from the body to the gauges; it is purely visual.
- With Ink costs off, the Tanks are unlimited and a Drop changes nothing, but the burst still shows.

### Waves

- **Waves switch** (F2, off by default). Off: the sandbox works as in milestone 3, with Shift+1/2/3 for Enemies. On: the Game has a Build Phase and a Wave. Lost on reload, like every F2 edit.
- **Build Phase.** Physics paused. Draw anywhere, undo, erase.
- **Starting a Wave.** Space in the Build Phase takes the snapshot, turns every Tank's contents into Locked Ink and starts the Wave.
- **During a Wave**, paused or running:
  - Space only pauses and runs. It stays the Wave.
  - Only Wave Ink can be spent, and only inside the Core Zone.
  - Undo does nothing. The Eraser, a sandbox tool, still works.
  - Releasing a Frozen Object works anywhere.
- **The Wave's list.** F2's **Wave** section: a count per type and a gap in seconds between arrivals. They come in a fixed order: Crawlers, then Runners, then Heavies. The next waits while the lane's far end is still occupied. Starting values: 6 Crawlers, 3 Runners, 2 Heavies, 2 s apart. Gallery demos can set their own Wave.
- **The Wave ends** when none is left to come and none is alive, or when the Ink Core is destroyed. Physics stops and the Game is back in the Build Phase: Locked Ink is spendable again and Wave Ink stays in the Tanks (GDD §10). Nothing is Frozen again (milestone 5).
- **R** goes back to the snapshot: the Build Phase as it was when the Wave started, Tanks, Enemies, the Ink Core's HP and the Wave's list included.

### Locked Ink and Wave Ink

- They live in `src/game/ink-tanks.ts`, which #72 shaped for them.
- Each Tank holds its Locked Ink and its Wave Ink. Locked Ink still takes room, so a Tank full of it has no room for Drops.
- A Stroke or a Fill during a Wave is priced as always and paid from Wave Ink only; "Not enough <Colour>" when Wave Ink falls short.
- Refunds during a Wave: the Eraser gives back to Wave Ink what was paid from Wave Ink. Ink paid in the Build Phase goes back as Locked Ink.
- The gauge shows Locked Ink as a dimmed band at the bottom and spendable Ink above it. The pending cost is greyed out at the top as before. F1 shows both in px².

### Core Zone

- A circle centred on the Ink Core, 480 px across to start (the enemy table's shared values), drawn faintly in the Build Phase and clearly during a Wave.
- During a Wave, a Stroke must lie wholly inside it; otherwise it is refused whole with "Outside the Core Zone", flashing like any refusal. A Fill click must be inside it.
- The rule holds with Ink costs off too, so it can be tested alone.

### Modules

- **Physics** (#77). Bodies are described once: shapes, and whether they move, can be Frozen, report hits, wake Frozen Objects, stay upright and are driven. Touching pairs carry their normal.
- **Material rules** (#75, #76). One call takes the step's report and runs every consequence in order. What a thing's numbers are, and what breaking or killing it lets out, come from one module. The step's new phases, in order after the physics step: pressing and floor wear; Enemies reaching the Ink Core; kills (0 HP, below the screen); Drops, which draw from the seeded random; and removing what went out over the Spawn edge. Walking forces are applied before the physics step.
- **Enemies** (new kind in the Sandbox world). Their bodies, the walking force, HP and snapshot. Part of the Arena contents: R brings them back, Clear removes them.
- **Ink Core** (new, in the Sandbox world). Its body and HP.
- **Arena query** (#79). What a new Stroke meets: Terrain, Enemies and the Ink Core cut a Line; Terrain, Objects, Rubble, Enemies and the Ink Core block an Object; and Rubble counts in what a squeezed Object must end clear of.
- **Game.** The Waves switch, the Build Phase and the Wave, the Wave's list and arrivals, Locked and Wave Ink, Drops into the Tanks, and the Core Zone rule. The Sandbox world stays free of phases ([ADR 0009](../adr/0009-ink-rules-in-a-game-layer.md)): it reports kills and their Drops in the list of what happened, and the Game prices them into the Tanks.
- **Rendering** (#78). One drawing module each for Enemies and the Ink Core, with HP bars, the pop and the Drop burst.
- **Gallery.** Per-demo Terrain, so a demo can have a Pit.

### Visuals

- Placeholder art: a Crawler is a low grey-brown box, a Runner a narrow one leaning forward, a Heavy a big dark one. Each carries a thin HP bar that shows once it is hurt.
- The Ink Core is a glowing block with its HP bar.
- The Spawn arrow, the Core Zone circle, the pop, the Drop burst, and the dimmed Locked band on the gauges.

### Performance and exit criteria

Milestone 4 is done when all three hold:

1. **Feature-complete** as specified here.
2. **Different answers.** A playtester gets three Waves of one type each (8 Crawlers; 8 Runners; 4 Heavies), with the default Tanks and both **Ink costs** and **Waves** on. They stop each one, and at least one defence that stops one type fails against another, replayed with R and that type's Wave.
3. **Performance.** A Wave of 30 Enemies against a built defence, with the Demolition chain set off during it, averages at least 60 fps on the baseline machine (see the README) with no frame over 33 ms. The Demolition scene alone stays as it is.

### Delivery order

Vertical slices, one GitHub issue each, linking to this spec. Each slice extends R, Clear and the demos to what it adds, and updates the README's controls table when it adds a control.

Before the slices, the five refactors from the [architecture review after #71](../adr/reports/architecture-review-2026-09-27-after-71.html), rewritten with this spec's answers:

- **Say what a thing is in one place** (#76) and **Shape the physics seam for walkers** (#77) first, in parallel.
- **Let the Material rules own the order of a step** (#75), after #76.
- **Ask the Arena query what a new Stroke meets** (#79).
- **Draw each kind of Arena contents in one place** (#78), in parallel with all of them, before Enemies are drawn.

Then:

1. **Enemies walk** (#85). The enemy table and its F2 section, the Crawler, the Spawn and its lane, Shift+1, walking by capped force, floor or not from the touching normal, the Ink Core with its HP and core damage, death below the screen, removal of what goes out over the Spawn edge, and the pit filled in.
2. **Pressing wear** (#86). Pieces and Objects wear under pressing, and what an Enemy stands on under floor wear. Red goes off under an Enemy.
3. **Enemies take damage** (#87). HP, the damage threshold, hits on both sides, falls, Blasts, the pop, HP bars, and "Ink Core destroyed".
4. **Runner and Heavy** (#90). Their rows in the enemy table, Shift+2 and Shift+3.
5. **Strokes meet Enemies** (#88). Lines are cut at Enemies and the Ink Core; Objects over them are refused.
6. **Waves** (#91). The Waves switch and the Wave section in F2, the Build Phase and the Wave in the Game, arrivals in order with gaps and the Spawn arrow's count, the end of a Wave, and undo in the Build Phase only.
7. **Drops and Wave Ink** (#92). Drops from the seeded random, Locked Ink on the gauges and in F1, spending and refunding Wave Ink, and the Drop burst.
8. **Core Zone** (#93). The circle and "Outside the Core Zone".
9. **Pit demo** (#89). Per-demo Terrain in the gallery, and a demo with a Pit.
10. **Different answers and frame rate** (#94, for a person, not an agent). The playtest and the 30-Enemy frame rate on the baseline machine.

2, 3 and 9 can run in parallel after 1; 4 follows 2 and 3; 5 needs 1 and #79. 7 and 8 can run in parallel after 6.

## Testing Decisions

- As before, a good test drives a module through its public commands and checks outcomes the player would notice: "a Crawler on flat ground reaches the Ink Core and takes 1 HP", "a grey Piece in its way breaks after about 20 s". Tests don't inspect internal stages or engine objects.
- **Seam 1: pure units.** The enemy table's defaults; floor or not from a normal (44° stands, 46° presses); a Drop's amounts stay within their ranges and repeat for the same seed.
- **Seam 2: the headless Sandbox world.**
  - A Crawler walks from the Spawn to the Ink Core on flat ground and up the slope, deals its core damage and is gone.
  - A Crawler against a grey Line wears one Piece through in about 20 s, and a Heavy in about 4 s; the Piece breaks and the Crawler walks on.
  - A Frozen Object in an Enemy's way wears and is never woken by pressing. A light Object is shoved by a Heavy, not worn.
  - A red Line on the floor goes off under a Crawler within about a second.
  - A Crawler dropped from high enough takes damage on landing, and the Line it lands on too. A boulder dropped on one kills it. A Blast damages and pushes it.
  - An Enemy below the bottom of the screen is dead. One thrown back over the left edge walks in again.
  - An Object pushed out over the left edge is removed, with no Blast and no Fill.
  - A green Object sticks to an Enemy; glue slows a Crawler more than a Heavy.
  - A Line drawn across an Enemy is cut there; an Object drawn over one is refused.
  - R brings back Enemies, their HP, the Ink Core's HP and what pressing had worn, and a retry plays out the same.
- **Seam 3: the headless Game.**
  - With Waves on, Space starts a Wave: the Tanks become Locked, only Wave Ink is spent, and undo does nothing.
  - Arrivals follow the list in order and gap; the Wave ends when all are gone, and Locked Ink is spendable again.
  - A kill's Drop goes into the Tanks as Wave Ink, and what doesn't fit is lost. Pit kills drop; reaching the Ink Core doesn't.
  - A Stroke outside the Core Zone during a Wave is refused with "Outside the Core Zone", with Ink costs on or off.
  - "Ink Core destroyed" ends the Wave.
  - With Waves off, everything plays as in milestone 3.
- **Seam 4: the headless drawing input.** "Outside the Core Zone" on release, and the gauge's Locked band in its reading.
- **Unchanged:** the gallery replay tests, the render budget test and `npm run verdict` pass as they are; the Mines demo is untouched, since only Enemies wear things.
- **Browser only.** The playtest and the frame rate.

## Out of Scope

- The Siege Walker (milestone 6).
- The Analysis, the Aftermath, sequences of Waves, the three arenas, per-level Tank amounts and the Campaign's reset every Wave (milestone 5).
- Jumper and Breaker. Blows against structures are the Breaker's, later.
- Pathfinding, jumping and turning back.
- Whether the game keeps erasing at all, and GDD §10's "erasing a Stroke from an earlier Wave gives no ink back" (milestone 5).
- Final art.

## Further Notes

Decided while writing this spec:

- Milestone 4 has a minimal Wave, behind an F2 switch, so scarcity and ADR 0005 can be judged against Enemies now; the rest of the loop stays in milestone 5.
- Enemies walk by a capped force ([ADR 0010](../adr/0010-enemies-walk-by-capped-force.md)).
- Enemies wear what is in their path, Objects as well as Lines, by Pressing, and what they stand on by floor wear. Blows against structures are left for the Breaker.
- Floor wear starts at 1, the same as pressing. At 0.1 a Crawler would walk over a red Line without setting it off (red's 250 durability at 30/s takes 8 s); at 1 red is a mine under any Enemy with no rule of its own. Floors then wear as fast as walls; lowering floor wear only makes red slower, never broken.
- The Spawn lies beyond the Arena's edge, out of reach of drawing, so a wall built at the edge is the first thing Enemies press. Anything but an Enemy that goes out over that edge is removed.
- An Enemy dies only below the bottom of the screen (a Pit is a gap open to it) or at 0 HP; falls hurt through the one hit rule.
- A Pit kill drops Ink; reaching the Ink Core drops none.
- Enemy numbers live in their own table.
- Rubble counts in what a squeezed Object must end clear of (#79).
- Numbers to tune by feel: everything in the enemy table, floor wear, the Core Zone's size, and milestone 3's `linePrice`, `fillPrice` and Tank maximums, now against Enemies.
