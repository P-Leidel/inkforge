# Handoff: #18 Spills and Patches

Issue: https://github.com/P-Leidel/inkforge/issues/18 (slice 9 of 13; blocked by #17). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

A broken blue- or green-filled Object throws out a Spill of 10–15 Droplets. Each Droplet leaves a Patch where it first lands: a thin strip of ink that bounces (blue) or glues (green), moves with whatever it is on, and wears away as it is used.

## Read first

- In the spec: [Spills and Patches](../specs/m2-colours.md#spills-and-patches), [Fill release](../specs/m2-colours.md#fill-release), [Green](../specs/m2-colours.md#green) (glue drag, wear by use) and [Blue](../specs/m2-colours.md#blue).
- The commits of #15, #16 and #17: Pieces, Rubble (`addCircle`, the Fill release, the cap), and glue drag with its wear.
- **The user decided (2026-09-25):** a hit on a Patch damages the Patch's host by the normal rule. The Patch itself takes no damage, and a blue Patch wears by the impulse of the bounce.

## What already exists

- **Fill release** (#16) puts out Rubble for grey and black Fills; blue and green Fills still give only Debris. The Fill kick (`kickSpeed` per Fill Colour) is in the table. Droplets should be the fastest.
- **`addCircle`** (#16) makes circle bodies.
- **Glue drag** (#17) is applied once per body per step for bodies touching green Pieces. Its wear goes to the Pieces.
- **Hits name their shapes** (`shapeA`, `shapeB`). A `ShapeId` stays the same when an Object's body is rebuilt, but not through `physics.reset()`.
- **Three adapter functions** in `box2d-physics-world.ts` must change for Patch shapes:
  - `setSurface(id)` and `setMass(id)` loop over every shape of a body (`b2Body_GetShapes`), so a Patch shape would get its host's surface and density. Limit them to the body's own shapes. The Sandbox world calls `setSurface` for every body (`applyMaterials`, via `bodiesOf`) whenever the table changes.
  - `rebuild` re-creates only `rec.parts`, so Patches on a Frozen host would vanish when it wakes. Carry them over with their `ShapeId`s.
- **Object shapes have hit events on.** So a Droplet hitting an Object produces a hit even if the Droplet's own shapes have hit events off.

## Suggested design (a proposal)

**Table.**

- Shared:
  - Droplet radius (about 3 px) and mass (small and fixed; Droplets deal no damage anyway);
  - Patch length per px² of Fill;
  - Patch thickness;
  - Patch capacity per px of length;
  - `patchCap: 200`.
- A Patch's surface can be its Colour's `line` surface: blue restitution 0.9, green's friction. Its glue drag is green's `line` value from #17. Impulse and momentum have the same unit (mass × px/s), so one capacity per length serves both blue and green.

**Droplets.**

- Use `addCircle` with options:
  - a collision group so Droplets ignore each other (negative `groupIndex`);
  - "never wakes a Frozen Object": the adapter's wake loop in `step()` must skip such hitters;
  - optionally `isBullet`.
- Continuous collision against fixed bodies is already on. Test Droplets against a thin Line the way the milestone 1 ball cannon does.
- Count: `10 + floor(6 × random)` from `world.random`. Unit-test it across seeds.
- Spawn inside the Outline, e.g. with #16's packing or seeded points kept clear of the edges, and launch with the Fill kick.
- The Material rules must skip Droplet Parties: they deal and take no damage.
- Droplets leaving the Arena (outside `0…arena.width × 0…arena.height`, with a margin) vanish.

**Landing.**

- A Droplet lands at its first begin that isn't settled. Remove the Droplet, and add a Patch on the other body in the same step.
- Where the Patch goes: the host's surface point nearest the Droplet's centre. The surface is:
  - an Object's Outline, in its body coordinates;
  - the side of a Piece's capsule facing the Droplet;
  - a Terrain polygon's edge;
  - a Rubble circle's tangent there.
- Lay a strip of the Droplet's share of the Spill's length, centred on that point along the edge and clipped to the edge's ends. The Spill's total length is `patchLengthPerArea × fill area`, shared among its Droplets.

**Patch shape.**

- A thin capsule along the surface line, in the host's body coordinates. Its centre line is on the surface, so it stands proud by its radius, and whatever lands there touches the Patch, not the host.
- It has density 0, so it doesn't change the host's mass (checked: see README).
- Physics calls: `addShape(body, capsule, surface)` → `ShapeId` and `removeShape(shapeId)`.
  - Carry Patch shapes over in `rebuild`.
  - Leave them out of `setSurface`, `setMass`, `frozenInertial` and `unitMassOf`.
  - A Piece's body sits at the origin with its capsules in world coordinates (`physics.addLine(piece.segments, …)`), so a Patch on a Piece is in world coordinates too.

**Patch record.** `{ id, colour, host Party key, local segment, length, wear, shapeId }`, and a view for the renderer.

**Behaviour.**

- **Blue:** its restitution does the bouncing. Each hit naming its `ShapeId` wears it by the hit's impulse.
- **Green:** a body touching a green Patch shape gets glue drag. Keep it once per body per step across green Pieces and green Patches. The drag's momentum is charged to the green things touched. The Patch's host isn't dragged by its own Patch.
- **Hits on a Patch** damage its host by the normal rule (the user decision). Patches take no damage from hits or Blasts.
- **Capacity** is `capacityPerLength × length`. At capacity, remove the shape and burst a puff of Debris.

**Lifetime.**

- A Patch vanishes when its host breaks, is undone, or is removed by the Rubble cap.
- Patches on Terrain last until worn out.
- The cap: at most 200; the oldest goes first.
- Clear removes Patches. Undo leaves the ones on other hosts, since they are never in the history.

**Snapshot.**

- Save Droplets in flight: pose, velocity, colour, length share.
- Save Patches: host key, local segment, colour, length, wear.
- `rebuild` adds Patches after their hosts. They get new `ShapeId`s, since ids restart after a reset, so map them in the Sandbox world.
- Spec: "a Droplet already touching something at the snapshot doesn't land again." This is the settled-pair filter applied to Droplet begins.

**Drawing.** Droplets as small circles in their Colour. Patches as strips in their Colour's texture, drawn with the host's transform when the host moves.

## Watch out for

- Droplets are light and fast. Make sure a Droplet never wakes a Frozen Object: the adapter's wake loop is separate from the Material rules, so both must skip it.
- A Patch on a Frozen host must survive the host waking (an issue criterion). Test it.
- Blasts (#19) don't affect Patches. Keep Patch shapes out of anything #19 will query, or make them easy to filter.
- The contact buffer (README) matters more now: Patches add shapes and contacts.
- Replays: extend the gallery replay test to Patches.

## Tests (from the issue)

- Unit: the Droplet count is between 10 and 15 across seeds.
- Headless Sandbox world:
  - a Spill leaves Patches that wear out and die with their host;
  - a ball bounces off a blue Patch on grey Terrain;
  - Droplets never damage or wake a Frozen Object;
  - the Patch cap.
- Worth adding:
  - a Patch survives its Frozen host waking;
  - a hit on a Patch damages the host (the user decision);
  - a green Patch slows a ball and wears.

## Gallery and README

- Demo: a blue and a green Spill breaking over a row of surfaces (Terrain, a Line, a Frozen Object).
- README: a paragraph on Spills, Droplets and Patches; the demo in the gallery paragraph.
