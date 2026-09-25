# INKFORGE: Game Design Document v0.4

English rewrite of the v0.2 concept, updated with the design decisions made since. Terms in **bold** are defined in [`CONTEXT.md`](../CONTEXT.md); the reasoning behind the larger decisions is in [`docs/adr/`](adr/).

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
- Enemies enter at the **Spawn** and walk toward the **Ink Core**. The run ends when the Ink Core reaches 0 HP.
- The arena has **Terrain** (never breaks) and may have props such as rocks, crates and pendulums.

## 5. Core loop

1. **Analysis.** The next wave's enemy types and counts are shown in advance.
2. **Build Phase.** Untimed. Physics is paused. Draw anywhere, undo freely (full refund).
3. **Wave.** Physics runs, no undo. The player can Release Frozen Objects and draw inside the **Core Zone** with **Wave Ink**.
4. **Aftermath.** Everything stays as it ended, damage included. Resting Objects are Frozen again.
5. Repeat until the final boss.

## 6. Drawing

### 6.1 Strokes

- A **Stroke** is one continuous drag in one Colour.
- If its end returns near its start, it becomes an **Object**; a marker shows the snap while drawing. Otherwise it becomes a **Line**.
- **Lines** stay fixed exactly where they were drawn, even in mid-air, until Pieces break off ([ADR 0002](adr/0002-lines-stay-fixed.md)).
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

### 6.4 Frozen Objects

Every Object starts **Frozen**, including those drawn during a Wave. It hangs where it was drawn until something hits it or the player **Releases** it with a right-click ([ADR 0004](adr/0004-objects-start-frozen.md)). Frozen Objects have a visible pinned look.

Only a hit from a moving body above a small impact threshold wakes a Frozen Object; resting contact doesn't, and two Frozen Objects touching never wake each other. The waking collision plays out normally. A **Blast** that is still strong enough when it arrives wakes a Frozen Object too, and its push plays out; a weaker one only damages it. Droplets never wake a Frozen Object. A Frozen Object can be damaged and break without ever moving.

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
- **Red** has very low durability and explodes when it is destroyed: by an enemy touching it, or by a hit or another Blast strong enough to break it ([ADR 0008](adr/0008-red-explodes-when-destroyed.md)). A red bomb survives a roll down a ramp or a short drop, so it can still be aimed. A red Line goes off Piece by Piece, like a fuse.
- The **Blast** is a ring that spreads out from the red ink and weakens with distance. Wherever it is still strong enough when it arrives, it pushes things, damages enemies and the player's own Lines and Objects, wakes Frozen Objects and destroys other red, which chains. Walls don't block it. More red ink makes a bigger Blast; a red Outline with a red Fill makes one combined Blast.
- **Spills** (blue and green Fills): 10–15 **Droplets** fly out; each sticks to the first enemy or surface it hits and leaves a **Patch**. Patch size matches the amount of ink that was in the Object. A Patch behaves like its Colour and wears down with use: a blue Patch with each bounce it gives, a green Patch as its glue slows things. A blue Patch on Terrain is a small trampoline; an enemy coated in blue bounces off whatever it hits. A green Patch is glue. Droplets deal no damage.
- **Rubble** (grey and black Fills): a grey Fill releases up to 18 pebbles, a black Fill up to 8 heavier stones, more for a bigger Fill. Their total weight matches the Fill's. Rubble rolls, piles up and damages what it hits, but never breaks.

## 8. Damage and breaking

- One rule covers every hit: a hit above the receiver's threshold deals damage that grows with its strength, to both sides of the collision. Heavier and faster things hit harder; there is no Colour-versus-Colour table. Resting weight and sliding deal no damage, and neither does physics pushing apart a Line and an Object drawn over each other.
- **Enemies** take damage from hits above an impact threshold, scaled by the mass and speed of what hit them, and from Blasts. Falling into a pit or off the screen kills instantly.
- An enemy that reaches the Ink Core deals its damage and disappears, dropping no ink.
- **Lines** are split into **Pieces** about one enemy wide. Each Piece has durability set by its Colour and cracks visibly as it loses durability.
- Lines take damage from hard hits, Blasts, and enemies pressing against them. Pressing wears a Line down at a rate set by enemy type: slowly for Crawlers, fast for Heavies. Green Lines also wear down as their glue slows things.
- A Piece at zero durability breaks off as **Debris**; the rest of the Line stays fixed. Debris is purely visual and fades after a few seconds.
- **Objects** have durability too and break into Debris; their Fill comes out (section 6.3).
- There is no repair mechanic. Damage carries over between Waves.

## 9. Enemies

Enemies are physics bodies. They always walk toward the Ink Core over whatever they stand on and climb slopes up to about 45°. Anything steeper is a wall they push against and wear down. There is no pathfinding.

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
- **Build Phase:** draw anywhere at the normal cost. Undo refunds fully. Erasing a Stroke from an earlier Wave gives no ink back.
- **Wave:** Build Phase leftovers become **Locked Ink**. They stay in the Tank but can't be spent. The player can only spend **Wave Ink** (dropped by kills in this Wave), and only inside the **Core Zone**, a visible circle about a quarter of the screen wide ([ADR 0005](adr/0005-wave-drawing-uses-wave-ink.md)).
- **Drops:** enemies drop random amounts of every Colour, weighted by enemy type. Drops are picked up automatically on death. Drops that don't fit in the Tank are lost, so saving ink leaves less room for drops.
- Leftover Wave Ink stays in the Tank.

## 11. Modes

([ADR 0006](adr/0006-campaign-before-roguelite.md))

- **Campaign:** a fixed sequence of handmade arenas and waves. Ink Tanks reset to the level's amount every Wave, so each Wave is a clean puzzle. No upgrades.
- **Roguelite Mode:** unlocked by beating the Campaign's final boss. Ink carries over between Waves, and the player picks 1 of 3 upgrades after each Wave. Tank size starts fixed; an upgrade can raise it. A recycling upgrade could give ink back for erased Strokes. Meta-progression unlocks options, not permanent power.

## 12. Controls

| Action | Input |
|---|---|
| Choose a Colour | Keys 1–5 or click the palette |
| Draw | Hold left mouse button and drag |
| Fill | Click inside a closed Object (no drag) with a Colour selected |
| Release a Frozen Object (Wave only) | Right-click it |
| Undo (Build Phase only) | Ctrl+Z |

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
3. **Ink economy.** Tanks, costs, overlap charging, Locked and Wave Ink, drops.
4. **Enemies and Ink Core.** Walkers, wall pressing, damage, the Core Zone.
5. **Defence loop.** Build Phase → Wave → Aftermath, three arenas.
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
