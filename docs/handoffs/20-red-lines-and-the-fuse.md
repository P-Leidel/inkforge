# Handoff: #20 Red Lines and the fuse

Issue: https://github.com/P-Leidel/inkforge/issues/20 (slice 11 of 13; blocked by #19). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

A red Line burns from end to end like a fuse. Each red Piece explodes with a small Blast when it is destroyed, and that Blast is strong enough to destroy the next red Piece. That gives mine strips and timed chains. An Object drawn over a red Line still doesn't set it off when physics starts.

## Read first

- In the spec: [Red and Blasts](../specs/m2-colours.md#red-and-blasts) (red Line Pieces, the fuse), [Damage](../specs/m2-colours.md#damage) and [Lines and Pieces](../specs/m2-colours.md#lines-and-pieces) (squeezing).
- [ADR 0008](../adr/0008-red-explodes-when-destroyed.md).
- The commits of #15 (`1e13bc5`: Pieces, their Line-role durability and threshold) and #19 (Blasts, chains, the break path for red).

## What already exists

- **Red Pieces** (#15) break by the normal rule with the red Line values in the table (durability 250, threshold 300 at `1e13bc5`), releasing Debris through `strokes.break` (the world's `breakTarget`). Nothing explodes yet.
- **Blasts** (#19) are a kind of Arena contents (#24), with size from red ink, the ring, action on arrival, chains through destroyed red, the snapshot, and drawing plus F1.
- **Squeeze and Settled pairs** (#14; `CONTEXT.md`). The Contact ledger (#27) applies both to every rule:
  - An Object drawn over a Line is squeezed off at start. It slides as a kinematic body that touches no fixed body, and deals and takes no damage.
  - Contacts touching at the start deal no damage until they come apart.

## Suggested design (a proposal)

**Table.** Add the fixed size of a Piece's Blast, e.g. `blast.pieceRadius` and `blast.pieceStrength`, and give red Lines very low durability and threshold if #15 didn't already.

**A red Piece destroyed** by an impact or a Blast explodes: a Blast of that fixed size at the Piece's centre, the midpoint along it. Reuse #19's break path: `strokes.break` reports a broken Piece too, so have it report what the Blast needs. Red ink doesn't scale a Piece's Blast.

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
