# Handoff: #33 The Material rules decide every consequence

Issue: https://github.com/P-Leidel/inkforge/issues/33 (a refactor slice between #19 and #20). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

The spec gives the Material rules one module, but today they are spread over `MaterialRules`, `Glue`, `Sticking`, three kinds and the Sandbox world. Gather them into one module that decides every Material consequence. The Sandbox world keeps the step order and hands those decisions to the kinds and the physics module. This is a pure refactor: replays, tests and verdict numbers stay the same.

## Read first

- The issue and its acceptance criteria.
- Candidate 1 of the [architecture review after #19](../adr/reports/architecture-review-2026-09-26.html), with its "where each rule is decided" table. Candidate 3 there (the Frozen wake rule) is #35; this slice prepares for it by naming the Blast wake measure.
- In the spec: [Modules](../specs/m2-colours.md#modules), the "Material rules" bullet, and [Damage](../specs/m2-colours.md#damage).
- The commits of #27 (`ce1ce20`: the Contact ledger, the last refactor done this way), #17 (`d7206e4`: glue, sticking), #18 (`01d6128`: Spills, Patches) and #19 (`e832f1d`: Blasts).
- `src/sandbox/sandbox-world.ts` (all of it), `material-rules.ts`, `glue.ts`, `sticking.ts`, and in `patches.ts` `wear`, `wearByHits` and `add`.

## What already exists

- **`MaterialRules`** (`material-rules.ts`): `applyStep(hits)` takes each receiver's strongest hit per Stroke and damages it against its threshold (and counts blue impacts); it returns what broke, in the order the hits first reached it, not yet broken. `applyBlast(target, strength)` damages without counting an impact. `wear`, `durabilityLeft` and `impactDamage` are exported.
- **`Glue`** (`glue.ts`) drags free bodies touching glue and hands the momentum removed to a `wear` callback; the world's `wearGluer` damages a Piece (`gluer.damage += amount`, no threshold, no impact) or uses up a Patch (`patches.wear`), and says whether it wore out.
- **`Sticking`** (`sticking.ts`) returns the Objects that stick this step; the world bonds each at `physics.touchPoint(pair) ?? physics.getTransform(sticker.body)` with `bonds.add`.
- **In the Sandbox world** (the rules the review marks as leaked):
  - `breakTarget(target)`: `strokes.break`, then Debris, then `releaseFill`, then `explode`;
  - `releaseFill`, `releaseSpill`, `releaseRubble`: Spill if the Fill Colour `spills`, else Rubble (none when `rubbleMax` is 0);
  - `explode`: `blastInk` of the Outline and Fill, and `blasts.add(centre, ink)` if above 0;
  - `blastReached` and `outward`: a Blast's damage, wake and capped push;
  - `wearGluer`, `layPatches` and `surfaceOf` (Droplet landing), and `puff`.
- **In `Patches`**: `wearByHits(hits)` decides a hit's wear (`hit.impulse × patchHitWear` for each of the hit's shapes that is a Patch, harmless hits skipped).

## Suggested design (a proposal)

**One entry point.** `MaterialRules` becomes the module's interface. `Glue` and `Sticking` stay in files of their own if you like (a `material-rules/` folder is fine), but the world only talks to `MaterialRules`.

**Ports, not the kinds themselves.** Kinds never call each other, and the rules shouldn't hold the kinds either. Give the rules two narrow ports, wired by the world:

- a physics port, `Pick<PhysicsWorld, …>` of what they call: `getSlide`, `getMass`, `isFrozen`, `release`, `isFree`, `applyImpulse`, `getTransform`, `touchPoint`, and what `Glue` already picks;
- an Arena port for what a decision does to the contents, for example `break(target): Broken | null` (`strokes.break`), `burst(debris)`, `addRubble`, `addDroplets`, `addBlast`, `bond`, `land(newContacts)`, `surfaceOf(host)`, `layPatch(…)` (returning puffs) and `usePatch(patch, amount)`.

Tests then drive the rules with a fake of each, like `glue.test.ts` does today, and without Box2D.

**Damage in one function.** One private function adds damage to a Breakable and answers "broken?", with the cause as a parameter: an impact (threshold, counts towards the impact limit), a Blast (threshold, no count) or wear (no threshold, no count). `applyStep`, the Blast rule and glue wear all call it.

**The step, as the world would read it.** Keep each line of today's order visible in `SandboxWorld.step()`, one rule phase per line, for example:

```ts
const broken = this.rules.impacts(this.contacts.hits);   // damage; not yet broken
this.rules.stick(this.strokes.objectRecords(), dt);      // bonds, before breaks
this.rules.land(this.contacts.newContacts, this.contacts.hits); // Patches, then their hit wear
this.rules.breakAll(broken);
this.rules.glue(gluers, dt);                             // drag, wear, breaks
this.blastsKind.spread(dt, this.rules.blastReached);
```

Folding them into one `rules.step(dt)` is fine too, if you'd rather the order be the rules' own. Record your choice.

**Name the Blast wake measure**, e.g. `wakes(impulse, mass, wakeSpeed)`: the capped push over mass beats `wakeSpeed`. #35 (candidate 3) will later judge hits by the same measure.

**Blast size stays pure.** `blastInk`, `blastSize` and `blastStrength` stay where they are, next to the Blasts kind. Only the decision to call them (`explode`) moves.

## The order that must not change

Exact replays depend on every engine call and every draw from `world.random` happening in the same order. Today one step does this:

1. `applyMaterials()` (stays in the world: it is #37's, candidate 6), `contacts.step(physics.step())`, the clock, `debris.step`.
2. `rules.applyStep(contacts.hits)`: no engine calls, just damage and blue counts. It returns what broke in the order the hits first reached it.
3. Sticking, then for each Stick in order: `touchPoint`, or `getTransform` if that is null, then `bonds.add` (a weld).
4. `droplets.land(newContacts)` (removes the Droplets), then for each Landing in order: `surfaceOf(host)` (Terrain party 0 gives the Arena's polygons), then `patches.add`, whose cap may remove old Patches and burst their puffs.
5. `patches.wearByHits(contacts.hits)`.
6. For each broken target in order, `breakTarget`: `strokes.break`, `debris.burst`, then the Fill (draws: `packSpill` or `packRubble`, then `launchRubble`; then `droplets.add` or `rubble.add`, which caps), then `explode` (`blasts.add`).
7. `glue.apply([...strokes.pieces(), ...patches.gluers()], dt, wearGluer)`: impulses as it goes, then `breakTarget` for each worn Piece in the order returned. A worn Patch is left to step 9.
8. `blasts.spread(dt, blastReached)`. For each reached Party, sorted by Party id:
   - a target not sliding takes Blast damage; if that breaks it, it is neither woken nor pushed;
   - a Piece is only damaged;
   - otherwise `getMass`, then `release` if Frozen and the capped push over mass beats `wakeSpeed`, then `applyImpulse` outward if it is free.

   Then each target broken there goes through `breakTarget` in order. A Blast started during `spread` is appended and grows in the same call, after the others.
9. `passOnGone()`, `patches.removeUsedUp()` with a puff each, then every kind's `step` in list order.

Debris has its own random generator, so moving a Debris burst doesn't shift the simulation, but keep it in the same place anyway, for the Debris tests.

## Watch out for

- **Don't merge the two uses of `broken`.** Hits from step 2 are broken in step 6, after sticking and landing, so a green Object whose first contact breaks still sticks, and a Patch on something broken goes with it. Blast breaks happen inside step 8.
- **Glue wear of a Patch** only uses it up; the Patch is removed in step 9 with a puff. Glue wear of a Piece breaks it at once, in step 7.
- **`Patches` keeps `used` and `removeUsedUp`.** Only the decision of how much moves out.
- **Types.** `MaterialRules` is generic today only in `applyStep`. The world's `Blasts<StrokeTarget>` and `ContactLedger<StrokeTarget>` show how far `StrokeTarget` reaches; keep the rules generic over the target where tests need hand-made ones.
- **`glue.test.ts`** copies `wearGluer` today. Test the real one through the rules.
- **Keep the kinds' interfaces.** `Kind` doesn't change in this slice. Candidate 5 (`solids`, `surfaceOf`) is #36.
- **The world's comments.** The class comment and the step comments describe where each rule lives; update them.

## Tests

- All existing tests pass unchanged; the gallery replay tests prove the order held.
- New rule tests with no engine (the issue lists what they must cover). Put them next to the module, e.g. `material-rules.test.ts`, and move the cases that fit there from the whole-world tests only if they then test the same thing more directly. Leave the world tests in place.
- `npm run verdict`: checks 1, 2 and 4 give the same numbers; check 5 (the whole Sandbox world step) is no slower. Put the before and after numbers in the commit message.

## Before you commit

- Update `docs/handoffs/README.md`: the "Patterns" section names the world's private methods (`breakTarget`, `releaseFill`, `blastReached`, `wearGluer`, `layPatches`) in the step order, Fill release, glue and sticking bullets. Point them at the Material rules.
- Update `20-red-lines-and-the-fuse.md`: its "break path" section names `breakTarget` and `explode` in the world. #20's Piece Blast is a Material rule: say where it plugs in.
- Update `21-demolition-scene.md` if it names anything you moved.
- Delete this file and its row in the README's table, and close #33 in the commit message.
