# Inkforge

A 2D side-view physics defense game: the player draws lines and objects with scarce, colour-coded ink to stop enemy waves from reaching the Ink Core.

## Language

### Arena and run

**Arena**:
One fixed, non-scrolling screen seen from the side, with gravity, terrain, a Spawn and the Ink Core.
_Avoid_: Map, level screen (a Level is what an Arena starts with)

**Ink Core**:
The structure the player defends. Only an Enemy reaching it damages it; the run is lost when its HP reaches zero.
_Avoid_: Base, tower, heart

**Spawn**:
Where Enemies appear: beyond one edge of the Arena, which the Arena names, out of view and out of reach of drawing, so they walk in over the edge. The player can build right up to it, but never on it.
_Avoid_: Spawn point, gate, portal

**Pit**:
A gap in the Terrain open to the bottom of the screen. An Enemy that falls in dies when it drops below the screen; anything else that falls in is destroyed there.
_Avoid_: Hole, chasm, dip (a gap with a floor is not a Pit)

**Terrain**:
The arena's own, hand-built ground and walls. Not drawn by the player and never breaks.
_Avoid_: Ground (when drawn strokes are meant)

**Wave**:
The phase in which physics runs, enemies walk toward the Ink Core, and the player builds: drawing anywhere but near an Enemy, paid from the Ink Tanks. Pausing does not end it; it ends when no Enemy is left to spawn or alive. If the Ink Core is destroyed first, the Wave is lost and only R or Clear go on.
_Avoid_: Round, combat phase

