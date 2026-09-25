# Inkforge

A 2D side-view physics defense game: the player draws lines and objects with scarce, colour-coded ink to stop enemy waves from reaching the Ink Core.

## Language

### Arena and run

**Arena**:
One fixed, non-scrolling screen seen from the side, with gravity, terrain, a Spawn and the Ink Core.
_Avoid_: Map, level screen

**Ink Core**:
The structure the player defends. The run is lost when its HP reaches zero.
_Avoid_: Base, tower, heart

**Spawn**:
The arena edge where enemies enter.

**Terrain**:
The arena's own, hand-built ground and walls. Not drawn by the player and never breaks.
_Avoid_: Ground (when drawn strokes are meant)

**Core Zone**:
The visible circle around the Ink Core, the only place the player may draw during a Wave.
_Avoid_: Build zone, safe zone

**Build Phase**:
The untimed phase before a Wave. Physics is paused, the player can draw anywhere and undo.
_Avoid_: Prep phase, planning phase

**Wave**:
The phase in which physics runs and enemies walk toward the Ink Core. No undo.
_Avoid_: Round, combat phase

**Campaign**:
The first mode: a fixed sequence of handmade arenas and waves. Ink Tanks reset to a set amount every Wave.

**Roguelite Mode**:
The mode unlocked by beating the Campaign's final boss. Ink carries over between Waves, and the player picks upgrades.
_Avoid_: Endless mode

### Drawing

**Stroke**:
One continuous drag of the pointer in one Colour. Becomes either a Line or an Object.
_Avoid_: Drawing, path

**Line**:
A Stroke whose end does not return to its start. Stays fixed exactly where it was drawn, even in mid-air, until its Pieces break.
_Avoid_: Wall, platform, segment chain

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
The state of an Object that hangs where it was drawn, ignoring gravity, until a hard hit, a strong enough Blast or the player's Release frees it.
_Avoid_: Pinned, asleep, static

**Release**:
The player's action of unfreezing an Object during a Wave.
_Avoid_: Activate, trigger, drop

**Squeeze**:
What happens to an Object a new Line is drawn across: it slides the shortest way off the Line, passing through Terrain and Lines, then carries on from rest. It deals and takes no damage while it slides.
_Avoid_: Push-out, overlap

### Breaking

**Piece**:
One short section of a Line, about one enemy wide, that has its own durability and breaks off as a whole.
_Avoid_: Segment, chunk

**Debris**:
The fragments a broken Piece or Object bursts into. Purely visual.
_Avoid_: Rubble (which is physical)

**Rubble**:
The pebbles (grey) or stones (black) a Fill releases when its Object breaks. Real bodies that roll, pile up and hit things, but never break.
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
The per-Colour store of Ink, with a maximum.
_Avoid_: Pool, budget

**Locked Ink**:
Ink left over from the Build Phase. It stays in the Ink Tank but cannot be spent during the Wave.

**Wave Ink**:
Ink dropped by enemies killed during the current Wave, spendable immediately inside the Core Zone.

### Enemies

**Crawler**:
The basic slow walker.

**Runner**:
A fast walker.

**Heavy**:
A slow, heavy walker that wears down Lines quickly.

**Siege Walker**:
The Campaign's final boss: a multi-legged heavy enemy meant to be beaten with physics rather than raw damage.

### Simulation

**Arena contents**:
Everything the simulation tracks and Reset brings back: Strokes (with their Pieces and Fills), Rubble, and later Droplets, Patches, Bonds, Blasts and enemies. Debris is not part of it.
_Avoid_: Entities, world state

**Settled**:
Two things already touching when physics starts. Their contact deals no damage, sticks nothing and lands no Droplet until they come apart.
_Avoid_: Resting contact
