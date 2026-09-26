# Spec: Milestone 2, Colours

Roadmap step 2 of the [GDD](../gdd.md#15-roadmap). Terms in **bold** are defined in [`CONTEXT.md`](../../CONTEXT.md). Builds on the [milestone 1 spec](m1-physics-sandbox.md).

## Problem Statement

Milestone 1 turns drawings into sane physics bodies, but everything is made of one neutral material. The game's promise is that **Colour is material**: the same Stroke behaves differently in grey, blue, green, black and red, as a Line, as an Outline and as a Fill. Until each Colour has its own behaviour, breaking works, and Fills come out when Objects break, we can't tell whether the five Colours are clearly distinct in play (GDD §17), and nothing in the ink economy, enemies or defence loop can be tuned against real materials.

## Solution

The milestone 1 sandbox gains the five Colours in all three roles, breaking, Rubble, Spills and Patches, and Blasts. The player picks a Colour, draws, clicks inside Objects to fill them, presses Space and watches structures bounce, stick, crack, spill and explode. R resets the world to the moment physics last started, so building, breaking and retrying is quick. A Colour gallery sets up ready-made demos, and an F2 panel tunes every material number live. There is still no ink cost and no enemy. Every build is deployed to GitHub Pages, as in milestone 1.

The milestone answers one question: **are the five Colours clearly distinct, and does breaking feel physical?**

## User Stories

### Colours and palette

1. As a player, I want to pick a Colour with keys 1–5 or by clicking the palette, so that switching materials is quick.
2. As a player, I want the pointer and the Stroke in progress to show the current Colour, so that I know what I'm about to draw.
3. As a player, I want each Colour to have its own texture as well as its hue, so that I can tell Colours apart at a glance, even if I'm colour-blind.
4. As a player, I want every Colour to follow the same drawing rules, so that only the material changes when I switch.

### Fill

5. As a player, I want to click inside an Object with a Colour selected to fill it, so that I can choose its weight or effect.
6. As a player, I want a click to count only when the pointer barely moves, so that a short drag inside an Object still draws a Line.
7. As a player, I want an Object to weigh what its Outline weighs plus what its Fill weighs, so that a filled Object feels heavier than a hollow one.
8. As a player, I want clicking an already filled Object to tell me "Already filled", so that I know why nothing changed.
9. As a player, I want Ctrl+Z to undo a Fill on its own, so that I can change a Fill without redrawing the Object.
10. As a player, I want to fill Frozen and moving Objects, paused or running, without waking a Frozen Object, so that filling never disturbs my setup.
11. As a player, I want every Outline and Fill pair to be allowed, including the same Colour twice, so that I can experiment freely.

### Breaking

12. As a player, I want hard hits to damage both things that collide, more for heavier and faster bodies, so that damage follows the physics.
13. As a player, I want resting weight and sliding not to cause damage, so that structures don't crumble on their own.
14. As a player, I want a Line to break Piece by Piece while the rest stays fixed, so that walls wear down gradually.
15. As a player, I want Lines and Objects to show cracks as they lose durability, so that I can see what's about to go.
16. As a player, I want broken Pieces and Objects to burst into Debris that fades, so that breaking looks satisfying without cluttering the Arena.
17. As a player, I want a Line and an Object drawn over each other not to take damage while physics pushes them apart, so that pressing play doesn't break or blow up my build.

### Grey and black

18. As a player, I want grey to be a plain material that breaks after a few hits, so that it is my everyday building stuff.
19. As a player, I want black to be heavy, grippy and much tougher than anything else, so that it holds when the rest fails.
20. As a player, I want a broken grey-filled Object to release up to 18 pebbles and a black-filled one up to 8 heavier stones, more for a bigger Fill, so that I can drop showers of Rubble.
21. As a player, I want Rubble to roll, pile up and hit hard enough to deal damage, so that it is a real weapon.

### Blue

22. As a player, I want things to bounce off blue, harder the faster they hit, so that blue works as a trampoline.
23. As a player, I want a blue Object to bounce twice and break on its third hard impact, so that its lifetime is easy to read.

### Green

24. As a player, I want anything moving across green ink to slow right down, heavier things less, so that glue is a real material and not just an enemy effect ([ADR 0007](../adr/0007-glue-drags-every-moving-body.md)).
25. As a player, I want a green Line to wear down as it slows things, so that a glue floor isn't free forever.
26. As a player, I want a green Object to stick to the first new thing it touches once it is moving, so that I can glue things together while physics runs.
27. As a player, I want a green Object stuck to Terrain or a Line to become fixed, and one stuck to a moving Object to move with it, so that sticking is predictable.
28. As a player, I want a stuck green Object to fall free when either side breaks, and never stick again, so that sticking happens once.

### Red and Blasts

29. As a player, I want red to explode when it is destroyed, so that there is one simple rule for when red goes off ([ADR 0008](../adr/0008-red-explodes-when-destroyed.md)).
30. As a player, I want a red bomb to survive rolling down a ramp or a short drop but explode from a real fall or a fast hit, so that I can still aim bombs.
31. As a player, I want a Blast to spread outward as a visible ring and weaken with distance, so that I can read what it will reach.
32. As a player, I want a Blast to push, damage, wake Frozen Objects and destroy other red only where it is still strong enough, so that chain reactions follow distance.
33. As a player, I want a red Line to burn from end to end like a fuse, so that I can build mine strips and timed chains.
34. As a player, I want more red ink to make a bigger Blast, and a red Outline with a red Fill to make one combined Blast, so that more red means more boom.
35. As a player, I want Blasts to pass through walls, so that blowing up my own defences stays part of the game.

### Spills and Patches

36. As a player, I want a broken blue or green-filled Object to throw out 10–15 Droplets, so that its ink spreads over what's around it.
37. As a player, I want each Droplet to leave a Patch where it first lands, on Terrain, a Line, an Object or Rubble, so that I can coat surfaces.
38. As a player, I want a Patch to behave like its Colour (blue bounces, green glues) and to move with the Object it's on, so that spilled ink works like the Colour.
39. As a player, I want a bigger Fill to leave bigger Patches, so that more ink means more coverage.
40. As a player, I want Patches to wear down as they're used and vanish when what they're on breaks, so that Spills don't last forever.
41. As a player, I want Droplets never to deal damage or wake Frozen Objects, so that a Spill doesn't set off red or chip my build.

### Fill release

42. As a player, I want a Fill to come out with an outward kick when its Object breaks, so that Spills spread wide and Rubble gets flung.
43. As a player, I want a bomb's Blast to throw its own released Rubble and Droplets, so that a grey-filled bomb throws pebble shrapnel.

### Frozen

44. As a player, I want a strong enough Blast to wake nearby Frozen Objects and push them, so that Blasts can knock hanging traps loose.
45. As a player, I want a Frozen Object to take damage and break without moving, so that hitting a Frozen bomb or a Frozen glue-filled box still springs the trap.

### Sandbox controls

46. As a player, I want R to reset the world to how it was when I last started physics, damage included, so that I can build, watch it break and try again.
47. As a player, I want Ctrl+Z to remove what's left of my latest Stroke or Fill that still exists, leaving anything it already released, so that undo stays predictable after things break.
48. As a player, I want Clear to remove everything I made, including Rubble and Patches, so that I can start from scratch.
49. As a player, I want a Colour gallery of ready-made demos, so that I can see each Colour's behaviour without building it first.

### Tuning and debugging

50. As a developer, I want F2 to open a tuning panel where every material number can be changed live and copied as JSON, so that tuning is fast.
51. As a developer, I want the F1 overlay to also show durability and Blast rings, so that I can see why something broke.
52. As a developer, I want a Demolition scene, so that I can check performance in a worst case.
53. As a developer, I want Colour behaviour kept out of the physics module, so that the engine can still be swapped ([ADR 0001](../adr/0001-phaser-box2d-physics.md)).
54. As a developer, I want all randomness (Droplet counts and spread, Rubble placement) seeded and restored by Reset, so that runs are repeatable.

## Implementation Decisions

### Scope

- Builds on the finished milestone 1, which keeps Phaser Box2D ([ADR 0001 verdict](../adr/0001-phaser-box2d-physics.md#verdict-milestone-1)). Reviewed against the milestone 1 code before slicing; what that changed is listed under [Further Notes](#further-notes).
- Engine-neutral. Every number below is a starting value, tuned with the F2 panel.
- No ink costs and no Ink Tanks: every Colour is unlimited (milestone 3). No enemies (milestone 4).

### Modules

- **Material table** (pure data). Maps each Colour to its numbers in each role:
  - as a Line: durability, damage threshold, restitution, friction, glue drag;
  - as an Outline: density per length, durability, damage threshold, restitution, friction;
  - as a Fill: density per area, what it releases, kick speed;
  - plus the shared constants for Pieces, Blasts, Rubble, Spills and Patches.

  The F2 panel edits it at runtime and exports it as JSON to paste back into the code.
- **Stroke pipeline** (milestone 1, still pure). Takes the Colour as input and additionally splits each Line into Pieces (see below).
- **Physics module** (milestone 1). Stays engine-neutral and knows nothing about Colours. It gains:
  - the impact impulse on every reported hit, computed from the approach speed and both bodies' effective mass the way the Frozen wake already does (milestone 1 reports only the approach speed);
  - hit reports for every contact that can deal damage (Lines, Objects, Rubble), not only those involving Objects, naming the shape that was hit so a Patch can be told from its host;
  - reports of contacts beginning and ending, per shape (green sticking, Droplets landing, glue drag);
  - friction and restitution per shape;
  - circle bodies (Rubble, Droplets);
  - collision groups, so Droplets ignore each other;
  - bodies that never wake a Frozen Object (Droplets);
  - applying forces and impulses;
  - fixed joints between two bodies (for green sticking only);
  - adding and removing shapes on an existing body (Patches);
  - querying bodies within a radius;
  - setting a body's mass;
  - creating a body with a given angle and linear and angular velocity, and reading its angular velocity back (Reset).

  Whatever is attached to a body (shape friction and restitution, mass, Patches, the green bond) survives Release, wake-on-hit and slide-out. Phaser Box2D rebuilds a Frozen Object's body when it unfreezes ([ADR 0001](../adr/0001-phaser-box2d-physics.md#verdict-milestone-1)), so the adapter carries this state over. The replayed waking hit uses the restitution of the two shapes involved instead of milestone 1's fixed 0.
- **Material rules** (new, headless, part of the Sandbox world). Consumes contact reports and the step clock and applies everything Colour-specific: damage and durability, the blue counter, wear by use, glue drag, green sticking, Blasts, Fill release (Rubble, Spills, the kick) and the caps. It talks to the engine only through the physics module.
- **Sandbox world** (milestone 1). Gains the commands: fill at a point, reset. Submitting a Stroke and filling take the Colour as an argument; the scene remembers the selected Colour, the Sandbox world doesn't. Takes a snapshot whenever physics starts and rebuilds the world from it (see Reset).
- **Phaser scene** (milestone 1). Additionally draws the palette, Colour textures, Fills, cracks, Debris, Patches and Blast rings, and hosts the F2 panel and the gallery buttons.
- **Gallery and Demolition scenes.** Scripted setups built through the Sandbox world, like milestone 1's stress tests.

### Material table (starting values)

| | Grey | Blue | Green | Black | Red |
|---|---|---|---|---|---|
| Durability | medium | low | medium | very high | very low; destroyed means explode |
| Density (Outline and Fill) | 1× | 0.5× | 1× | 3× | 1× |
| Restitution | 0.1 | 0.9 | 0 | 0 | 0.1 |
| Friction | normal | lowest | normal | highest | normal |
| Special | — | Objects break on 3rd hard impact | glue drag (Lines, Patches); Objects stick | — | Blast |

Restitution is never 1 or more, so nothing gains energy from a bounce (milestone 1 stability rule).

### Damage

- Only impacts deal damage: the impulse reported when two bodies hit, not the ongoing contact of resting or sliding.
- An impact whose impulse exceeds the receiver's damage threshold deals `(impulse − threshold) × k` damage to it. Both sides are checked separately against their own threshold. There is no Colour-versus-Colour table.
- Terrain and Rubble take no damage. Frozen Objects do.
- Droplets deal no damage.
- An Object being squeezed off a Line (see Lines and Pieces) deals and takes no damage while it slides. The slide never touches the Line, so an Object drawn over a Line, or a Line drawn through an Object, damages neither.
- Blasts deal damage as described under Blasts.
- At zero durability a Piece or Object breaks. Red explodes instead of just breaking.

### Mass

- Object mass = Outline length × Outline density + Fill area × Fill density.
- The mass is spread evenly over the shape (centre of mass at the centroid). Filling changes the mass immediately.
- Grey's Outline density per length is set so that milestone 1's 60 px stress-test box keeps its milestone 1 mass. The new mass model must keep `npm run verdict` checks 2 (stacking) and 4 (stability) passing, and the ADR 0001 table is updated with the new numbers.

### Lines and Pieces

- After cutting at Terrain (milestone 1), the pipeline splits each part of a Line into equal Pieces, as close to 48 px long as the length allows. A Line shorter than that is one Piece.
- A Piece is one or more of milestone 1's 8 px capsules. The pipeline cuts at Piece boundaries first and then splits each Piece into capsules of at most 32 px (milestone 1's longest capsule), so no capsule straddles two Pieces.
- Each Piece is its own fixed body, with its own durability and cracks. A Line is the ordered list of its Pieces.
- A Piece breaks as a whole: its body is removed and Debris spawns. The rest of the Line stays fixed, even when split in two.
- Milestone 1 squeezes a Frozen Object off a Line drawn through it. Milestone 2 squeezes any Object a new Line crosses, moving or Frozen, the same way: it slides the shortest way off at the push-out speed and restarts from rest. Box2D's own push-out, which milestone 1 still left to moving Objects, can jam an Object made of several convex parts ([ADR 0001](../adr/0001-phaser-box2d-physics.md#verdict-milestone-1)).
- The 48 px length is a tunable constant, to be revisited when milestone 4 sizes the Crawler.

### Fill

- A Fill is a press and release inside an Object with less than 16 px of total pointer movement (milestone 1's minimum Line length). The same click outside any Object does nothing.
- An Object holds one Fill. Clicking a filled Object shows "Already filled" in the rejection flash style of milestone 1.
- A Fill is its own undo step.
- Filling works paused and running, on Frozen and moving Objects (hit-tested at their current position). It never wakes a Frozen Object.
- Any Outline and Fill Colour pair is allowed.

### Frozen

Milestone 1's rules stay: a hard hit from a moving body wakes a Frozen Object, and the waking collision plays out normally. What counts as hard now depends on mass:

- A hit wakes a Frozen Object when the replayed collision would set it moving faster than the wake speed (the impulse it receives divided by its mass), the same test Blasts use below. Milestone 1 compared only the hitter's approach speed, which with Rubble and black would let any pebble wake a boulder. The wake speed is retuned so that two Objects of equal mass behave as in milestone 1.

In addition:

- A Blast wakes a Frozen Object when the push it would give (its impulse on arrival divided by the Object's mass) is faster than the wake speed; the push is then applied. A weaker Blast only damages it.
- A Frozen Object takes damage and can break (releasing its Fill) without moving.
- Droplets never wake a Frozen Object.
- A blue Object's impact counter also counts impacts while it is Frozen.

### Grey, black and Rubble

- Grey is the plain material; black is heavy, grippy and by far the toughest.
- A broken grey-filled Object releases pebbles; a black-filled one releases stones. The count grows with Fill area, at least 1 and at most 18 pebbles or 8 stones.
- Total Rubble mass equals Fill area × Fill density, so black stones are heavier than grey pebbles from the same area.
- Rubble is circular, packed inside the broken Object's Outline without overlapping (overlapping bodies fly apart violently). Each piece's mass is set so that the total matches the Fill, however much space the packing leaves.
- Rubble is not an Object: it is never Frozen, can't be filled or Released, and never breaks. It deals damage by the normal rule, is slowed by glue and can carry Patches.
- Rubble counts as solid for milestone 1's overlap rule: an Object that would overlap Rubble is refused (`overlaps`), like one overlapping Terrain or another Object. Droplets and Patches don't count.
- At most 150 Rubble exist at once. When a release would go over the cap, the oldest Rubble fades out.

### Blue

- Restitution 0.9 on blue Lines, Outlines and Patches. Very slow contacts barely bounce (the engine's minimum bounce speed, tuned).
- A blue Object counts impacts above its damage threshold and breaks on the third. It also has normal durability, so a strong hit or Blast can break it sooner.
- Blue Lines have low durability; bounces that beat the threshold wear them down through the damage rule.

### Green

- **Glue drag.** While a moving body touches a green Line Piece or a green Patch, it gets a force against its motion proportional to its speed, and a matching damping of its spin. The force isn't scaled by mass, so heavier bodies are slowed less. It is applied once per body per step, however many green things the body touches.
- **Wear by use.** Each step, a green Piece loses durability in proportion to the momentum its drag removed. (Patches: see below.)
- **Sticking.** A green Outline sticks once, to the first contact that begins after it starts moving (Released, woken, or pushed by a Blast). Contacts that already existed when it started moving don't count, and neither do contacts while it is Frozen. It can stick to Terrain, Lines, Objects and Rubble.
  - The bond is a fixed joint at the contact point. Stuck to Terrain or a Line, the Object is effectively fixed; stuck to a moving body, the two move as one.
  - A moving green Object that hits a Frozen Object sticks to it; milestone 1's wake rule decides whether the Frozen one wakes.
  - The bond lasts until either side breaks, is undone or is removed by a cap. The green Object then falls free and never sticks again.
  - This is the one runtime attachment [ADR 0003](../adr/0003-no-joints-in-mvp.md) allows. A green Outline sticks; it doesn't add glue drag.

### Red and Blasts

- Red Line Pieces and red Outlines have very low durability and threshold and take damage by the normal rule. When destroyed, they explode. A red Fill explodes when its Object breaks, however that happens.
- **Tuning target:** an unfilled red bomb survives rolling down a ramp or a drop of about its own height, and explodes from a fall of about three times its height or from any fast hit. A filled bomb goes off from lower drops, since impact grows with mass.
- **Blast size.** Radius and strength grow with the square root of the red ink involved (red Outline length × Line thickness + red Fill area), clamped to a minimum and maximum. A red Outline with a red Fill makes one combined Blast. A red Line Piece makes a small Blast of fixed size.
- **The ring.** A Blast expands from the source's centre at about 800 px/s up to its radius R. At distance d its strength is S × (1 − d/R)².
- **On arrival.** When the ring reaches a Line Piece, Object or Rubble (measured to its nearest point), it acts once, at the strength it has there:
  - moving bodies get an outward impulse proportional to that strength;
  - it deals damage when the strength exceeds the receiver's damage threshold (see Damage);
  - it wakes a Frozen Object when the push would beat the wake speed (see Frozen), and then pushes it;
  - red that it destroys explodes in turn. The delay between chained Blasts is simply the ring's travel time.
- **Fuse.** With the default table, a red Piece's Blast must still destroy red 48 px away, so a red Line burns end to end at the ring's speed.
- Blasts pass through Terrain and Lines (no occlusion) and don't affect Terrain or Patches.
- When a red Object explodes, its Fill is released in the same step, and its Blast then acts on the released Rubble and Droplets.

### Spills and Patches

- A broken blue- or green-filled Object releases a Spill of 10–15 Droplets (seeded), spawned inside its Outline and launched by the Fill kick.
- Droplets are small, fast bodies with continuous collision, so they don't pass through thin Lines. They ignore each other and collide with everything else. They deal no damage and never wake a Frozen Object. At their first contact they become a Patch. Droplets that leave the Arena vanish.
- A Patch is a thin strip laid along the surface at the contact point, attached to the body it landed on (Terrain, a Line Piece, an Object or Rubble), and clipped to the edge it landed on. It carries its Colour's behaviour: blue restitution, or green glue drag. It moves with its host and doesn't change the host's mass.
- A Spill's total Patch length grows with the Fill's area and is shared among its Droplets.
- **Wear by use.** A blue Patch wears by the impulse of each bounce it gives. A green Patch wears by the momentum its drag removes. Its capacity grows with its length. At capacity it vanishes in a puff of Debris.
- Hits and Blasts don't damage Patches. A Patch vanishes when its host breaks; Patches on Terrain last until worn out.
- At most 200 Patches exist at once; the oldest is removed first.

### Fill release

- When an Object breaks, its Fill comes out in the same physics step:
  - grey or black: Rubble;
  - blue or green: a Spill;
  - red: a Blast at the Object's centre;
  - no Fill: only Debris.
- Rubble and Droplets inherit the Object's velocity plus a fixed outward kick from its centre, with a seeded spread. The kick speed is set per Fill Colour (Droplets fastest) and doesn't depend on what broke the Object. At equal speed, black stones carry more momentum than grey pebbles.

### Sandbox controls

- **Palette.** Keys 1–5 select grey, blue, green, black, red; the palette bar is clickable. The default is grey. The pointer and the Stroke in progress show the current Colour.
- Space, drawing, Release and F1 work as in milestone 1. The F1 overlay also shows durability on Pieces and Objects, and Blast rings.
- **Reset (R).** Starting physics with Space saves a snapshot of the whole simulation and rebuilds the world from it, so the first run and every retry after R play out identically. (Box2D can't save its own state, and a world rebuilt from scratch doesn't reproduce one that wasn't.)
  - The snapshot holds everything except Debris: Strokes and Fills, poses and velocities, Frozen state, slides in progress, damage, counters and wear, bonds, which green Objects have already stuck and the contacts they started moving with, Rubble, Droplets in flight, Patches, Blast rings still spreading and what they have already acted on, and the random generator's state.
  - Contacts touching when the snapshot is taken don't count as beginning after the rebuild: they deal no damage, stick nothing and land no Droplet.
  - R restores the snapshot and pauses. Before the first snapshot, R does nothing.
- **Undo (Ctrl+Z).** Removes what's left of the latest Stroke or Fill that still exists; fully destroyed Strokes and already released Fills are skipped. Rubble, Patches and Blasts it caused stay. Undoing something a green Object is stuck to frees the green Object as if it had broken.
- **Clear** removes all Strokes, Fills, Rubble and Patches.
- **Tuning panel (F2, in every build, including the deployed one).** Every material table value, editable live, with "copy as JSON". Density changes apply to Objects drawn or filled afterwards; everything else applies from the next step.
- **Colour gallery.** Buttons that each load a ready-made demo through the Sandbox world, for example the same ball dropped onto each Line Colour side by side, or one Object of each Fill broken in a row.

### Visuals

- Each Colour has its own texture as well as its hue: grey grainy, blue glossy, green drippy, black thick and solid, red with a fuse pattern. Placeholder art throughout.
- A Fill is drawn inside its Outline in its own Colour.
- Pieces and Objects show cracks in three stages as durability drops.
- Debris is particles outside the physics world: they fall but collide with nothing, and fade in about 2 s.
- A Blast is drawn as its expanding ring.

### Performance and exit criteria

- **Demolition scene** (gallery button): a chain of 5 red bombs, 3 grey-filled boxes, 1 black-filled box, one blue and one green Spill, and a wall of mixed-Colour Lines. That's about 60 Rubble, 30 Droplets and 5 Blasts in quick succession.
- `npm run verdict` also prints the physics step times for the Demolition scene, so a slow physics step shows up before anyone reads the frame rate.

Milestone 2 is done when all three hold:

1. **Feature-complete** as specified here.
2. **Blind check.** A playtester who hasn't read the GDD plays the sandbox, gallery included, for 10 minutes. Afterwards they can describe what each Colour does as a Line, an Outline and a Fill.
3. **Performance.** The Demolition scene averages at least 60 fps on the baseline machine (see the README), with no frame over 33 ms during the chain.

### Delivery order

Vertical slices, one GitHub issue each, linking to this spec. The slices form one chain: each is blocked by the one before it, and all build on the finished milestone 1. Each slice adds its own demos to the Colour gallery, extends Reset and Clear to what it adds, and updates the README's controls table when it adds a control.

1. **Colours on Strokes.** Palette, material table, textures, per-Colour friction and restitution on Lines and Outlines (kept through Release, waking and slide-out), the gallery buttons with a first demo.
2. **Fill and mass.** Click to fill, "Already filled", Fill as an undo step, the mass model and its calibration, the mass-aware hit wake, the verdict re-run.
3. **Reset.** The snapshot, rebuilding at every start, R.
4. **Tuning panel.** F2, live editing, copy as JSON.
5. **Objects break.** Impact impulses and shape-level hit reports, the damage rule, Object durability, the blue counter, damage to Frozen Objects, cracks, Debris, squeezing any crossed Object, durability in the F1 overlay, undo and Clear with broken things.
6. **Lines break Piece by Piece.** Piece splitting, one fixed body per Piece, Piece durability and cracks.
7. **Rubble.** Grey and black Fill release, packing, the Fill kick, the Rubble cap, Rubble in the overlap rule.
8. **Green.** Glue drag, wear by use, sticking.
9. **Spills and Patches.** Droplets, Patches, wear by use, the Patch cap.
10. **Red Objects and Blasts.** Destroyed means explode, Blast size, the ring, what it does on arrival, chains, Blasts waking Frozen Objects and throwing the released Fill, Blast rings in the F1 overlay.
11. **Red Lines and the fuse.** Red Pieces exploding, the fuse.
12. **Demolition scene.** The scene, a headless check that its chain plays out, its physics step times in `npm run verdict`.
13. **Blind check and frame rate** (for a person, not an agent). The blind check and the Demolition frame rate on the baseline machine.

## Testing Decisions

- As in milestone 1, a good test drives a module through its public commands and checks outcomes the player would notice: "the ball bounced higher off blue than off grey", "this Piece broke and the rest of the Line stayed". Tests don't inspect internal stages or engine objects.
- **Seam 1: pure units.**
  - Piece splitting: the Pieces are equal, close to 48 px and cover the Line.
  - Object mass from Outline and Fill.
  - The damage formula, including both sides and the threshold.
  - Blast falloff, and the fuse: with the default material table, a red Piece's Blast 48 px away destroys red. This runs against the real table, so a tuning change that breaks the fuse fails CI.
  - Rubble generation: at least 1 and at most 18 or 8, growing with area, no overlaps, all inside the Outline, total mass equal to the Fill's.
  - Droplet count between 10 and 15 across seeds.
  - Telling a Fill click from a Stroke.
- **Seam 2: the headless Sandbox world.** Integration tests that submit Strokes and Fills and step the world:
  - a ball bounces higher off a blue Line than off a grey one;
  - a light ball crossing green slows more than a heavy one;
  - a green Line wears down from use;
  - a grey Piece breaks after hard hits and the rest of the Line stays fixed;
  - a blue Object breaks on its third impact;
  - a green Object sticks to its first new contact, is fixed on a Line, and falls free when that Piece breaks;
  - a Fill changes an Object's mass, and a second Fill is refused;
  - a broken grey-filled Object releases up to 18 pebbles with the Fill's total mass;
  - a Spill leaves Patches that wear out and die with their host;
  - a red Line burns end to end;
  - a Blast damages a weakly hit Frozen Object without moving it, and wakes and pushes one it hits strongly;
  - an Object drawn over a red Line doesn't set it off at play;
  - a Line drawn through a moving Object squeezes it off without jamming;
  - a pebble doesn't wake a Frozen black Object that a same-mass hit would;
  - an Object's friction and restitution, and a green bond on it, survive the Object waking;
  - a run, R and the same run again end identically, also after pausing mid-chain;
  - the Demolition chain plays out: 5 Blasts, about 60 Rubble and 30 Droplets;
  - the Rubble and Patch caps;
  - undo, Clear and Reset after things have broken.
- **Browser only.** The blind check, the Demolition frame rate and tuning for feel. These depend on people and hardware, so they are not CI tests.
- Milestone 1's tests are the prior art. CI runs lint, typecheck and all tests on every push.

## Out of Scope

- Ink Tanks, costs, overlap charging, Locked and Wave Ink, drops (milestone 3).
- Enemies and the Ink Core (milestone 4), including the enemy-facing Colour rules: red exploding when an enemy touches it, blue-coated enemies bouncing off things, Droplets sticking to enemies, green Objects stuck to enemies weighing them down, and enemies wearing down Lines by pressing.
- The real Build Phase, Wave and Aftermath, and the Core Zone limits on drawing and filling (milestones 4 and 5).
- Walls blocking Blasts ([ADR 0008](../adr/0008-red-explodes-when-destroyed.md)).
- Repair.
- Joints other than green sticking ([ADR 0003](../adr/0003-no-joints-in-mvp.md)).
- Final art.
- Mobile and touch input.

## Further Notes

- Decided while writing this spec: glue drags every moving body ([ADR 0007](../adr/0007-glue-drags-every-moving-body.md)); red explodes when destroyed, and Blasts act through the normal thresholds ([ADR 0008](../adr/0008-red-explodes-when-destroyed.md)). The GDD is updated to v0.4 and `CONTEXT.md` gains Piece, Rubble, Droplet and Blast.
- Keeping milestone 1's hit-wake rule was briefly reconsidered and confirmed. The review against the milestone 1 code then made it mass-aware (below).
- The 48 px Piece length is provisional until milestone 4 sizes the Crawler.
- The Fill kick is a fixed speed per Colour for now. A later system may shape these trajectories.
- Numbers to tune by feel: the whole material table, above all red's threshold (the ramp and short-drop target), the wake speed, Blast speed and falloff, glue drag strength and Patch capacity.
- Decided while reviewing this spec against the milestone 1 code:
  - A Piece is its own fixed body, not a set of shapes on one Line body, so breaking it needs no shape removal and Patches on it vanish with it.
  - The physics module gains shape-level and begin/end contact reports, circles, collision groups, non-waking bodies and full pose and velocity on creation; the per-contact overlap flag is dropped.
  - State attached to a body must survive Phaser Box2D rebuilding a Frozen Object when it unfreezes.
  - Any Object a new Line crosses is squeezed off it, moving or Frozen; a sliding Object deals and takes no damage. This replaces the overlap exemption.
  - The hit wake is mass-aware, the same test Blasts use, because Rubble and black made the milestone 1 rule let pebbles wake boulders.
  - Grey's Outline density keeps milestone 1's stress-test box at its milestone 1 mass, and the verdict's stacking and stability checks must still pass.
  - Rubble is solid for the overlap rule.
  - Every start rebuilds the world from its snapshot, so retries match the first run; the snapshot holds all simulation state except Debris.
  - The Colour is an argument of each command, not Sandbox world state.
  - The F2 panel ships in every build.
