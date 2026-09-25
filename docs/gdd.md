# INKFORGE: Game Design Document v0.3

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
- **Lines** stay fixed exactly where they were drawn, even in mid-air, until pieces break off ([ADR 0002](adr/0002-lines-stay-fixed.md)).
- **Objects** are movable bodies with exactly the drawn shape: circles roll, boxes stack, triangles tip over. Self-crossing closed strokes are rejected with a clear message.
- Every Colour follows the same drawing rules; only the material differs.

### 6.2 Connections

Strokes never join: no welds, hinges or pivots ([ADR 0003](adr/0003-no-joints-in-mvp.md)).

- Lines may cross each other freely.
- A Line running into Terrain is cut at the Terrain surface.
- A Line crossing an enemy or the Ink Core is cut there.
- An Object may touch anything but overlap nothing (Terrain, Lines, other Objects, enemies, the Ink Core). An overlapping Object shows red and is refused.
- Ink is only charged for the parts of a Stroke that don't lie on top of existing ink.

### 6.3 Outline and Fill

- The **Outline** Colour decides how an Object touches the world.
- The **Fill** Colour decides its weight or effect. Fill by clicking inside a closed Object with a Colour selected; the whole inside fills and costs ink by area.
- An unfilled Object is a light, hollow shell that weighs only what its Outline weighs.
- Outline cost scales with length, Fill cost with area, so an Object's weight roughly matches the ink spent on it.
- **When an Object breaks, its Fill comes out.**

### 6.4 Frozen Objects

Every Object starts **Frozen**, including those drawn during a Wave. It hangs where it was drawn until something hits it or the player **Releases** it with a right-click ([ADR 0004](adr/0004-objects-start-frozen.md)). Frozen Objects have a visible pinned look.

## 7. Colours

| Colour | As a Line | As an Object (Outline) | Fill, released on break |
|---|---|---|---|
| **Grey** (pebble) | Cheap, flimsy wall or ramp; breaks after a few hits | Light pebble | Pebbles |
| **Blue** (bouncy) | Trampoline: things bounce off it, harder the faster they hit | Bounces twice, then breaks | Bouncy Spill |
| **Green** (glue) | Glue floor: enemies on it slow right down | Sticks to the first thing it hits | Glue Spill |
| **Black** (heavy, rare) | Strongest wall: no bounce, most durability | Heavy, hard shell | Heavy stones |
| **Red** (explosive, rare) | Mine strip | Bomb | Explosion |

Details:

- **Grey** is the cheap, plentiful building material: lowest cost per length and the most common drop.
- **Blue** bounce is real restitution: Runners fly off it, slow Crawlers barely bounce. Blue is cheap and breaks easily.
- **Green** slows Heavies less than lighter enemies. A green Object stuck to an enemy weighs it down.
- **Black** is expensive and rare. It buys time rather than winning: every wall gets worn down eventually.
- **Red** goes off when an enemy touches it or when anything hits it hard. Explosions push things, damage enemies, damage the player's own Lines and Objects, and set off other red nearby.
- **Spills** (blue and green Fills): 5–10 droplets fly out; each sticks to the first enemy or surface it hits and leaves a **Patch**. Patch size matches the amount of ink that was in the Object. A blue Patch on Terrain is a small trampoline; an enemy coated in blue bounces off whatever it hits. A green Patch is glue that slows enemies.

## 8. Damage and breaking

- **Enemies** take damage from hits above an impact threshold, scaled by the mass and speed of what hit them, and from explosions. Falling into a pit or off the screen kills instantly.
- An enemy that reaches the Ink Core deals its damage and disappears, dropping no ink.
- **Lines** are split into short pieces about one enemy wide. Each piece has durability set by its Colour and cracks visibly as it loses durability.
- Lines take damage from hard hits, explosions, and enemies pressing against them. Pressing wears a Line down at a rate set by enemy type: slowly for Crawlers, fast for Heavies.
- A piece at zero durability breaks off as **Debris**; the rest of the Line stays fixed. Debris is purely visual and fades after a few seconds.
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

1. **Physics sandbox.** Stroke-to-physics pipeline (pointer input → sampling → smoothing → simplification → geometry validation → collider → body), Lines and Objects, Frozen state. Includes the engine stress test: fast balls vs thin Lines, stacked boxes, 100 pebbles.
2. **Colours.** All five, Outline and Fill, Spills, explosions, breaking.
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
