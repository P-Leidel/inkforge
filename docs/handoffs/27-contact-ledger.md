# Handoff: #27 Contact ledger

Issue: https://github.com/P-Leidel/inkforge/issues/27 (a refactor slice inserted between #24 and #17). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

Today, which contacts count is worked out in three places. The Material rules own the Settled pairs, the Sandbox world looks up Parties, and every Object lookup asks physics whether it is Squeezed. A Contact ledger takes all three over. It is one module, fed each step's `StepReport`, and every rule asks it which contacts count. Damage is its only consumer in this slice. #17 (sticking, glue drag), #18 (Droplets landing, Patch wear, green Patches) and milestone 4's enemies read from it next. Nothing a player or a test can observe changes, and each step should get cheaper.

## Read first

- The issue and its acceptance criteria.
- Candidate 2 of the architecture review, [`docs/adr/reports/architecture-review-2026-09-25.html`](../adr/reports/architecture-review-2026-09-25.html) (open it in a browser).
- `CONTEXT.md`: **Settled** and **Squeeze** (both new), and Stroke, Line, Piece, Object, Rubble, Arena contents.
- In the spec: [Lines and Pieces](../specs/m2-colours.md#lines-and-pieces) (the squeeze: "it deals and takes no damage while it slides") and [Sandbox controls](../specs/m2-colours.md#sandbox-controls) ("Contacts touching when the snapshot is taken don't count as beginning after the rebuild").
- All of `src/sandbox/material-rules.ts` and its test, `sandbox-world.ts`, `arena-contents.ts`, and the Party, restore and removal code in `strokes.ts` and `rubble.ts`.
- In `src/physics/`: `physics-world.ts` (`StepReport`, `ContactPair`, `ContactHit`, `touchingPairs`, `getSlide`), and `trackContacts` and `removeBody` in `box2d/box2d-physics-world.ts`.
- The commits of #14 (squeeze and settled pairs, `64210ef`), #16 and #24 (`11c4f76`).

## Decided with the user (2026-09-25; don't reopen)

- **A pure refactor.** Nothing a player or a test can observe changes, replays play the same, and damage is the only consumer. `npm run verdict` gives the same numbers for checks 1, 2 and 4.
- **Where it lives:** `src/sandbox/contact-ledger.ts`, on the Sandbox world side. It is fed each step's `StepReport`. It is not part of the physics adapter.
- **What it owns:**
  - **The Settled pairs, as their only owner.** `MaterialRules` loses `settled`, `settle`, `settledPairs` and `pairKeys`, and the world loses `settledPairs()`. The snapshot becomes `{ contents, contacts, random, time }`, where `contacts` is the ledger's saved part.
  - **Its own touching set of Party pairs**, kept up to date from begins and ends.
- **The physics interface doesn't change.** `touchingPairs()` stays, but the Sandbox world stops calling it every step.
- **Party ids are numbers:**
  - One counter hands them out, and they are never reused, not even after R or Clear, like Stroke and Rubble ids.
  - The counter is **not** saved in the snapshot. This replaces the earlier idea of saving it and rewinding on R.
  - Each record keeps its Party id, so the id stays the same after a rebuild.
  - The Terrain is 0.
  - A Line takes an id too, and each Piece's Party carries its Line's id.
  - Pair keys are numbers, with no strings.
  - #17's bonds, #18's Patch hosts and #19's acted-on sets save Party ids.
- **Three channels per step**, in the engine's report order, so replays stay deterministic:
  - **Hits:** Party-level, with the hit's impulse, point, normal and shapes. A hit is dropped if a Party is unknown, if either side is Squeezed, or if the pair is Settled.
  - **New contacts:** a Party pair going from not touching to touching, with the first shape pair that made it touch. Dropped if the pair is Settled or either side is Squeezed.
  - **Touching:** looked up per Party, with Settled pairs included. Glue drag then walks only the green things' contacts.
  - There is no Party-level "ended" channel until a rule needs one. The ledger uses ends internally.
- **Performance is a deciding factor:**
  - The channel lists are reused from step to step instead of rebuilt.
  - Touching changes only on begins, ends and removals, so a resting pile costs nothing per step.
- **"One impact per Stroke" stays in damage** (the Material rules), because #18's Patch wear counts every hit.
- **A Squeezed Object is out of every channel:**
  - While it slides it has no hits, no new contacts and nothing touching, so it also gets no glue drag.
  - Whatever it touches in the step its slide ends counts as already touching.
  - The ledger owns this rule, and #17 drops its own copy.
  - The ledger keeps the short list of sliding Objects and checks only those each step, instead of calling `getSlide` for every lookup.
- **One index from body to Party**, for every kind:
  - A kind registers a body's Party when it adds the body, including on restore, and unregisters it when it removes the body.
  - Each Party object is built once per record.
  - The ledger drops a removed body's pairs at once, touching and Settled alike, so no dead pairs land in a snapshot.
  - `partyOf` is removed from `Kind`.
- **Tests** (see [Tests](#tests)):
  - Only `material-rules.test.ts` changes.
  - The new `contact-ledger.test.ts` has hand-made cases plus one test on the real engine.
- **A new verdict measurement** (see [Verdict](#verdict)).

## What exists (at `b245ec7`)

- **Party lookup.**
  - `partyOf` in `sandbox-world.ts` (around line 376) checks the Terrain, then asks each kind.
  - `Strokes.partyOf` and `Rubble.partyOf` build a new Party, with a template-string key, on every call. Strokes also calls `getSlide`.
  - `Strokes.targets` and `Rubble.byBody` exist only to serve `partyOf`.
- **Settled pairs.**
  - `MaterialRules.applyStep` checks the Settled pairs on every step while any are left. It maps every pair from `touchingPairs()` (a copy of the adapter's whole map) through `partyOf` into string keys.
  - `settledPairs()` in the world unions the rules' Settled pairs with the pairs touching now.
  - `rebuild` calls `rules.settle(snapshot.settled)`, and `clear` calls `rules.settle([])`.
- **Squeeze.**
  - `Strokes.squeeze` calls `physics.slideOut`, and so does `Strokes.restore` for a saved slide.
  - `Party.sliding` is read from `getSlide(body) !== null` after the step.
- **The adapter's `touching`** is built only from the begins and ends it reports:
  - For a body it rebuilt (wake, Release, a slide ending), it drops the pairs the engine no longer has. It reports those drops as ends, and it doesn't report the engine's repeated begins.
  - `removeBody` drops the body's pairs from `touching` at once. It reports their ends at the next step (`pendingEnds`).
  - `reset()` clears everything.
  - `BodyId`s are never reused within one engine world, so a late end can't name a new body.

  So a ledger that applies the same begins and ends, drops a body's pairs when it is unregistered, and ignores ends for pairs it doesn't hold, stays equal to `touchingPairs()`.

## Suggested design (a proposal)

Rename and reshape freely, but cover each line.

```ts
/** Who a body is to the rules. Built once per record; rebuilt with it on restore. */
export interface Party<T> {
  /** Never reused; the same after a rebuild. The Terrain is 0. */
  readonly id: number;
  /** The Stroke it is part of: a Piece's Line, otherwise its own id. */
  readonly stroke: number;
  readonly body: BodyId;
  /** What takes damage on this side, or null (Terrain, Rubble). */
  readonly target: T | null;
}

export class ContactLedger<T> {
  constructor(physics: Pick<PhysicsWorld, 'getSlide'>);
  /** A new Party id, never reused. */
  newId(): number;
  register(party: Party<T>): void;
  unregister(body: BodyId): void;
  /** An Object started sliding off a Line: call it after every `physics.slideOut`. */
  squeezed(body: BodyId): void;
  /** Takes in one step's report, and fills the channels below until the next step. */
  step(report: StepReport): void;
  readonly hits: readonly { a: Party<T>; b: Party<T>; hit: ContactHit }[];
  readonly newContacts: readonly { a: Party<T>; b: Party<T>; pair: ContactPair }[];
  /** The Parties touching `party` now, Settled included; none while either side is Squeezed. */
  touching(party: Party<T>): Iterable<Party<T>>;
  save(): SavedContacts;
  /** After `physics.reset()`: empties the index and touching, and takes the saved Settled pairs. */
  restore(saved: SavedContacts): void;
}
```

- **`Party` moves** from `material-rules.ts` to `contact-ledger.ts`, and loses `key` and `sliding`. The ledger doesn't import the Material rules; the rules use `Party<Breakable>`.
- **Kinds get the ledger when they are constructed**, as they get the physics world:
  - `Strokes` registers a Party for each Piece in `addPiece` and for each Object in `add` and `restore`, and unregisters in `removeBody`. It calls `squeezed` wherever it calls `slideOut`.
  - `Rubble` registers in `addBody` and unregisters in `cap` and `clear`.
  - The Party id goes on each record (`Piece`, `LineStroke`, `ObjectStroke`, the Rubble record), so it is saved with it. Views don't show it, so `world.contents` doesn't change.
  - `Kind` loses `partyOf` and its `Target` parameter.
- **The Sandbox world:**
  - It registers the Terrain as Party 0 at construction and after every `physics.reset()`.
  - `step()` becomes: `const report = physics.step(); ledger.step(report); broken = rules.applyStep(ledger.hits)`.
  - `takeSnapshot` saves `ledger.save()` as `contacts`.
  - `rebuild` calls `ledger.restore(snapshot.contacts)` right after `physics.reset()`, before the kinds restore.
  - Clear leaves nothing Settled or touching, since every kind unregisters its bodies. The Terrain stays registered.
- **The Material rules:**
  - `applyStep(hits)` takes the ledger's hits and returns what broke, as today.
  - The "strongest hit per receiver per other Stroke" grouping keys on the pair `(receiver.id, other.stroke)`, as a number. Keep the grouping in insertion order, because the order of what broke is the order `releaseFill` draws from `world.random`.
- **Inside the ledger** (performance):
  - Keep touching as adjacency, `Map<partyId, Map<partyId, entry>>`, both ways round, so `touching(party)` and `unregister` touch only that Party's neighbours.
  - Keep the shape pairs of each touching Party pair in its entry, not just a count. A count would do for this slice, but #18 must know whether a body touches a green Patch's shape or only its host's other shapes.
  - Keep the Settled pairs as a `Set` of numeric pair keys, such as `lo * 2 ** 26 + hi`. That is exact while ids stay below 2²⁶; assert it in `newId`.
  - Clear the channel arrays (`length = 0`) at the start of each step rather than making new ones.
- **The order within `ledger.step`**, which is what keeps damage identical to today:
  1. Check each Object on the sliding list with `getSlide`. Those that return null ended their slide in this step: take them off the list, but remember them for this step.
  2. Apply the ends, then the begins, in report order. That is the adapter's own order. A Party pair whose shape pairs go from none to some is a new contact, carrying that begin's pair. A pair that ends and begins again in the same step is a new contact. Ignore begins and ends naming a body with no Party, and ends for shape pairs the ledger doesn't hold.
  3. Drop Settled pairs that no longer touch, judged on the state at the **end** of the step, not at each end event. A Settled pair that ends and begins again in the same step stays Settled, as today.
  4. Fill hits and new contacts, dropping Settled pairs and sliding Objects. Squeezed is judged after the step, as today's `getSlide` check is. So a hit in the step a slide ends counts, but a new contact involving an Object whose slide ended in this step doesn't.

## Watch out for

- **The first step after a restore.** The engine reports every existing contact as beginning again. Those pairs are all Settled, so they give no hits and no new contacts. But a Settled pair that doesn't begin again in that step never gets an end, so dropping pairs on ends alone would keep it Settled for ever. After the first step that follows a restore, drop every Settled pair that isn't touching, once. Today's check does exactly that at that step.
- **A Squeezed Object's pairs still count as touching inside the ledger.** They are hidden only in the channels. A snapshot taken while an Object slides (pause mid-slide, then start again) must save its pairs as Settled, as `settledPairs()` does today. Otherwise the step its slide ends could deal damage that today's code doesn't.
- **Removal.** `unregister` drops the body's touching and Settled pairs at once, and the ends the adapter sends for them at the next step are ignored. Breaking happens after `ledger.step` within the step, so the next step's report can name bodies already gone.
- **Replays.** Party ids differ between the first run and a replay only for things made during the run, and ids only grow. Nothing may depend on the values themselves, only on their order, which is the same in both. The hit order, and so the order things break, must stay the engine's report order.
- **Existing tests stay unchanged.** Party ids and the snapshot's shape never appear in views. The 16 `bodyCount` assertions are unaffected.
- **README.** "Patterns the slices follow" describes Parties, Settled pairs, the snapshot and the step order as #24 left them. Rewrite those bullets. Also fix the engine fact that points at `nextStrokeId` for ids that are never reused.

## Tests

- **Changed: only `material-rules.test.ts`.**
  - Its damage cases stay, and are fed hits in the ledger's form instead of a report plus `partyOf`. They cover: threshold, both sides, Terrain, two shapes as one impact, the blue counter, durability, Piece numbers, and one Line's Pieces as one impact.
  - Two cases move to the ledger's tests: "ignores hits where either side is sliding" and "ignores pairs settled at the start until they stop touching".
  - `physics-world.test.ts` keeps its `touchingPairs` tests.
  - Every Sandbox world, gallery, replay and stress test passes unchanged.
- **New `contact-ledger.test.ts`, driven by hand-made step reports and a fake `getSlide`.** One case each:
  - Hits between registered Parties come through in report order, with their Parties. A hit naming an unregistered body is dropped.
  - A Settled pair gives no hits and no new contact, but does show as touching. Once the two come apart, their next contact is new and their hits count.
  - After the first step that follows a restore, Settled pairs that aren't touching are dropped.
  - A Settled pair that ends and begins again in one step stays Settled.
  - While an Object is Squeezed, it is missing from hits, new contacts and touching. In the step its slide ends, its hits count and none of its contacts are new.
  - A Party pair touching through two shape pairs is one touching entry. It stays touching until both shape pairs end. The new contact carries the first shape pair.
  - Unregistering a body drops its pairs at once. Its late ends at the next step are ignored.
  - After a save and restore, everything touching or Settled at save time is Settled, including a Squeezed Object's pairs.
- **New, on the real engine.** Build a small scene with the physics module directly: Terrain, a Line, a stack of Objects (one Frozen and woken by a hit) and some Rubble circles.
  - Feed the ledger each step's report through a wake, a squeeze, a removed body, and a `reset` followed by a rebuild.
  - After every step, the ledger's touching must equal `touchingPairs()` mapped to Party pairs, leaving out Squeezed Objects.
  - This guards the whole approach. Both "no behaviour change" and #17's glue drag depend on event-built touching never drifting from the engine's.

## Verdict

- **Before and after.** Run `npm run verdict`. Checks 1, 2 and 4 must give identical numbers. Check 3 is step timing, so compare it within its noise.
- **Add check 5 first, and run it on the code before your change.** It measures contacts at rest:
  - Build a Rubble pile at its cap (`rubbleCap`, 150), resting on Lines and Objects, through the Sandbox world's commands. For example, break black-filled Objects on a tray of Lines, as `fill-release.test.ts` does.
  - Let it come to rest, then pause and start again, so that physics starts with many Settled pairs.
  - Time the whole `world.step()` (physics, ledger and damage) for 10 s simulated. Print the mean, p99 and max, like check 3.
- **Put both numbers in the commit message.** The step must not be slower, and should be faster: this is exactly the case where today's code maps every touching pair on every step. #21's Demolition timings remain the milestone-wide measure.

## Later handoffs

The handoffs for #17, #18 and #19 were rewritten with this one to read contacts from the ledger and to save Party ids. If your names differ from the proposal above (`ledger.hits`, `newContacts`, `touching`, `squeezed`, `register`, Party `id` and `stroke`), fix them there. In particular:

- **#17** reads sticking's new contacts and the glue drag's touching from the ledger. It uses the ledger's sliding list to learn when a slide ends, rather than polling `getSlide`.
- **#18** needs the shape pairs of a touching entry for green Patches.

## README

No player-facing change, so no README paragraph. Delete this handoff and its row in [README.md](README.md) in the commit that closes #27, as every slice does.
