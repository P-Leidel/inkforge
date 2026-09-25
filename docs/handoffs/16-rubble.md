# Handoff: #16 Rubble

Issue: https://github.com/P-Leidel/inkforge/issues/16 (slice 7 of 13; blocked by #15). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

A broken grey-filled Object releases up to 18 pebbles, and a black-filled one up to 8 stones. Rubble is flung out with the Fill kick, rolls, piles up and deals damage by the normal rule, but never breaks. Blue, green and red Fills still release only Debris until #18 and #19.

## Read first

- In the spec: [Grey, black and Rubble](../specs/m2-colours.md#grey-black-and-rubble), [Fill release](../specs/m2-colours.md#fill-release), [Damage](../specs/m2-colours.md#damage), [Frozen](../specs/m2-colours.md#frozen) (the mass-aware wake) and [Sandbox controls](../specs/m2-colours.md#sandbox-controls) (undo, Clear, Reset).
- The commits of #14 (`73c1655`), `64210ef` and #15 (`1e13bc5`). #15 made Pieces, the `role` on Breakables, the per-Stroke impact rule and exact transforms; the README's patterns section sums them up.

## What already exists

**Breaking.** `SandboxWorld.breakObject` bursts Debris and removes the Object; nothing comes out of the Fill yet. This is where Rubble belongs.

- Make the Fill release one function, e.g. `releaseFill(object)`. #18 adds Spills to it and #19 adds Blasts.
- Give it what it needs before the body is removed: the pose, the velocity and the angular velocity.

**Mass.** `fillMass(outline, fill, table)` in `src/materials/mass.ts` is the Fill's total mass (area × Fill density × `inkMass`). The total Rubble mass must equal it.

**Physics module (`src/physics/`).** It has no circle bodies yet. Moving bodies are assumed to be Objects in three places, and Rubble must join all three or it stays harmless:

- `hitInertial` treats anything that isn't a moving Object as immovable. A pebble hitting a Piece would then have two immovable sides and report an impulse of 0, so it would deal no damage.
- `snapshotMotion` records only moving Objects, so a pebble could never wake a Frozen Object.
- Object shapes enable hit events, and Line and Terrain shapes don't. Rubble shapes must enable them too, or a pebble hitting a Piece isn't reported at all.

Also update the docs that say "at least one belongs to an Object": `StepReport.hits` in `physics-world.ts`.

- `getMass` and `setMass` use a unit mass computed from polygon parts, so a circle needs its own.
- `addObject` records a `Placement`, so `getTransform` and `getVelocity` give back exactly what the body was created with (see Exact transforms in the README). A circle created with a pose and a velocity needs the same, or R and then Space drift once Rubble is in a snapshot.

**Sandbox world.**

- `partyFinder()` returns null for bodies it doesn't know, and `MaterialRules.applyStep` skips hits with a null Party. Give Rubble a Party with a stable key (e.g. `rubble ${id}`), `target: null` (it takes no damage) and `sliding: false`. Without a `stroke` field, each pebble counts as its own impact, which is right: pebbles are separate bodies.
- `fillAt` and `release` only look at Objects, so Rubble can't be filled or Released. Keep it that way.
- The overlap rule lives in the pipeline: `overlapsSolid` in `src/stroke/stroke-pipeline.ts` refuses an Object that overlaps `context.terrain` or `context.objects`, which are convex polygons in world coordinates.
  - `strokeContext()` in `sandbox-world.ts` builds that context. Add Rubble there, either as a convex polygon per circle or as a list of circles with a circle-polygon test.
  - `previewStroke` uses the same context, so the red refusal while drawing comes for free.

## Suggested design (a proposal)

**Table.**

- Per Colour under `fill`, add:
  - `kickSpeed`: blue and green will use it in #18, and Droplets should be fastest.
  - For grey and black: the maximum count (18 and 8), a radius for each piece (say about 7 px for pebbles and 11 px for stones) and an area per piece, so the count grows with area. Use 0 for Colours that release no Rubble.
- Shared: `rubbleCap: 150` and the kick's spread (an angle, and perhaps a speed jitter).

**Packing: a pure function, unit-tested first.** Something like `packRubble(outline, fillArea, colour table values, random)` in `src/sandbox/rubble.ts`:

- Count: `n = clamp(round(area / areaPerPiece), 1, max)`.
- Candidate centres: a hex grid over the Outline's bounds.
  - Keep only circles that lie inside the Outline with a margin of at least `r + 1` px from every edge.
  - Shuffle or jitter with the seeded generator, and take up to `n`.
  - If fewer fit, fewer come out.
  - If none fit (a thin or tiny Outline), shrink the radius until one fits at the point deepest inside. There is always at least 1.
- Mass: each piece gets `total / count`, "however much space the packing leaves".
- Unit tests (from the issue):
  - between 1 and 18 (or 8) pieces, growing with area;
  - no overlaps, all inside the Outline;
  - total mass equal to the Fill's;
  - add a thin Outline and a tiny one.

**Kick.**

- Each piece starts with the Object's velocity at that point (v + ω × r) plus `kickSpeed` outward from the Object's centre.
- The direction is rotated by a seeded angle within the spread; a piece at the very centre gets a seeded direction.
- Draw all of it from `world.random` in a fixed order, so R replays it exactly.

**Physics.** Add something like `addCircle({ position, radius, mass, surface, velocity, angularVelocity })` returning a `BodyId`: a dynamic body with hit events on.

- Keep the physics module Colour-free: call the kind `'circle'`, not `'rubble'`.
- Include it in `hitInertial` and `snapshotMotion`.
- #18's Droplets will reuse it with options (a collision group, never waking a Frozen Object), so leave room for an options object.
- For the surface, the Fill Colour's Outline surface is a reasonable default: grey pebbles grip like grey, black stones like black.

**Sandbox world.**

- Keep a Rubble list, e.g. `{ id, colour, radius, mass, body }`, with ids from a counter that is never reset, like `nextStrokeId`.
- Add a view, e.g. `world.rubble` with `{ id, colour, radius, transform, velocity }`, for the renderer, the overlay and the tests.

**Cap.** When a release would go over 150, the oldest Rubble goes first. The simplest way to "fade out" is to remove the body at once and leave a short fading ghost that the renderer draws, so the cap is a hard limit on bodies. Record what you choose.

**Snapshot.**

- Save each piece's pose, velocity and angular velocity, plus whatever the fade needs.
- `rebuild` re-adds Rubble in id order after the Strokes.
- Clear removes Rubble. Undo leaves it, since it is never in the history.

**Drawing.**

- Draw circles in the Fill Colour's texture (grey grainy, black solid). `fillInk` takes a polygon, so a many-sided polygon will do.
- F1 draws the collider circles. Rubble gets no durability label, since it never breaks.

## Watch out for

- Overlapping bodies fly apart violently. Staying inside the broken Outline with a margin keeps Rubble clear of everything else, since nothing else can be inside a broken Object.
- Once `snapshotMotion` includes Rubble, a fast pebble can wake a Frozen Object by the mass-aware rule. The spec wants "a pebble doesn't wake a Frozen black Object that a same-mass hit would"; add that test with real Rubble.
- **Rubble is light, and thresholds are per hit.** The spec calls Rubble a real weapon, so check that it can deal damage in play. Tune the counts, areas or thresholds if it can't. With the numbers at `1e13bc5`:
  - The pebbles from a 60 px grey-filled box weigh about 0.15 each (2.7 ÷ 18). One must hit at about 2400 px/s to beat a grey Piece's threshold of 400, and at about 1800 px/s for red's 300.
  - A black stone from the same box weighs about 1.0 (8.1 ÷ 8) and beats 400 from about 360 px/s.
- Existing tests break grey-filled Objects, e.g. `breakSomething` in `src/sandbox/breaking.test.ts`: a red ball filled grey. They will now release Rubble.
  - "Clear removes everything" expects `bodyCount` 1 afterwards, so Clear must remove the Rubble bodies.
  - The gallery replay test (`played`) compares Objects and Pieces; extend it to Rubble.
- A Rubble pile can put more than 64 contacts on the ground. See the contact buffer note in the README.
- Watch performance with the cap full, and run `npm run verdict` at the end.

## Tests (from the issue)

- Unit: the Rubble generation above.
- Headless Sandbox world:
  - a broken grey-filled Object releases up to 18 pebbles with the Fill's total mass;
  - the Rubble cap;
  - an Object drawn over Rubble is refused (`overlaps`);
  - Reset after Rubble was released.
- Worth adding:
  - a pebble damages a Piece it hits hard;
  - the pebble-versus-black-Object wake test;
  - a black-filled Object releases at most 8 stones, heavier each than grey's pebbles from the same area.

## Gallery and README

- Demo: a grey-filled and a black-filled box broken side by side, e.g. dropped from a height onto a hard surface.
- README: a paragraph on Rubble, and the demo in the gallery paragraph.
