# Handoff: #19 Red Objects and Blasts

Issue: https://github.com/P-Leidel/inkforge/issues/19 (slice 10 of 13; blocked by #18). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

Red Objects explode when they are destroyed. A Blast spreads out as a visible ring that weakens with distance, and acts once on everything it reaches: it pushes, damages, wakes Frozen Objects and sets off other red. So chains follow distance and ring travel time. A bomb's Blast throws its own released Rubble and Droplets. Red Lines and the fuse come in #20.

## Read first

- In the spec: [Red and Blasts](../specs/m2-colours.md#red-and-blasts), [Frozen](../specs/m2-colours.md#frozen) (Blasts waking Frozen Objects), [Fill release](../specs/m2-colours.md#fill-release) and [Damage](../specs/m2-colours.md#damage).
- [ADR 0008](../adr/0008-red-explodes-when-destroyed.md): red explodes when destroyed, and Blasts act through the normal thresholds. There is no occlusion.
- The commits of #15–#18, #24 and #27, above all the Fill release (#16, #18), each kind of Arena contents in a module of its own (#24), impulses (#17) and Patch shapes and harmless Droplets (#18).

## What already exists

- **Red Outlines** already have the lowest durability in the table: 250 at `1e13bc5`, with a threshold of 300; red Lines' Pieces have the same. Blue's threshold of 200 is lower; the spec wants red's "very low", so consider lowering it while tuning (below). Red Outlines break by the normal rule, but release only Debris.
- **Breaking** (#24). The world's `breakTarget` breaks each target the rules return through `strokes.break`, which removes its body and reports a `Broken`: the Debris to burst and, for an Object, its `ReleasedFill` (Colour, mass, local Outline, and the Object's pose and motion as it broke). A Blast needs more from it: the Outline's Colour and length for red ink, and the Object's centre. Extend `Broken`.
- **The Fill release** (#16, #18) puts out Rubble or a Spill from `releaseFill(fill)` in `sandbox-world.ts`, called by `breakTarget` after the Object's body is removed: `releaseSpill` if the Fill Colour's `spills` is above 0, otherwise `releaseRubble`. Red Fills release nothing (red's `rubbleMax` is 0); their Blast goes in `releaseFill`. Red's `kickSpeed` is 0.
- **Droplets** (#18) are the `Droplets` kind: circles of `dropletRadius` whose records keep their Party id as `party`, registered as harmless Parties (`party.harmless`), which the damage rules and sticking skip. Their bodies never wake a Frozen Object on a hit (`wakes: false`), but `applyImpulse` pushes them like any free body. A Droplet lands at its first new contact, so one a Blast pushes into something lands there.
- **Patches** (#18) have no body or Party of their own: each is a capsule added to its host's body (`physics.addCapsule`), and `patches.isPatch(shape)` tells its shape from the host's own. Hits and contacts on a Patch are its host's.
- **Physics.** `applyImpulse(id, impulse)` (at the centre of mass; it wakes a sleeping body), `applyAngularImpulse`, `getInertia` and `isFree` (a moving Object or circle: not Terrain, a Line, a Frozen Object or a sliding one) came with #17; `release`, `isFrozen` and `getMass` were there before. There is no radius query. **Don't use `b2World_OverlapCircle`: it throws in this port** (see README). Use `b2World_OverlapAABB`, then `b2Shape_GetClosestPoint` per shape. Or use the Sandbox world's own geometry: Object parts moved by their transform, Piece capsules, Rubble and Droplet circles.
- **Damage.** `impactDamage(impulse, threshold, k)` is the formula, and Blasts use it too. The Material rules' private `receive` applies it against the target's own numbers (by its `role`: Line or Outline) and also counts an impact. Blasts need their own entry point that does the first but not the second.

## Suggested design (a proposal)

**Table.** A shared `blast` block:

- `speed: 800` (px/s);
- radius and strength per √(red ink), each with a minimum and a maximum;
- push per unit of strength (1 makes the impulse equal the strength);
- #20 adds the fixed size of a Piece's Blast.

Pick values so a typical bomb (use the gallery's) destroys red within about its own diameter and still cracks grey a little further out.

**Red ink and Blast size.**

- Red ink = the red Outline's length × `LINE_THICKNESS` (if the Outline is red) + the red Fill's area (if the Fill is red).
- Radius `R = clamp(kR·√ink)` and strength `S = clamp(kS·√ink)`.
- A red Outline with a red Fill makes one combined Blast at the Object's centre, its body origin (the Outline's centroid).

**When an Object breaks,** in this order:

1. Debris bursts.
2. The Fill comes out in the same step (Rubble or Droplets).
3. If its Outline or Fill is red, a Blast starts at its centre.

That's how "its Blast then acts on the released Rubble and Droplets" falls out.

**Blasts are a kind** (#24's decision), after the kinds whose bodies they act on (Strokes, Rubble, Bonds, Droplets, Patches). Each Blast is `{ id, centre, R, S, radius now, acted-on Party ids }`, with ids never reused. Its ring grows in the kind's `step` turn. Kinds never call each other, so a Blast doesn't push or damage other kinds' bodies itself: it reports what its ring reached, and the world pushes through the physics module, damages through the Material rules and breaks through `breakTarget`. `Kind.step` returns nothing today; give Blasts their own call for this rather than reaching into Strokes. `MaterialRules.applyStep` reads only the Contact ledger's hits (#27), so Blast damage needs a call of its own there.

**Each step, after the Material rules,** grow each Blast's radius by `speed × dt`, up to `R`. Then act on every Piece, Object, Rubble and Droplet not yet acted on whose nearest point is within the radius, at strength `s = S × (1 − d/R)²`:

- **Moving bodies** (`physics.isFree`: Objects that are neither Frozen nor sliding, Rubble, Droplets) get an outward impulse `push × s`, directed from the centre to the body's nearest point or centre of mass. Decide whether it adds spin.
- **Damage** when `s` beats the receiver's damage threshold, for Pieces and Objects only; Rubble and Droplets never take damage. Blasts are not impacts: they don't count towards blue's impact limit. The spec's Damage section keeps impacts and Blasts apart, and story 23 wants blue's lifetime easy to read.
- **Frozen Objects** wake and get the push when `push × s / mass` beats the wake speed. A weaker Blast only damages them.
- **Green Objects** need no hook. `Sticking` (#17) sees a green Object start moving when it turns free, so a Blast waking a Frozen one covers it. A Blast pushing one already moving needn't restart anything: it flies off what it rested on, and once the two have been apart for 0.25 s it may stick to it again.
- **Red destroyed by a Blast** explodes in turn (by the same break path). The delay between chained Blasts is only the ring's travel time.
- A Blast is finished once its radius reaches `R`.
- **Deterministic order:** Blasts in creation order, bodies by Party id. Ids only grow, so the order is the same in a replay even where the ids differ. Each record keeps its Party id as `party`; the Contact ledger looks a Party up by its id (`contacts.party(id)`, #17).

**No effect on Terrain or Patches.** Blasts pass through Terrain and Lines (no occlusion) and don't affect Terrain or Patches. Measure hosts to their own shapes: with the Sandbox world's own geometry (Object parts, Piece capsules, Rubble and Droplet circles) Patches are never in it; with an engine query, filter Patch shapes out with `patches.isPatch(shape)`.

**View.** The Blasts kind's views (centre, radius now, `R`, strength) are in `world.contents`; forward `world.blasts` to them for the renderer.

- The renderer draws the expanding ring, fading as it weakens.
- F1 draws the ring and its full radius.

**Snapshot.** The Blasts kind's `save` keeps each Blast still spreading, with its radius and what it has acted on. Spec: "a run, R and the same run again end identically, also after pausing mid-chain".

## Tuning target (by feel, not a CI test)

An unfilled red bomb survives rolling down a ramp or a drop of about its own height, and explodes from about three times its height or any fast hit. With the numbers at `1e13bc5` (threshold 300, durability 250, damage per impulse 1):

- **A 40 px unfilled red ball** (mass ≈ 0.75) must take an impulse of 550 to break. That's about 660 px/s at landing: a fall of about 5.5 times its height. It survives 3× (impulse ≈ 406).
- **A 60 px red box** (mass 1.44) just survives a drop of its own height (impulse ≈ 548) and explodes from three times it (≈ 950).

Impulse grows with mass, so one threshold can't give the same drop ratio for every size. Pick the gallery bomb as the reference, retune red's Outline values, and record the numbers in the commit message.

## Watch out for

- **Red in existing demos and tests will now explode:**
  - The **Drop** demo (`DROP_DEMO`) drops a red box next to the grey, blue, green and black ones, and its test expects exact wear bands. Move the red box away or adjust the test, but keep it meaningful.
  - `src/sandbox/breaking.test.ts` breaks red balls in several tests: the Debris test, `breakSomething`, and "a Frozen Object can break without moving". Check that each still tests what its name says.
- **Chains within one step:** a Blast created while other Blasts are being processed starts growing at the next step (or this one; decide), and the result must be deterministic.
- **Droplets:** they never wake anything and take no damage, but Blasts do push them.
- **Blast-created bodies:** Rubble released by a Blast-destroyed Object is inside that Object's own Blast at radius 0, and is acted on as the ring passes. The acted-on set holds Party ids (the Contact ledger's, #27). They are never reused and survive R for whatever is in the snapshot. Rubble released after the snapshot gets new ids in a replay, which is fine as long as nothing depends on the numbers themselves, only on their order.
- **Existing tests with red Objects** now release Rubble when they break: `breakSomething` in `src/sandbox/breaking.test.ts` breaks a grey-filled red ball. Once red explodes, check what its Blast does to them.

## Tests (from the issue)

- Unit: Blast falloff (strength at 0, R/2 and R; clamping of R and S).
- Headless Sandbox world:
  - A Blast damages a weakly hit Frozen Object without moving it, and wakes and pushes one it hits strongly. A heavy box helps here: a 60 px black-filled grey box (mass ≈ 9.5 at `1e13bc5`) has a grey threshold of 400, but needs a push of about 790 to wake, so a Blast between the two damages it without moving it.
  - A chain reaction sets off nearby red but not red beyond reach.
  - A grey-filled bomb's Blast throws its pebbles.
  - A run, R and the same run again end identically, also after pausing mid-chain.

## Gallery and README

- Demos: a chain of bombs; a grey-filled bomb throwing pebble shrapnel.
- README:
  - a paragraph on red and Blasts (the ring, falloff, chains, waking);
  - F1 now shows Blast rings, so update the controls table's F1 row;
  - the demos in the gallery paragraph.
