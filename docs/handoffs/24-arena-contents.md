# Handoff: #24 Arena contents in their own modules

Issue: https://github.com/P-Leidel/inkforge/issues/24 (a refactor slice inserted before #17; blocked by #16). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

Every kind of **Arena contents** (`CONTEXT.md`) gets a module of its own. Today that is Strokes and Rubble. The Sandbox world keeps the step order and runs snapshot, reset, clear and the rest once over every kind, so #17–#19 each add one module (Bonds, Droplets, Patches, Blasts) instead of threading a new kind through `sandbox-world.ts`. Nothing a player or a test can observe changes, except one new read-only view.

## Read first

- The issue and its acceptance criteria.
- Candidate 1 of the architecture review, [`docs/adr/reports/architecture-review-2026-09-25.html`](../adr/reports/architecture-review-2026-09-25.html) (open it in a browser). Candidate 2, the Contact ledger, is the next slice, not this one.
- `CONTEXT.md`: **Arena contents**, and Stroke, Line, Piece, Object, Fill, Rubble, Debris.
- All of `src/sandbox/sandbox-world.ts`, then `material-rules.ts`, `rubble.ts`, `debris.ts`, `test-support.ts` and `src/gallery/gallery.test.ts`.
- The commits of #13–#16 (`git log --oneline`): Reset, Objects breaking, Pieces, Rubble. Their "Decisions the spec left open" still hold.

## Decided with the user (2026-09-25; don't reopen)

