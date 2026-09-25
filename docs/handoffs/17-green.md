# Handoff: #17 Green

Issue: https://github.com/P-Leidel/inkforge/issues/17 (slice 8 of 13; blocked by #27, the Contact ledger). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

Anything moving across a green Line Piece slows right down (heavier things less), and the Piece wears as it works. A green Object sticks once to the first new thing it touches after it starts moving, and falls free for good when either side breaks. Green Patches come with Spills in #18.

## Read first

- In the spec: [Green](../specs/m2-colours.md#green), [Frozen](../specs/m2-colours.md#frozen), [Lines and Pieces](../specs/m2-colours.md#lines-and-pieces) (squeezing) and [Sandbox controls](../specs/m2-colours.md#sandbox-controls) (undo frees a stuck green Object).
- [ADR 0007](../adr/0007-glue-drags-every-moving-body.md) (glue drags every moving body) and [ADR 0003](../adr/0003-no-joints-in-mvp.md) (green sticking is the only runtime joint).
- The commits of #15, #16, #24 and #27. They decide how Pieces and Rubble are made, how the Fill release looks, how each kind of Arena contents is a module of its own, and how the Contact ledger hands out contacts and Party ids.
- `CONTEXT.md`: **Settled** and **Squeeze**.
- **The user decided (2026-09-25):** a green Object never sticks while it slides off a Line. The end of the slide counts as it starting to move, and contacts touching at that moment (usually the Line it slid off) don't count. It sticks to the next thing it touches. The Contact ledger (#27) already applies the contact half of this; see below.

## What already exists

- **Arena contents (#24).** Each kind is a module behind `Kind` (`src/sandbox/arena-contents.ts`): `Strokes` (`strokes.ts`) and `Rubble` (`rubble.ts`). The Sandbox world runs the snapshot, rebuilding, Clear and each step over its list of kinds, in order. See README, "Patterns the slices follow".
- **Contacts: the Contact ledger (#27, `src/sandbox/contact-ledger.ts`).** Every rule reads contacts from it, not from the `StepReport` or `touchingPairs()`. Each step it gives three channels, in the engine's report order:
  - **hits**, Party-level, with impulse, point, normal and shapes (damage reads these);
  - **new contacts**, a Party pair going from not touching to touching, with the first shape pair;
  - **touching**, looked up per Party.

  It has already dropped what doesn't count:
  - **Settled pairs** (`CONTEXT.md`), touching when physics started, give no hits and no new contacts until they come apart, but they are touching. This covers the engine reporting every existing contact as beginning again after a rebuild (Space or R).
  - **A Squeezed Object** is in no channel while it slides. What it touches in the step its slide ends isn't new.
  - The adapter keeps an Object's contacts through its own rebuilds (the `rebuilt` set in `trackContacts`), so a wake or the end of a slide doesn't fake new contacts.
- **Parties** have numeric ids that are never reused and stay the same through a rebuild. The Terrain is 0. Each kind registers its bodies' Parties with the ledger as it adds them and unregisters them as it removes them. A Piece's Party carries its Line's id as `stroke`.
- **Physics.**
  - The module has `getVelocity`, `setVelocity`, `getAngularVelocity` and `getMass`, but no forces, impulses or joints.
  - A Frozen Object is a fixed body. Waking, Release and the end of a slide destroy it and build a new one (`rebuild` in the adapter), and joints die with their body.
- **Sliding.** A sliding Object is kinematic, and `getSlide(id)` is non-null while it slides. The ledger keeps the short list of sliding Objects and knows when each slide ends.
- **Pieces (#15)** are `Piece` records in `LineStroke.pieces`. Each is its own fixed body with a Party of its own. A green Piece has durability 6000 and threshold 400 at `1e13bc5`. Rubble (#16) is dynamic circles (`addCircle`), each with a Party with no target; the `Rubble` kind keeps it.
- **Breaking.** `MaterialRules.applyStep`, fed the ledger's hits, returns only what impacts broke, and the world's `breakTarget` breaks each through `strokes.break`, which reports the Debris to burst. Damage from wear must break Pieces through the same path, so check `wear(piece, table) >= 1` after adding it and hand the Piece to `breakTarget`.

## Suggested design (a proposal)

**Table.**

- Under `line` for every Colour (0 except green), add:
  - glue drag (force per px/s of speed);
  - spin damping (per rad/s);
  - wear (durability lost per unit of momentum removed).
- Tune the drag so a light ball rolling onto a green floor stops within about one Piece or two, and a black-filled box visibly less.
- #18 reuses these values for green Patches.

**Glue drag.** It lives in the Material rules, since it is Colour behaviour, and is applied through the physics module.

- Each step, find every moving body touching at least one green Piece: walk only the green Pieces' Parties, and read what each touches from the ledger.
  - Moving means an Object that isn't Frozen, or Rubble. The ledger already leaves out Squeezed Objects.
  - Apply the drag once per body, however many green things it touches.
- The spec's force is `F = −c·v`, not scaled by mass. Apply it as an impulse clamped so it can never reverse the motion: `Δp = −min(c·dt, m)·v`. A plain force blows up on light bodies once `c·dt > m`, and pebbles are light.
- Do the same for spin: `ΔL = −min(c_spin·dt, I)·ω`. That means exposing the rotational inertia, or adding a physics call that damps spin directly. The adapter already gives circles an angular damping of its own so they roll to a stop (`CIRCLE_ANGULAR_DAMPING`); the glue's spin damping comes on top.
- The physics module gains `applyImpulse(id, impulse, point?)`, or `applyForce`, plus an angular counterpart.
- Pick whether the drag goes in before or after the step. Either works if it is deterministic: iterate bodies in a fixed order.

**Wear by use.** Each step, a green Piece loses durability in proportion to the momentum its drag removed (`|Δp|`). When a body touches several green Pieces, split `|Δp|` between them (or charge each; decide). Worn-out Pieces break with Debris as #15 does.

**Sticking: a state per green Object.**

- The states:
  - **Frozen**, or not yet moving.
  - **Moving**, with the set of Party ids it touched when it started moving (its touching in the ledger at the end of that step).
  - **Stuck**, with its bond.
  - **Spent**: its bond is gone and it never sticks again.
- It starts moving when:
  - it is Released;
  - it is woken by a hit;
  - it is pushed by a Blast (#19; leave a hook);
  - its slide off a Line ends (the user decision above).
- The adapter wakes Frozen Objects inside `step()`. Detect a wake by Frozen turning false across a step. The hitter's contact began while it was Frozen, so it is in the touched set and doesn't count.
- **After a slide ends,** the ledger has already done the contact part: no new contacts while it slides, and none in the step its slide ends. Sticking only needs to know that the slide ended, to start the moving state. The ledger knows (it watches the sliding Objects), so add a per-step list of ended slides to it rather than polling `getSlide` for every green Object.
- **The first new contact** is the first of the ledger's new contacts, in report order, in a step after the one it started moving in, whose other Party is:
  - not in its touched set;
  - Terrain, a Piece, an Object (Frozen or not) or Rubble.

  The ledger has already dropped Settled pairs and Squeezed Objects.

  Droplets (#18) never count; a Patch is part of its host's body.
- **The bond.** Add physics calls like `addBond(bodyA, bodyB, point)` → `BondId` and `removeBond(id)`.
  - A Box2D weld joint: local anchors from the world point, `referenceAngle = angleB − angleA`, `collideConnected: false`, hertz 0 (rigid).
  - The adapter keeps a record of each bond and rebuilds the joint whenever either body is rebuilt (wake, Release, slide), since `b2DestroyBody` destroys it.
  - When either body is removed, the bond goes too.
  - Stuck to Terrain, a Line or a Frozen Object is a weld to a fixed body, so the green Object is effectively fixed.
  - Stuck to a moving body, the two move as one.
- **A moving green Object that hits a Frozen Object** sticks to it. The adapter's mass-aware wake rule decides, inside `step()`, whether the Frozen one wakes. The bond is made after the step, so if the host woke it is already a moving body.
- **It falls free** when either side breaks, is undone, cleared, or removed by a cap (the Rubble cap: `cap()` in the `Rubble` kind). It becomes spent and never sticks again. Spec: "Undoing something a green Object is stuck to frees the green Object as if it had broken."
- **A green Outline sticks but causes no drag.** Only green Pieces (and, in #18, green Patches) drag.

**Bonds are a kind** (#24's decision), say `Bonds` in `src/sandbox/bonds.ts`, after Strokes and Rubble in the world's list of kinds, so its `restore` runs once every body exists.

- It owns the bonds, their ids and their views (for the drawing below), and implements every part of `Kind`. It has no Party, no solids and no surfaces of its own.
- The green Object's sticking state can live with the Object in `Strokes` or in `Bonds`; decide. Either way, kinds never call each other: the world passes on what one reports.

**"Host gone".** #24 left this for its first consumer. Build it here:

- The Sandbox world collects what each step or command removed: broken, undone (`remove`, `undo`), cleared, or capped (the Rubble cap). Kinds report their removals, as `strokes.break` already reports what it broke.
- It hands them to every kind, in kind order, e.g. as a new `Kind` method.
- A bond whose host is gone is removed, and its green Object is spent: it falls free for good.
- #18's Patches hear the same removals.

**Snapshot.**

- Save each bond as the Party ids of both sides, plus the local anchors and reference angle.
- Save each green Object's state and touched set, and each Piece's wear. (Piece wear is its damage; #15 already saves that.)
- Each kind's `save` and `restore` cover their own part.

**Drawing.** A small green blob at the bond point shows why an Object hangs (optional).

## Watch out for

- The test "pausing and restarting while a green Object rests against something doesn't make it stick" covers the ledger's Settled filter on new contacts.
- A squeeze unfreezes an Object when its slide *starts*: `slideOut` rebuilds it as kinematic, and `isFrozen` turns false at once. Check `getSlide` before you take Frozen turning false as a wake; a squeezed Object starts moving only when its slide ends.
- A green Object stuck to a body that is later squeezed (it turns kinematic for the slide) must keep its bond through that rebuild too.
- The glue drag and sticking must also work on a Frozen Object after it wakes, and on Rubble for drag. Frozen and sliding bodies get no drag.
- Replays: bonds, states and touched sets all go in the snapshot. The gallery replay test compares `world.contents`, so a demo with a bond covers it once `Bonds` has views.

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
