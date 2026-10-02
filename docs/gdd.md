# INKFORGE: Game Design Document v0.7

English rewrite of the v0.2 concept, updated with the design decisions made since (v0.6: milestone 4's enemy rules; v0.7: the Defence loop of [ADR 0012](adr/0012-continuous-building-between-intermissions.md) and milestone 5's Campaign). Terms in **bold** are defined in [`CONTEXT.md`](../CONTEXT.md); the reasoning behind the larger decisions is in [`docs/adr/`](adr/).

## 1. Vision

The player draws defences with scarce, colour-coded ink. The shape of a stroke is its geometry, the colour is its material, and the length or area is its cost. The physics simulation decides whether the construction holds. Runs take 10–20 minutes.

**The MVP question:** is it fun to build physical defences under ink scarcity and watch them survive a wave?

Tagline: *Draw it. Build it. Break physics. Survive the wave.*

## 2. Pillars

- **Draw it, don't place it.** No menus of towers. The stroke itself becomes the thing, with no shape recognition.
- **Physics creates the solution.** Damage, collapse and chain reactions come from the simulation, not from lookup tables.
- **Ink is ammunition.** Every stroke has a price; scarcity forces decisions.
- **Colours are materials.** Each colour behaves differently as a line, an outline and a fill.
- **Failure should entertain.** Blowing up your own wall is part of the fun.

## 3. Platform and stack

- Desktop browser, mouse and keyboard. All text in English.
- TypeScript, Vite, Phaser for rendering and input, Phaser Box2D for physics ([ADR 0001](adr/0001-phaser-box2d-physics.md)).
- Fixed physics timestep and seeded randomness from day one, so identical replays across machines stay possible later.

## 4. World

- 2D side view, gravity down, one fixed, non-scrolling **Arena**.
- Enemies enter from the **Spawn**, beyond the arena's edge and out of reach of drawing, and walk toward the **Ink Core**. The run ends when the Ink Core reaches 0 HP.
- A **Pit** is a gap in the Terrain open to the bottom of the screen.
- The arena has **Terrain** (never breaks) and may have props such as rocks, crates and pendulums.

## 5. Core loop

([ADR 0012](adr/0012-continuous-building-between-intermissions.md))

1. **Intermission.** Physics is paused. The **Analysis** shows the next Wave's enemy types and counts. After a Wave, its rewards are shown (in the Campaign, a summary) and the **Aftermath** follows: every Ink Tank refills to its maximum and every Object, and every Line that isn't Grounded, at rest is Frozen again; everything else stays as the Wave left it, damage included.
2. **Wave.** Physics runs and enemies walk in. The player builds as they come: draws anywhere but close to an Enemy, paid from the Ink Tanks, and Releases Frozen Objects. Drops go straight into the Tanks.
3. Repeat through the Level's Waves; then the next Level, until the final boss. If the Ink Core is destroyed, the Wave is lost: retry it, or restart the Level.

Whether the player may also build in the Intermission, undo during a Wave, and build while a Wave is paused is decided by the milestone 5 playtest.

## 6. Drawing

### 6.1 Strokes