**Intermission**:
The paused phase between two Waves, and before the first. The player can't draw (provisionally, while testing, they can). When a Wave ends, it shows that Wave's rewards (for now a summary: kills, which count the Enemies that reached the Ink Core too, the Ink Core's HP, the Ink picked up), every Ink Tank refills to its maximum and every Object at rest is Frozen again; the Arena otherwise stays as the Wave left it, damage included. Before each Wave it shows the Analysis. Space starts the next Wave.
_Avoid_: Build Phase, break, shop

**Analysis**:
What the Intermission shows of the next Wave: each Enemy type it sends and how many, and in the Campaign, a line for each Colour or Enemy type appearing for the first time. Not the order or the gaps.
_Avoid_: Preview, scouting

**Aftermath**:
What happens to the Arena when a Wave ends: every Ink Tank refills to its maximum and every Object, and every Line that isn't Grounded, at rest is Frozen again. Nothing else changes.
_Avoid_: Cleanup, reset

**Defence loop**:
The cycle of phases the player goes through: an Intermission, then a Wave, then the next Intermission, through the Level's Waves; after the last, the Level is cleared. It says which phase is under way. Once the Ink Core is destroyed it stops there, and a Wave under way is lost: physics stays stopped, nothing can be drawn, filled, erased or undone, and only R or Clear go on.
_Avoid_: Game loop, phase machine, round

**Level**:
Everything an Arena starts with: the Arena itself (its Terrain, Spawn and Ink Core), its Waves in order, its Ink Tank maximums, and whatever is already built there, for free. Loading a Level clears the Arena and sets it up at its first Wave. What a Level leaves out, it starts with as in Free play, never as the last Level left it. The gallery demos, the stress tests and the sandbox are Levels too.
_Avoid_: Stage, map, arena description, scenario

**Campaign**:
The first mode: a fixed sequence of handmade Levels, each unlocked by clearing the one before. Ink Tanks reset to the Level's maximums every Wave; a Colour whose maximum is 0 is not in the Level, and is not shown. With Ink costs off, every Colour is in every Level, unlimited.

**Free play**:
Playing any Level outside the Campaign: the Sandbox, a Gallery demo or a stress test. The sandbox tool, sending in Enemies by hand, is on hand, and what the Level leaves out, its Ink Tank maximums or its Waves, is as tuned, never as the last Level left it.
_Avoid_: Sandbox mode (the Sandbox is a Level)

**Tutorial**:
The cards shown the first time Campaign Level 1 starts: the goal, the controls (drawing a Line, closing an Object, Fill and Release), how to kill an Enemy, and grey (pebble) vs black (stone). Shown once, reopened with H.
_Avoid_: Help screen, onboarding

**Roguelite Mode**:
The mode unlocked by beating the Campaign's final boss. Ink carries over between Waves, and the player picks upgrades.
_Avoid_: Endless mode

### Drawing

**Stroke**:
One continuous drag of the pointer in one Colour. Becomes either a Line or an Object.
_Avoid_: Drawing, path

**Line**:
A Stroke whose end does not return to its start. A Grounded Line stays fixed exactly where it was drawn until its Pieces break, and what a Collapse cuts off falls; one that isn't hangs Frozen where it was drawn, and once freed falls as one rigid body in its drawn shape. Once it has fallen it stays loose, like an Object, and never becomes Grounded again.
_Avoid_: Wall, platform, segment chain

**Grounded**:
The state of a Line that touches the Terrain, or a Grounded Line, transitively, within a small tolerance (about half a Line's thickness), so one drawn to end at the ground counts. Objects, Rubble and Enemies never ground a Line. A Frozen Line a Grounded one is drawn to touch becomes Grounded where it hangs, unless it has fallen.
_Avoid_: Anchored, supported, pinned

**Object**:
A Stroke that closes on itself. A movable body with exactly the drawn shape.
_Avoid_: Shape, body, prop

**Outline**:
The closed Stroke that forms an Object. Its Colour decides the Object's surface behaviour.
_Avoid_: Shell, border

**Fill**:
Ink added inside an Object's Outline. Its Colour decides the Object's weight or effect, and it is released when the Object breaks.
_Avoid_: Core, content

**Frozen**:
The state of an Object, or of a Line that isn't Grounded, that hangs where it was drawn, ignoring gravity, until a hard hit, a strong enough Blast or the player's Release frees it.
_Avoid_: Pinned, asleep, static

**Release**:
The player's action of unfreezing a Frozen Object or Line during a Wave.
_Avoid_: Activate, trigger, drop

**Squeeze**:
What happens to an Object a new Line is drawn across: it slides the shortest way off the Line that leaves it clear of the Terrain, other Objects, Rubble and other Lines, passing through them on the way, then carries on from rest, touching the Line it slid off. It deals and takes no damage while it slides, and what it touches where it stops is Settled.
_Avoid_: Push-out, overlap

**Eraser**:
The player's tool for clearing away what they no longer want, on hand in the Campaign as in Free play. It quietly removes whatever its brush passes over, whole Objects with their Fills, the Pieces of Lines, Rubble, Droplets and Patches. Erasing is not breaking: nothing bursts into Debris, releases its Fill or sets off a Blast. It refunds the Ink paid for what it removes, like undo.
_Avoid_: Delete, rubber

### Breaking

**Piece**:
One short section of a Line, about one enemy wide, that has its own durability and breaks off as a whole, also from a Line falling as one body.
_Avoid_: Segment, chunk

**Collapse**:
What happens when a Piece of a Grounded Line breaks, is erased or is undone with its Line: grounding is checked again over connected runs of Pieces, and each run no longer connected to the Terrain, directly or through Grounded Lines, falls at once. Each Line's run is a rigid body of its own, a fallen Line; a Line cut in two keeps standing where it still reaches the ground.
_Avoid_: Cave-in, structural failure

**Debris**:
The fragments a broken Piece or Object bursts into, and the pop of an Enemy that dies. Purely visual.
_Avoid_: Rubble (which is physical)

**Rubble**:
The pebbles (grey) or stones (black) a Fill releases when its Object breaks. Real bodies that roll, pile up and hit things, but never break, and vanish a few seconds after they are released.
_Avoid_: Shrapnel, Debris

**Spill**:
The Droplets that fly out when a blue or green-filled Object breaks.

**Droplet**:
One flying bit of a Spill. It sticks to the first enemy or surface it hits and becomes a Patch there.
_Avoid_: Drop (reserved for enemy Ink drops), splash

**Patch**:
The strip of spilled ink a Droplet leaves on an enemy or surface. It behaves like its Colour, is sized by the amount of Fill that was spilled, and wears away as it is used.
_Avoid_: Puddle, stain

**Blast**:
The ring of force that spreads out from red ink when it is destroyed, weakening with distance.
_Avoid_: Shockwave, explosion radius

### Ink

**Colour**:
One of the five ink materials: grey, blue, green, black, red.
_Avoid_: Material (in player-facing text), pigment

**Ink**:
The resource spent on Strokes and Fills, held per Colour. Also what enemies drop.
_Avoid_: Pigment, paint, mana

**Ink Tank**:
The per-Colour store of Ink, with a maximum. Strokes and Fills during a Wave are paid from it, Drops go into it, and every Intermission refills it to its maximum.
_Avoid_: Pool, budget

**Drop**:
The Ink of every Colour an Enemy lets out when it dies, picked up straight into the Ink Tanks and spendable at once. What doesn't fit is lost. An Enemy that reaches the Ink Core drops nothing.
_Avoid_: Loot, reward

### Enemies

**Enemy**:
An upright physics body that walks toward the Ink Core over whatever it stands on, pushing with a force up to its type's limit. It dies when its HP runs out, from hits, falls, Blasts and the like, or when it falls below the bottom of the screen, and disappears when it reaches the Ink Core: when it, or a green Object stuck to it, touches it.
_Avoid_: Mob, unit, creep, walker (in player-facing text)

**Crawler**:
The basic slow walker. It climbs other Enemies.

**Runner**:
A fast walker. It climbs other Enemies, and so hops over slower ones.

**Heavy**:
A slow, heavy walker that wears down Lines quickly. It never climbs, but other Enemies can climb it.

**Climbing**:
An Enemy pressing a step whose top is at most 1.2 of its own heights above its feet gets an upward force, capped like its walking. The step is another Enemy (its top, with any Enemies standing on it), or a wall of the Terrain, an Object or a Line, however steep, even upright. A higher step it only presses. Standing on other Enemies raises its feet, so against a tall wall, climbing Enemies build a staircase of themselves and get over it from the top.
_Avoid_: Jumping, hopping, stacking (as a scripted move)

**Pressing**:
An Enemy pushing against a Piece or an Object it cannot move past: a surface steeper than about 45°, or an Object too heavy, Frozen or wedged to shove. Whatever an Enemy presses wears at its type's rate, half again for each other Enemy in its **Stack**; what it stands on wears at the floor wear times its rate. A stalled Enemy presses whatever touches it from any side but below, however slightly, such as a corner catching its head or a Piece left hanging over it on a slope. Wear goes by time in contact, not force, and never wakes a Frozen Object.
_Avoid_: Attacking, wall (a Line is never called a wall)

**Stack**:
Enemies standing on one another: one, those standing on it, those it stands on, and so on. A Stack presses harder: each Enemy in it wears what it presses faster for every other one.
_Avoid_: Pile, tower, pyramid

**Siege Walker**:
The Campaign's final boss: a multi-legged heavy enemy meant to be beaten with physics rather than raw damage.

### Simulation

**Game**:
The rules layer over the Sandbox world: the Ink Tanks, what Strokes and Fills cost, undo, and with Waves on, the Waves and the Intermissions. The gallery and the stress tests build below it, for free.
_Avoid_: Controller, manager

**Arena contents**:
Everything the simulation tracks and Reset brings back: the Ink Core's HP, Strokes (with their Pieces and Fills), Rubble, Enemies, Bonds, Droplets, Patches and Blasts still spreading. Debris is not part of it.
_Avoid_: Entities, world state

**Settled**:
Two things already touching when physics starts, or when a Squeeze ends. Their contact deals no damage, sticks nothing and lands no Droplet until they come apart.
_Avoid_: Resting contact

**Bond**:
What holds a green Object to the first new thing it touched after it started moving: a rigid joint where they touched. It lasts until either side breaks, is undone or is removed by a cap; the green Object then falls free and never sticks again.
_Avoid_: Weld, glue joint

## Retired terms

No longer part of the game since [ADR 0012](docs/adr/0012-continuous-building-between-intermissions.md); their code is kept at the git tag `build-phase-core-zone`.

- **Build Phase**: the paused phase before a Wave, where the player drew anywhere and undid freely. Replaced by building during the Wave and the Intermission.
- **Core Zone**: the circle around the Ink Core, the only place the player could draw during a Wave.
- **Locked Ink**: Ink left over from the Build Phase, kept in the Ink Tank but not spendable during the Wave.
- **Wave Ink**: Ink dropped by kills in the current Wave, the only Ink spendable during it.