- **A pure refactor, before #17.** All existing tests pass unchanged, replays play the same, and `npm run verdict` gives the same numbers.
- **What a kind is:** anything in the snapshot. Today Strokes and Rubble; later Bonds (#17), Droplets and Patches (#18), Blasts (#19) and enemies (milestone 4). Debris and the fading Rubble ghosts are visual only and are not kinds.
- **One Strokes module**, not separate Lines and Objects: Lines with their Pieces, Objects, Fills, the undo history, the squeeze, and breaking Objects and Pieces. Undo and the squeeze need both, so splitting would scatter them back into the world.
- **Rubble module**: Rubble, its ids, the cap and the fading ghosts. The ghosts stay out of the snapshot and are dropped on Reset and Clear.
- **Not in this slice:**
  - the physics module and its adapter (candidate 3);
  - Party lookup's keys and results, which stay as they are today (the Contact ledger comes next);
  - moving `releaseFill` out of the world (candidate 5).
- **The Sandbox world's commands and views don't change.** One addition: a read-only `world.contents`.
- **Kinds never call each other.** A kind reports what happened, and the world passes it on.
- **Rebuild order** is one fixed list of kinds in the world, in today's order: Strokes, then Rubble. Later kinds go after their hosts.
- **Solid for the overlap rule:** each kind hands in its own solid shapes, possibly none.
- **One turn per step** for each kind, after the Material rules and breaking.
- **Nothing is kept for what is gone.** Once a thing is broken, undone, cleared, capped or worn out, its module keeps no record and no lookup entry for it. The exceptions are ids, which are never reused, and settled pairs, which stay until the pair separates.
- **"Host gone" is not built now.** #17 adds it with its first consumer (see [Later handoffs](#later-handoffs)).
- **Rubble has no lifetime timer.** The cap stays its only limit.

## What exists (at `1560bd3`)

Where each concern lives in `src/sandbox/sandbox-world.ts`:

| Concern | Strokes | Rubble |
|---|---|---|
| Records | `Piece` 137, `LineStroke` 146, `ObjectStroke` 155, `strokes`, `history`, `nextStrokeId` 259–262 | `Rubble` 176, `FadingRubble` 184, `rubbleList`, `fading`, `nextRubbleId` 264–268 |
| Saved forms | `SavedPiece`, `SavedStroke` 206–215 | `SavedRubble` 211 |
| Views | `lines` 301, `objects` 316, `viewObject` 348 | `rubble` 326, `fadingRubble` 338 |
| Stroke context (solids) | Object parts, 466 | Rubble circles, 467–470 |
| Commands | `submitStroke` 370, `fillAt` 553, `releaseAt` 542, `release` 572, `remove` 582, `undo` 595 | none (Undo leaves Rubble) |
| Breaking | `breakObject` 628, `breakPiece` 691 | added by `releaseFill` 642 → `addRubble` 664 → `capRubble` 678 |
| Snapshot and rebuild | `takeSnapshot` 737–744, `rebuild` 842–863 | `takeSnapshot` 746–749, `rebuild` 864–865 |
| Clear and reset | `clear` 611–618 | `clear` 614–616, `reset` 727 |
| Party | `partyFinder` 769–772, 780–794 | `partyFinder` 773–779 |
| Table re-apply | `applyMaterials` 824–828 | `applyMaterials` 829–831 |
| Step | none | ghosts age, `step` 875–876 |

The world-level parts are: `togglePause` 708, `reset` 722, `settledPairs` 761, `step` 869, `advance` 889, Debris, `random`, `elapsed` and `appliedMaterials`.

## Suggested design (a proposal)

**The shape every kind shares** (`Kind` in code). Rename and reshape it freely, but cover each line:

```ts
interface Kind<Saved, Views> {
  /** Its key in `world.contents` and in the snapshot: 'strokes', 'rubble'. */
  readonly name: string;
  views(): Views;
  /** Its part of the snapshot. */
  save(): Saved;
  /** Adds its bodies again after physics.reset(), in its own fixed order. */
  restore(saved: Saved): void;
  clear(): void;
  /** Who a body is to the Material rules, or null if it isn't this kind's. */
  partyOf(body: BodyId): Party<Target> | null;
  /** Its shapes that new Objects may not overlap, for the Stroke context. */
  solids(): Solids;
  /** Re-applies its surfaces after a material table edit. */
  applySurfaces(): void;
  /** Its turn in each step, after the Material rules and breaking. */
  step(seconds: number): void;
}
```

- **Construction:** each kind is given the physics world and the material table.
- **Randomness:** kinds don't draw from `world.random` themselves. The world keeps drawing in today's order: `packRubble`, then `launchRubble`, per broken Object, in the order the rules return them.

**Strokes** (`src/sandbox/strokes.ts`):

- **Commands.** It adds a Line or an Object from a `processStroke` result. The world builds the Stroke context from every kind's `solids()`, runs `processStroke`, and hands the result and the Colour to Strokes. Strokes also owns fill, release, remove, undo, `objectAt` and the squeeze. The squeeze needs the Terrain: pass the Arena in.
- **Breaking.** It breaks the targets the Material rules return and reports what came out: for a Piece, its band and Colour, for Debris; for an Object, its world Outline, velocity and Colours for Debris, plus its Fill, Fill mass and motion for `releaseFill`. The world bursts the Debris and calls `releaseFill`.
- **Snapshot.** Its saved part holds the Strokes and the undo history.

**Rubble** (`src/sandbox/rubble.ts`, next to `packRubble` and `launchRubble`, which stay exported for `rubble.test.ts`):

- It adds launched pieces and applies the cap.
- It owns the fading ghosts. Its `step` ages them.
- Its saved part holds each piece with its motion.

**The Sandbox world** keeps:

- the kinds in one list, `[strokes, rubble]`;
- the snapshot as `{ contents: { strokes, rubble }, random, time, settled }`;
- `togglePause`, `reset`, `clear` and `step` as loops over that list;
- `partyFinder`, which asks each kind in turn;
- `applyMaterials`, whose table-change check stays here and then calls each kind's `applySurfaces`.

The existing getters (`lines`, `objects`, `rubble`, `fadingRubble`, `debrisParticles`) forward to the kinds and return exactly what they return today.

**`world.contents`**:

- It holds every kind's views by name, for example `{ strokes: { lines, objects }, rubble }`.
- Only Arena contents: no Debris, no fading ghosts. Those don't come back on R, so a round trip must not compare them.
- The renderer doesn't use it.

## Tests

- **Every existing test passes unchanged.** That includes the 16 assertions on `bodyCount`, so keep one body per Object, Piece and piece of Rubble.
- **New round-trip test, for every gallery demo:**
  1. Build it.
  2. Run it for 1 s, then read `world.contents`.
  3. Press Space twice. That saves and rebuilds, and `contents` must be equal.
  4. Run 1 s, press R. `contents` must equal what it was after step 3.

  Straight after a rebuild, Objects and Rubble report exactly the pose and velocity they were made with (the adapter's `Placement`), so equality can be exact.
- **`played`** in `src/gallery/gallery.test.ts` compares `world.contents`, so later kinds are covered without editing it.
- **Verdict.** Run `npm run verdict` before and after. Checks 1, 2 and 4 must give identical numbers.

## Watch out for

- **Step order.** Today ghosts age before the Material rules; after this slice they age in Rubble's turn after breaking. A ghost made in a step then starts one step older, which is visual only. `fill-release.test.ts` 248 only checks `0 < opacity ≤ 1`, so it still passes.
- **Rebuild order is replay order.** Strokes (in drawing order, each Line's Pieces in order), then Rubble oldest first. Any change moves Box2D's ids and breaks exact replays.
- **Undo** stays inside Strokes. `remove` drops a Stroke's history entries, and a Line goes with its last Piece. Rubble ids stay out of the history.
- **The preview** (`previewStroke`) builds the Stroke context on every call, while a closed Stroke is drawn. Keep it as it is. The read model (candidate 4) and Arena queries (candidate 8) handle its cost later.

## Later handoffs

Before you commit, update the handoffs for #17–#21 wherever they name what moved: `rubbleList`, `capRubble`, `addRubble`, `releaseFill`, `partyFinder`, `takeSnapshot`, `rebuild`, `strokeContext`, the Party key formats, and "extend Reset and Clear". Also update README's "Patterns the slices follow" (it describes the world as of #16). In particular:

- **#17:** Bonds become a kind after Strokes and Rubble. Add "host gone" there. The Sandbox world collects what each step or command removed (broken, undone, cleared, capped) and hands it to every kind, in kind order. A Bond whose host is gone frees its green Object for good. The Contact ledger slice comes before #17; leave room for it rather than designing it.
- **#18:** Droplets and Patches become kinds, after their hosts. Patches hear "host gone".
- **#19:** Blasts become a kind. Their ring grows in their step turn.
- **#21:** the Demolition test can count distinct ids in `world.contents`.

## README

No player-facing change, so no README paragraph. Delete this handoff and its row in [README.md](README.md) in the commit that closes #24, as every slice does.