- A **Stroke** is one continuous drag in one Colour.
- If its end returns near its start, it becomes an **Object**; a marker shows the snap while drawing. Otherwise it becomes a **Line**.
- A **Grounded** Line, one touching the Terrain or another Grounded Line (within about half a Line's thickness), stays fixed exactly where it was drawn until Pieces break off. A Line that isn't Grounded starts Frozen, like an Object, and falls as one rigid body in its drawn shape when it is freed (section 6.4, [ADR 0014](adr/0014-ungrounded-lines-start-frozen.md)). Objects, Rubble and enemies never ground a Line. While drawing, a Line that won't be Grounded shows the Frozen look.
- **Objects** are movable bodies with exactly the drawn shape: circles roll, boxes stack, triangles tip over. Self-crossing closed strokes are rejected with a clear message.
- Every Colour follows the same drawing rules; only the material differs.

### 6.2 Connections

Strokes never join: no welds, hinges or pivots ([ADR 0003](adr/0003-no-joints-in-mvp.md)).

- Lines may cross each other freely.
- A Line running into Terrain is cut at the Terrain surface.
- A Line crossing an enemy or the Ink Core is cut there.
- A Line may cross an Object, and an Object may be drawn over a Line. The overlap stays until physics runs, then the Object is squeezed out. A Frozen Object overlapped by a Line is Released when the Wave starts, so drawing a Line through an Object is a way to shove it.
- An Object may touch anything but may not overlap Terrain, other Objects, enemies or the Ink Core. An overlapping Object shows red and is refused.
- Ink is only charged for the parts of a Stroke that don't lie on top of existing ink (section 10).

### 6.3 Outline and Fill

- The **Outline** Colour decides how an Object touches the world.
- The **Fill** Colour decides its weight or effect. Fill by clicking inside a closed Object with a Colour selected; the whole inside fills and costs ink by area. A click is a press and release that barely moves; anything longer is a Stroke.
- An Object holds one Fill. Any Outline and Fill Colour can be combined, including the same Colour twice.
- An unfilled Object is a light, hollow shell that weighs only what its Outline weighs. It still collides as a solid shape: nothing can get inside it.
- An Object weighs what its Outline weighs plus what its Fill weighs, spread evenly over the shape. Outline cost scales with length, Fill cost with area, so an Object's weight roughly matches the ink spent on it.
- **When an Object breaks, its Fill comes out** with an outward kick, so Spills spread and Rubble is flung (section 7).

### 6.4 Frozen Objects and Lines

Every Object starts **Frozen**, including those drawn during a Wave, and so does every Line that isn't Grounded. It hangs where it was drawn until something hits it or the player **Releases** it with a right-click ([ADR 0004](adr/0004-objects-start-frozen.md), [ADR 0014](adr/0014-ungrounded-lines-start-frozen.md)). Frozen Objects and Lines have a visible pinned look.

Only a hit from a moving body above a small impact threshold wakes a Frozen Object or Line; resting contact doesn't, and two Frozen things touching never wake each other. The waking collision plays out normally. A **Blast** that is still strong enough when it arrives wakes one too, and its push plays out; a weaker one only damages it. Droplets never wake a Frozen Object or Line. A Frozen Object or Line can be damaged and break without ever moving.

A freed Line falls as one rigid body with its drawn shape; its Pieces keep their durability and can still break off. It weighs its ink by its Colour, so a black bar dropped on enemies hurts and a grey one barely does. Two ungrounded Lines that touch are separate bodies: Releasing one doesn't release the other, though it may knock it loose. A fallen Line stays loose like an Object, never Grounded again; enemies can shove it, and the Aftermath freezes it again when it is at rest.

## 7. Colours

| Colour | As a Line | As an Object (Outline) | Fill, released on break |
|---|---|---|---|
| **Grey** (pebble) | Cheap, flimsy wall or ramp; breaks after a few hits | Light pebble | Pebbles (Rubble) |
| **Blue** (bouncy) | Trampoline: things bounce off it, harder the faster they hit | Bounces twice, then breaks | Bouncy Spill |
| **Green** (glue) | Glue floor: anything moving on it slows right down | Sticks to the first thing it hits | Glue Spill |
| **Black** (heavy, rare) | Strongest wall: no bounce, most durability | Heavy, hard shell | Heavy stones (Rubble) |
| **Red** (explosive, rare) | Mine strip that burns like a fuse | Bomb | Blast |

Details:

- **Grey** is the cheap, plentiful building material: lowest cost per length and the most common drop.
- **Blue** bounce is real restitution: Runners fly off it, slow Crawlers barely bounce. Blue is cheap and breaks easily. A blue Object bounces twice and breaks on its third hard impact.
- **Green** glue is a drag on anything moving that touches green ink, not only on enemies ([ADR 0007](adr/0007-glue-drags-every-moving-body.md)). The drag isn't scaled by weight, so Heavies are slowed less than lighter enemies. Green Lines and Patches wear down as their glue slows things.
- A **green Object** sticks once, to the first new thing it touches after it starts moving. Stuck to Terrain or a Line, it becomes fixed; stuck to a moving body, the two move as one. It falls free if either side breaks and never sticks again. A green Object stuck to an enemy weighs it down.
- **Black** is expensive and rare. It buys time rather than winning: every wall gets worn down eventually.
- **Red** has very low durability and explodes when it is destroyed: worn away by an enemy on it (section 8), or by a hit or another Blast strong enough to break it ([ADR 0008](adr/0008-red-explodes-when-destroyed.md)). A red bomb survives a roll down a ramp or a short drop, so it can still be aimed. A red Line goes off Piece by Piece, like a fuse.
- The **Blast** is a ring that spreads out from the red ink and weakens with distance. Wherever it is still strong enough when it arrives, it pushes things, damages enemies and the player's own Lines and Objects, wakes Frozen Objects and destroys other red, which chains. Walls don't block it. More red ink makes a bigger Blast; a red Outline with a red Fill makes one combined Blast.
- **Spills** (blue and green Fills): 10–15 **Droplets** fly out; each sticks to the first enemy or surface it hits and leaves a **Patch**. Patch size matches the amount of ink that was in the Object. A Patch behaves like its Colour and wears down with use: a blue Patch with each bounce it gives, a green Patch as its glue slows things. A blue Patch on Terrain is a small trampoline; an enemy coated in blue bounces off whatever it hits. A green Patch is glue. Droplets deal no damage.
- **Rubble** (grey and black Fills): a grey Fill releases up to 18 pebbles, a black Fill up to 8 heavier stones, more for a bigger Fill. Their total weight matches the Fill's. Rubble rolls, piles up and damages what it hits, but never breaks.

## 8. Damage and breaking

- One rule covers every hit: a hit above the receiver's threshold deals damage that grows with its strength, to both sides of the collision. Heavier and faster things hit harder; there is no Colour-versus-Colour table. Resting weight and sliding deal no damage, and neither does physics pushing apart a Line and an Object drawn over each other.
- **Enemies** take damage from hits above an impact threshold, scaled by the mass and speed of what hit them, and from Blasts. A fall is a hit on what they land on, so long drops hurt. Falling below the bottom of the screen, as into a Pit, kills instantly.
- An enemy that reaches the Ink Core deals its damage and disappears, dropping no ink.
- **Lines** are split into **Pieces** about one enemy wide. Each Piece has durability set by its Colour and cracks visibly as it loses durability.
- Lines and Objects take damage from hard hits, Blasts, and enemies **Pressing** against them: anything an enemy can't shove or climb wears at a rate set by enemy type, slowly for Crawlers, fast for Heavies, Frozen Objects included. What an enemy stands on wears too. Green Lines also wear down as their glue slows things.
- A Piece at zero durability breaks off as **Debris**; the rest of the Line stays as it was, fixed or as one falling body. Debris is purely visual and fades after a few seconds.
- **Objects** have durability too and break into Debris; their Fill comes out (section 6.3).
- There is no repair mechanic. Damage carries over between Waves.

## 9. Enemies

Enemies are upright physics bodies pushed along by a capped force ([ADR 0010](adr/0010-enemies-walk-by-capped-force.md)), so glue, bounce and Blasts act on them through the simulation. They always walk toward the Ink Core over whatever they stand on and climb slopes up to about 45°. Climbing types also climb other Enemies and walls, however steep, whose top is within about 1.2 of their height, so a pile of them gets over a taller wall. Anything else steeper, or an Object they can't shove, they press against and wear down, harder when they are stacked. There is no pathfinding.

| Enemy | Role | In MVP |
|---|---|---|
| **Crawler** | Slow basic walker; wears walls slowly | Yes |
| **Runner** | Fast walker; bounced hard by blue | Yes |
| **Heavy** | Slow, heavy; shoves and wears walls fast; less affected by glue | Yes |
| Jumper | Jumps over low walls | Later |
| Breaker | Attacks structures | Later |
| **Siege Walker** (boss) | Multi-legged heavy enemy, beaten with physics (trip it, pit it, drop things on it, blow it up) rather than raw damage | Yes |

## 10. Ink economy

- Each Colour has an **Ink Tank** with a maximum. Red and black are the rarest Colours.
- **Overlap charging:** only the parts of a Line that lie on another Line are free. Where a Line crosses an Object, or an Object is drawn over a Line, it costs full price, since the Object is about to be pushed away.
- **Wave:** draw anywhere at the normal cost, except closer than about one Enemy's width to an Enemy ([ADR 0012](adr/0012-continuous-building-between-intermissions.md)). Undo refunds fully. The Eraser clears away the player's own leftovers, refunding them like undo.
- **Intermission:** every Tank refills to its maximum (the Aftermath).
- **Drops:** enemies drop random amounts of every Colour, weighted by enemy type, on every death except reaching the Ink Core, Pit kills included. Drops are picked up automatically on death. Drops that don't fit in the Tank are lost, so saving ink leaves less room for drops.
- A Level's Tank maximums say which Colours it has: a Colour at 0 is greyed out on the palette and refused with "Not in this Level".

## 11. Modes

([ADR 0006](adr/0006-campaign-before-roguelite.md))

- **Campaign:** a fixed sequence of handmade Levels, each an arena with its waves, unlocked one after another. Ink Tanks reset to the Level's amount every Wave, so each Wave is a clean puzzle. No upgrades, and no pick of rewards. Which Levels are unlocked is saved in the browser.
- **Roguelite Mode:** unlocked by beating the Campaign's final boss. Ink carries over between Waves, and the player picks 1 of 3 upgrades after each Wave. Tank size starts fixed; an upgrade can raise it. A recycling upgrade could give ink back for erased Strokes. Meta-progression unlocks options, not permanent power.

## 12. Controls

| Action | Input |
|---|---|
| Choose a Colour | Keys 1–5 or click the palette |
| Draw | Hold left mouse button and drag |
| Fill | Click inside a closed Object (no drag) with a Colour selected |
| Release a Frozen Object or Line (Wave only) | Right-click it |
| Undo | Ctrl+Z |

## 13. MVP scope

In:

- Campaign only, no upgrades.
- Five Colours with the behaviour in section 7.
- Crawler, Runner, Heavy and the Siege Walker.
- Three short handmade arenas that introduce the Colours step by step, then a boss arena.
- Local persistence, desktop browser.

Out: Roguelite Mode, upgrades, Jumper and Breaker, procedural arenas, mobile, accounts.

## 14. Later: procedural arenas

Arenas assembled by a seed from handmade modules, not random geometry.

- Terrain modules: Flat, Slope, Pit, Bridge, Cliff, Tunnel, Platform, Canyon.
- Modifiers: Low Gravity, Heavy World, Blue Drought, Volatile World, Fragile Ink.
- Generated arenas are checked by validation rules.
- Seed sharing and daily challenges later.

## 15. Roadmap

1. **Physics sandbox** ([spec](specs/m1-physics-sandbox.md)). Stroke-to-physics pipeline (pointer input → sampling → smoothing → simplification → geometry validation → collider → body), Lines and Objects, Frozen state. Includes the engine stress test: fast balls vs thin Lines, stacked boxes, 100 pebbles.
2. **Colours** ([spec](specs/m2-colours.md)). All five, Outline and Fill, Spills, Blasts, breaking.
3. **Ink costs** ([spec](specs/m3-ink-costs.md)). Tanks, costs, overlap charging, refunds.
4. **Enemies and Ink Core** ([spec](specs/m4-enemies-and-ink-core.md)). Crawler, Runner and Heavy, Pressing, damage, Drops, and Waves with Intermissions between them ([ADR 0012](adr/0012-continuous-building-between-intermissions.md), which replaced the spec's Build Phase, Core Zone, Locked and Wave Ink).
5. **Defence loop** ([spec](specs/m5-defence-loop.md)). The Analysis, the Campaign of three handmade Levels that teach the Colours in turn, saving progress.
6. **Boss and content.** Siege Walker, tuning, then Roguelite Mode and procedural arenas after the go/no-go test.

## 16. Main risk

The stroke-to-physics pipeline. It must handle self-intersections, tiny shapes, thin spikes, too many points, concave shapes and overlaps, and produce bodies that don't tunnel, jitter or explode.

## 17. Definition of Done for Prototype 0.1

- A full Campaign run: three arenas plus the boss.
- The five Colours are clearly distinct in play.
- The economy prevents spamming any single answer, including one giant black wall.
- The enemies demand different answers.
- Testers build contraptions voluntarily.

**Go/No-Go:** Roguelite Mode and procedural arenas are prioritised only if playtests confirm that building under ink scarcity is satisfying.
