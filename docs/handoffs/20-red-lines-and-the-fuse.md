# Handoff: #20 Red Lines and the fuse

Issue: https://github.com/P-Leidel/inkforge/issues/20 (slice 11 of 13; blocked by #19 and #33). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

**#33 comes first.** It moves the break path (`breakTarget`, `explode`, `blastReached`) out of the Sandbox world into the Material rules, and it updates this handoff when it lands. Where this file still names those world methods, read them as the Material rules' break and Blast rules: the Piece Blast is one more Material rule there, not a new world method.

A red Line burns from end to end like a fuse. Each red Piece explodes with a small Blast when it is destroyed, and that Blast is strong enough to destroy the next red Piece. That gives mine strips and timed chains. An Object drawn over a red Line still doesn't set it off when physics starts.

## Read first

- In the spec: [Red and Blasts](../specs/m2-colours.md#red-and-blasts) (red Line Pieces, the fuse), [Damage](../specs/m2-colours.md#damage) and [Lines and Pieces](../specs/m2-colours.md#lines-and-pieces) (squeezing).
- [ADR 0008](../adr/0008-red-explodes-when-destroyed.md).
- The commits of #15 (`1e13bc5`: Pieces, their Line-role durability and threshold) and #19 (Blasts, chains, the break path for red).

## What already exists

- **Red Pieces** (#15) break by the normal rule with the red Line values in the table (durability 250, threshold 300; #19 left them alone and retuned only red Outlines, to 140 and 250), releasing Debris through `strokes.break` (the world's `breakTarget`). Nothing explodes yet.
- **Blasts** (#19) are the `Blasts` kind in `src/sandbox/blasts.ts`, last in the world's list of kinds, with the pure `blastInk`, `blastSize` (R and S from red ink, clamped) and `blastStrength` (S × (1 − d/R)²) next to it. The table's shared `blast` block holds `speed`, `radiusPerRootInk`, `radiusMin`, `radiusMax`, `strengthPerRootInk`, `strengthMin`, `strengthMax`, `push` and `maxPushSpeed`. Whether ink explodes is a table number, `explodes`, under every Colour's `outline` and `fill` (1 for red), so no rule names a Colour; add it under `line` too.
  - **The break path.** `Broken` has an `outline` (`BrokenOutline`: Colour, length and centre) for a broken Object, null for a Piece. The world's `breakTarget` bursts the Debris, releases the Fill, then calls `explode(outline, fill)`, which sums the red ink (`blastInk`) and starts a Blast with `blasts.add(centre, ink)`. A Piece's Blast has a fixed size rather than one from ink: give `Broken` what a Piece's Blast needs, and let `add` take a size (`BlastSize`) as well as ink, or add a second entry point.
  - **The ring.** `blasts.spread(dt, act)` runs in the step after glue and before host gone: each Blast in creation order grows by `speed × dt`, finds what it reached with `physics.bodiesWithin(centre, radius)` (Terrain and added capsules, so Patches, left out), sorts the new ones by Party id, marks them acted on and hands them to the world's `blastReached`. That damages Pieces and Objects through `MaterialRules.applyBlast` (not an impact: no blue count), wakes Frozen Objects whose push over mass beats `wakeSpeed`, pushes free bodies outward (capped at `maxPushSpeed` of speed change), and breaks what broke with `breakTarget`. A Blast started during `spread` (a chain) grows in the same call, after the others, so every Blast first grows in the step it starts. A Blast is dropped once its radius reaches R. Sliding Objects are neither pushed nor damaged.
  - **Pieces** are already damaged by Blasts (they are Parties with a `target`), so a red Piece a Blast destroys already breaks through `breakTarget`; it only has to explode.
- **Squeeze and Settled pairs** (#14; `CONTEXT.md`). The Contact ledger (#27) applies both to every rule:
  - An Object drawn over a Line is squeezed off at start. It slides as a kinematic body that touches no fixed body, and deals and takes no damage.
  - Contacts touching at the start deal no damage until they come apart.

## Suggested design (a proposal)

**Table.** Add the fixed size of a Piece's Blast, e.g. `blast.pieceRadius` and `blast.pieceStrength`, and give red Lines very low durability and threshold if #15 didn't already.

**A red Piece destroyed** by an impact or a Blast explodes: a Blast of that fixed size at the Piece's centre, the midpoint along it. Reuse #19's break path: `strokes.break` reports a broken Piece too (`breakPiece`), so have it report what the Blast needs. Red ink doesn't scale a Piece's Blast.

**The fuse rule, as a pure function tested against `DEFAULT_MATERIAL_TABLE`.** A red Piece's Blast, measured 48 px from its centre, must destroy a red Piece:

```
pieceStrength × (1 − 48 / pieceRadius)² ≥ red line threshold + red line durability / damagePerImpulse
```

That way a tuning change that breaks the fuse fails CI (spec, Testing Decisions).

- On a straight Line the next Piece's nearest point is only about 24 px from a Piece's centre.
- #15 cuts each part of a Line into `max(1, round(length / 48))` equal Pieces (`splitIntoPieces` in `src/stroke/pieces.ts`). So a Piece is shorter than 72 px, putting the neighbour's nearest point less than 36 px away. 48 px leaves room for bends.

**Burn speed.** At 800 px/s the ring reaches the next Piece in 2 steps or so. A 10-Piece Line (480 px) burns in about 0.3 s, "at the ring's speed". The acceptance test can check that the whole Line is gone within a time bound derived from its length and the ring speed.

**Lighting a fuse.** Anything that destroys one red Piece: a hard hit, or another Blast (a bomb at the end of the fuse).

## Watch out for

- **Distance is to the nearest point.** `bodiesWithin` measures to a Piece's capsules, so a straight neighbour's nearest point is about 24 px from a Piece's centre, minus half the Line's thickness.
- **Existing demos have red Lines that will now explode:**
  - **Bounce** drops a grey ball onto a Line of each Colour, and the ball's landing already breaks a red Piece since #15.
  - **Slide** puts a grey box on a ramp of each Colour.

  Their stations are 300 px apart. Check the gallery tests still pass and still test what they say, and that no Blast reaches the next station unless the demo means it to.
- **"An Object drawn over a red Line doesn't set it off at play"** relies on #14's squeeze. The Object restarts from rest just clear of the Line. If the Line is under it, it is already resting there, so there is no impact.
  - Test it with a heavy (black-filled) Object as well as a hollow one.
  - Also test an Object resting on a red Line when physics starts: that's a settled pair.
- **Reset mid-burn:** the unburnt Pieces, the Blasts still spreading and what they acted on must all come back. Pausing mid-burn takes a new snapshot; replay from it must match.

## Tests (from the issue)

- Unit: the fuse rule against the real material table.
- Headless Sandbox world:
  - a red Line burns end to end;
  - an Object drawn over a red Line doesn't set it off at play;
  - Reset mid-burn restores the unburnt Pieces.
- Worth adding:
  - a fuse sets off a bomb at its end;
  - a red Line's Blast damages a grey Piece of another Line nearby, and leaves one beyond its reach alone.

## Gallery and README

- Demos: a fuse leading to a bomb (lit by dropping something on its far end); a mine strip under a falling box.
- README: a paragraph on red Lines and the fuse; the demos in the gallery paragraph.
