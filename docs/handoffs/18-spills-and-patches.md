# Handoff: #18 Spills and Patches

Issue: https://github.com/P-Leidel/inkforge/issues/18 (slice 9 of 13; blocked by #17). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

A broken blue- or green-filled Object throws out a Spill of 10–15 Droplets. Each Droplet leaves a Patch where it first lands: a thin strip of ink that bounces (blue) or glues (green), moves with whatever it is on, and wears away as it is used.

## Read first

- In the spec: [Spills and Patches](../specs/m2-colours.md#spills-and-patches), [Fill release](../specs/m2-colours.md#fill-release), [Green](../specs/m2-colours.md#green) (glue drag, wear by use) and [Blue](../specs/m2-colours.md#blue).
- The commits of #15, #16, #24, #27 and #17: Pieces, Rubble (`addCircle`, the Fill release, the cap), each kind of Arena contents in a module of its own, the Contact ledger, and glue drag with its wear and "host gone".
- **The user decided (2026-09-25):** a hit on a Patch damages the Patch's host by the normal rule. The Patch itself takes no damage, and a blue Patch wears by the impulse of the bounce.

## What already exists

- **Arena contents** (#24). Each kind is a module behind `Kind` (`src/sandbox/arena-contents.ts`), and the Sandbox world runs its list of kinds in order. See README, "Patterns the slices follow".
- **Fill release** (#16) is `releaseFill(fill)` in `sandbox-world.ts`, handed the `ReleasedFill` (Colour, mass, local Outline, and the Object's pose and motion) that `strokes.break` reports for a broken Object. It puts out Rubble for grey and black Fills; blue and green Fills still give only Debris. The Fill kick is in the table: `kickSpeed` per Fill Colour (blue 400 and green 300 px/s, already the fastest; grey and black 200) and the shared `kickSpread` (0.35 rad either side). `launchRubble` in `src/sandbox/rubble.ts` applies it to any list of centres inside the Outline, so Droplets can reuse it.
- **`addCircle(def: CircleBodyDef)`** (#16) makes dynamic circle bodies with hit events on, a `Placement`, and an angular damping so they roll to a stop. Add the Droplet options as optional fields of `CircleBodyDef`.
- **The Contact ledger** (#27, `ContactLedger` in `src/sandbox/contact-ledger.ts`, the Sandbox world's `contacts`) gives every rule its contacts. Each step it gives, in the engine's report order:
  - `hits`: `{ a, b, hit }`, two Parties and the `ContactHit` with its shapes;
  - `newContacts`: `{ a, b, pair }`, two Parties that didn't touch as the step began and do at its end, with the shape pair that made them touch;
  - `touching(body)`: `{ party, pairs }` for each other Party touching that body's Party, with the shape pairs between them.

  It has already dropped Settled pairs (`CONTEXT.md`) from hits and new contacts, and Squeezed Objects from everything. A Party (`Party<T>`: `id`, `stroke`, `body`, `target`) has a numeric id that is never reused and stays the same through a rebuild; each record keeps it as `party`. Each kind gets the ledger's `PartyIndex` when it is constructed, registers its bodies' Parties as it adds them (`newId`, `register`), and unregisters them as it removes them (`unregister`).
- **Glue drag** (#17) is applied once per body per step for bodies touching green Pieces, read from the ledger. Its wear goes to the Pieces.
- **Hits name their shapes** (`shapeA`, `shapeB`). A `ShapeId` stays the same when an Object's body is rebuilt, but not through `physics.reset()`.
- **Three adapter functions** in `box2d-physics-world.ts` must change for Patch shapes:
  - `setSurface(id)` and `setMass(id)` loop over every shape of a body (`b2Body_GetShapes`), so a Patch shape would get its host's surface and density. Limit them to the body's own shapes. Whenever the table changes, the Sandbox world calls each kind's `applySurfaces`, which calls `setSurface` for each of its bodies (`bodiesOf` in `Strokes`).
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

**Kinds.** Droplets and Patches become kinds (#24's decision), after their hosts in the world's list: Strokes, Rubble, Bonds, then Droplets and Patches. Each owns its records, ids, views and snapshot part, registers its bodies' Parties with the ledger, and implements every part of `Kind`. Kinds never call each other: the world hands a landed Droplet's Patch from one to the other, and passes a broken Object's Spill from `releaseFill` to Droplets.

**Droplets.**

- Use `addCircle` with options:
  - a collision group so Droplets ignore each other (negative `groupIndex`);
  - "never wakes a Frozen Object": the adapter's wake loop in `step()` must skip such hitters;
  - optionally `isBullet`.
- Continuous collision against fixed bodies is already on. Test Droplets against a thin Line the way the milestone 1 ball cannon does.
- Count: `10 + floor(6 × random)` from `world.random`. Unit-test it across seeds.
- Spawn inside the Outline, e.g. with #16's packing or seeded points kept clear of the edges, and launch with the Fill kick. `packRubble` returns nothing for Colours whose `rubbleMax` is 0, so for Droplets export and reuse its hex-grid helper (`hexSpots`) rather than calling it.
- Droplets register Parties, since they need the ledger's new contacts to land. The Material rules must skip Droplet Parties, though: they deal and take no damage. Mark them on the Party (`Party` in `contact-ledger.ts`), or give them their own `stroke` rule; decide.
- Droplets are not solid: leave them out of `solids()`, so a Stroke can be drawn through a Spill.
- Droplets leaving the Arena (outside `0…arena.width × 0…arena.height`, with a margin) vanish.

**Landing.**

- A Droplet lands at its first entry in the ledger's new contacts (Settled pairs are already left out). Remove the Droplet, and add a Patch on the other body in the same step.
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

**Patch record.** `{ id, colour, host Party id, local segment, length, wear, shapeId }`, and a view for the renderer.

**Behaviour.**

- **Blue:** its restitution does the bouncing. Each of the ledger's hits naming its `ShapeId` wears it by the hit's impulse. The Material rules' "one impact per Stroke" is for damage only; wear counts every hit.
- **Green:** a body touching a green Patch shape gets glue drag. The ledger's touching is per Party, so check the `pairs` of the host's `touching(hostBody)` entries for the Patch's `ShapeId`. Keep it once per body per step across green Pieces and green Patches. The drag's momentum is charged to the green things touched. The Patch's host isn't dragged by its own Patch.
- **Hits on a Patch** damage its host by the normal rule (the user decision). Patches take no damage from hits or Blasts.
- **Capacity** is `capacityPerLength × length`. At capacity, remove the shape and burst a puff of Debris.

**Lifetime.**

- A Patch vanishes when its host breaks, is undone, or is removed by the Rubble cap. Patches hear it through "host gone" (#17): the world hands every kind what each step or command removed.
- Patches on Terrain last until worn out.
- The cap: at most 200; the oldest goes first.
- Clear removes Patches. Undo leaves the ones on other hosts, since they are never in the history.

**Snapshot.**

- Save Droplets in flight: pose, velocity, colour, length share.
- Save Patches: host Party id, local segment, colour, length, wear.
- `restore` adds Patches after their hosts, since Patches come after them in the list of kinds. They get new `ShapeId`s, since ids restart after a reset, so the Patches kind maps them.
- Spec: "a Droplet already touching something at the snapshot doesn't land again." The ledger's new contacts already leave out Settled pairs, so this needs no extra work. Test it.

**Views.** Each kind's views are in `world.contents`, so the gallery replay test covers them. Forward a getter to them for the renderer, like `world.rubble`.

**Drawing.** Droplets as small circles in their Colour. Patches as strips in their Colour's texture, drawn with the host's transform when the host moves.

## Watch out for

- Droplets are light and fast. Make sure a Droplet never wakes a Frozen Object: the adapter's wake loop is separate from the Material rules, so both must skip it.
- A Patch on a Frozen host must survive the host waking (an issue criterion). Test it.
- Blasts (#19) don't affect Patches. Keep Patch shapes out of anything #19 will query, or make them easy to filter.
- The contact buffer (README) matters more now: Patches add shapes and contacts.
- Replays: the gallery replay test compares `world.contents`, so a demo with a Spill covers Droplets and Patches once their kinds have views.

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
