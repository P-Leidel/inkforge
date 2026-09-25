# Handoff: #17 Green

Issue: https://github.com/P-Leidel/inkforge/issues/17 (slice 8 of 13; blocked by #16). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

Anything moving across a green Line Piece slows right down (heavier things less), and the Piece wears as it works. A green Object sticks once to the first new thing it touches after it starts moving, and falls free for good when either side breaks. Green Patches come with Spills in #18.

## Read first

- In the spec: [Green](../specs/m2-colours.md#green), [Frozen](../specs/m2-colours.md#frozen), [Lines and Pieces](../specs/m2-colours.md#lines-and-pieces) (squeezing) and [Sandbox controls](../specs/m2-colours.md#sandbox-controls) (undo frees a stuck green Object).
- [ADR 0007](../adr/0007-glue-drags-every-moving-body.md) (glue drags every moving body) and [ADR 0003](../adr/0003-no-joints-in-mvp.md) (green sticking is the only runtime joint).
- The commits of #15 and #16. They decide how Pieces and Rubble are keyed and how the Fill release looks.
- **The user decided (2026-09-25):** a green Object never sticks while it slides off a Line. The end of the slide counts as it starting to move, and contacts touching at that moment (usually the Line it slid off) don't count. It sticks to the next thing it touches.

## What already exists

- **Contacts.**
  - `physics.touchingPairs()` gives every shape pair touching now, with their bodies.
  - `StepReport.begins` and `StepReport.ends` give the pairs that began and ended in the step.
  - The adapter keeps an Object's contacts through its own rebuilds (the `rebuilt` set in `trackContacts`), so a wake or the end of a slide doesn't fake new begins.
- **Settled pairs** (`MaterialRules`) are the pairs of Parties touching when physics started, dropped once they come apart. After a rebuild (Space or R), the engine reports every existing contact as beginning again. Sticking must skip settled pairs, exactly as damage does.
- **Physics.**
  - The module has `getVelocity`, `setVelocity`, `getAngularVelocity` and `getMass`, but no forces, impulses or joints.
  - A Frozen Object is a fixed body. Waking, Release and the end of a slide destroy it and build a new one (`rebuild` in the adapter), and joints die with their body.
- **Sliding.** A sliding Object is kinematic, and `getSlide(id)` is non-null while it slides.
- **Pieces (#15)** are `Piece` records in `LineStroke.pieces`. Each is its own fixed body with the Party key `stroke ${lineId} piece ${index}`. A green Piece has durability 6000 and threshold 400 at `1e13bc5`. Rubble (#16) is dynamic circles.
- **Breaking.** `MaterialRules.applyStep` returns only what impacts broke. Damage from wear must break Pieces through the same `breakPiece` path, so check `wear(piece, table) >= 1` after adding it.

## Suggested design (a proposal)

**Table.**

- Under `line` for every Colour (0 except green), add:
  - glue drag (force per px/s of speed);
  - spin damping (per rad/s);
  - wear (durability lost per unit of momentum removed).
- Tune the drag so a light ball rolling onto a green floor stops within about one Piece or two, and a black-filled box visibly less.
- #18 reuses these values for green Patches.

**Glue drag.** It lives in the Material rules, since it is Colour behaviour, and is applied through the physics module.

- Each step, find every moving body touching at least one green Piece, from `touchingPairs()`.
  - Moving means an Object that is neither Frozen nor sliding, or Rubble.
  - Apply the drag once per body, however many green things it touches.
- The spec's force is `F = −c·v`, not scaled by mass. Apply it as an impulse clamped so it can never reverse the motion: `Δp = −min(c·dt, m)·v`. A plain force blows up on light bodies once `c·dt > m`, and pebbles are light.
- Do the same for spin: `ΔL = −min(c_spin·dt, I)·ω`. That means exposing the rotational inertia, or adding a physics call that damps spin directly.
- The physics module gains `applyImpulse(id, impulse, point?)`, or `applyForce`, plus an angular counterpart.
- Pick whether the drag goes in before or after the step. Either works if it is deterministic: iterate bodies in a fixed order.

**Wear by use.** Each step, a green Piece loses durability in proportion to the momentum its drag removed (`|Δp|`). When a body touches several green Pieces, split `|Δp|` between them (or charge each; decide). Worn-out Pieces break with Debris as #15 does.

**Sticking: a state per green Object.**

- The states:
  - **Frozen**, or not yet moving.
  - **Moving**, with the set of Party keys it touched when it started moving.
  - **Stuck**, with its bond.
  - **Spent**: its bond is gone and it never sticks again.
- It starts moving when:
  - it is Released;
  - it is woken by a hit;
  - it is pushed by a Blast (#19; leave a hook);
  - its slide off a Line ends (the user decision above).
- The adapter wakes Frozen Objects inside `step()`. Detect a wake by Frozen turning false across a step. The hitter's contact began while it was Frozen, so it is in the touched set and doesn't count.
- **After a slide ends,** the body turns dynamic at the start of a step and its contacts begin during that step. So when `getSlide` goes from non-null to null, count everything it touches after that step as already touching, including pairs that began in it. It sticks to nothing while sliding.
- **The first new contact** is the first begin, in a fixed order, whose other Party is:
  - not in its touched set;
  - not settled;
  - Terrain, a Piece, an Object (Frozen or not) or Rubble.

  Droplets (#18) never count; a Patch is part of its host's body.
- **The bond.** Add physics calls like `addBond(bodyA, bodyB, point)` → `BondId` and `removeBond(id)`.
  - A Box2D weld joint: local anchors from the world point, `referenceAngle = angleB − angleA`, `collideConnected: false`, hertz 0 (rigid).
  - The adapter keeps a record of each bond and rebuilds the joint whenever either body is rebuilt (wake, Release, slide), since `b2DestroyBody` destroys it.
  - When either body is removed, the bond goes too.
  - Stuck to Terrain, a Line or a Frozen Object is a weld to a fixed body, so the green Object is effectively fixed.
  - Stuck to a moving body, the two move as one.
- **A moving green Object that hits a Frozen Object** sticks to it. The adapter's mass-aware wake rule decides, inside `step()`, whether the Frozen one wakes. The bond is made after the step, so if the host woke it is already a moving body.
- **It falls free** when either side breaks, is undone, or is removed by a cap (the Rubble cap). It becomes spent and never sticks again. Spec: "Undoing something a green Object is stuck to frees the green Object as if it had broken."
- **A green Outline sticks but causes no drag.** Only green Pieces (and, in #18, green Patches) drag.

**Snapshot.**

- Save each bond as the Party keys of both sides, plus the local anchors and reference angle.
- Save each green Object's state and touched set, and each Piece's wear. (Piece wear is its damage; #15 already saves that.)
- `rebuild` adds bonds after all bodies exist.

**Drawing.** A small green blob at the bond point shows why an Object hangs (optional).

## Watch out for

- The test "pausing and restarting while a green Object rests against something doesn't make it stick" covers the settled filter on begins.
- A squeeze unfreezes an Object when its slide *starts*: `slideOut` rebuilds it as kinematic, and `isFrozen` turns false at once. Check `getSlide` before you take Frozen turning false as a wake; a squeezed Object starts moving only when its slide ends.
- A green Object stuck to a body that is later squeezed (it turns kinematic for the slide) must keep its bond through that rebuild too.
- The glue drag and sticking must also work on a Frozen Object after it wakes, and on Rubble for drag. Frozen and sliding bodies get no drag.
- Replays: bonds, states and touched sets all go in the snapshot. Extend the gallery replay test to cover a bond.

## Tests (from the issue)

- A light ball crossing green slows more than a heavy one.
- A green Line wears down from use.
- A green Object sticks to its first new contact, is fixed on a Line, and falls free when that Piece breaks.
- A green bond survives its Frozen host waking.
- Pausing and restarting while a green Object rests against something doesn't make it stick.
- Worth adding:
  - a green Object squeezed off a Line doesn't stick to it but sticks to what it lands on (the user decision);
  - undoing a green Object's host frees it for good.

## Gallery and README

- Demos: balls of different weights rolling across a green floor; a green Object gluing itself to a Line.
- README: a paragraph on glue drag, wear and sticking; the demos in the gallery paragraph.
