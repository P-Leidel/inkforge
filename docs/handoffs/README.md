# Milestone 2 handoffs

One handoff per remaining agent slice of milestone 2. Each is for a fresh session that implements exactly one issue:

| Issue | Handoff |
|---|---|
| [#33 Material rules](https://github.com/P-Leidel/inkforge/issues/33) | [33-material-rules.md](33-material-rules.md) |
| [#20 Red Lines and the fuse](https://github.com/P-Leidel/inkforge/issues/20) | [20-red-lines-and-the-fuse.md](20-red-lines-and-the-fuse.md) |
| [#21 Demolition scene](https://github.com/P-Leidel/inkforge/issues/21) | [21-demolition-scene.md](21-demolition-scene.md) |

[#22](https://github.com/P-Leidel/inkforge/issues/22) (the blind check and the frame rate) is for a person, so it has no handoff.

The issues form a chain, in the order of the table: each is blocked by the one before it. The [architecture review after #16](../adr/reports/architecture-review-2026-09-25.html) inserted two refactors before #17, both done: #24 (Arena contents in their own modules, its candidate 1) and #27 (the Contact ledger, its candidate 2). #17 (Green), #18 (Spills and Patches) and #19 (Red Objects and Blasts) are done too. The [architecture review after #19](../adr/reports/architecture-review-2026-09-26.html) then inserted #33 (the Material rules decide every consequence, its candidate 1) before #20, so #33 comes next. Its other candidates are filed as issues outside this chain: #34 (body description), #35 (Frozen wake rule), #36 (Arena queries) and #37 (Materials module); candidate 4 (one read model) waits on #21's timings and candidate 7 (ink textures) on #22's frame times. Start an issue only once the one before it is closed and CI is green on `main`. To start one, open a session on this repository and say:

> Implement issue #33 of P-Leidel/inkforge. Read `docs/handoffs/README.md`, then `docs/handoffs/33-material-rules.md`, and follow them.

## How fresh these are

These were written on 2026-09-25 against the code at `1e13bc5`, the commit that closed #15 (Lines break Piece by Piece). Anything they say about code from #16 onwards is a plan, not a fact. #16 and #24 updated them to the code they left behind: #24 moved each kind of Arena contents into a module of its own, so every name below from `sandbox-world.ts` was checked against the code after #24. The handoffs for #17–#19 were rewritten with #27's to read contacts from the Contact ledger, and #27 updated them to the ledger it built. #17 updated #18–#21 and this README to what it built: glue drag, sticking, the Bonds kind, the physics module's impulses and bonds, and "host gone". #18 updated #19–#21 and this README to what it built: the Droplets and Patches kinds, harmless Parties, added shapes, non-waking circles and glue through Patches. #19 updated #20, #21 and this README to what it built: the Blasts kind, the break path for red, `bodiesWithin` and Blast damage. #33's handoff was written against the code after #19 (`958b7c3`), and the Patterns below still describe that code: until #33 lands, the break path, Fill release, Blast arrival, glue wear and Droplet landing are private methods of the Sandbox world.

- The code on `main` wins where it disagrees with a handoff. So do the commit messages of the slices before yours; each ends with "Decisions the spec left open:". Read those for every slice since #14 (`git log --oneline`), before you design anything.
- Each handoff's design section is a proposal. Change it when the code argues otherwise, and record why in your commit message.
- **Keep the later handoffs current.** Before you commit, update every later handoff that your work makes wrong: names, files, and decisions it relies on. Delete your own handoff and its row in the table above in the commit that closes your issue; git history keeps it. When you close #21, delete this README too, and the "Milestone 2 handoffs" section in `CLAUDE.md`.

## Read first, for every slice

- The issue and its acceptance criteria.
- The spec, [`docs/specs/m2-colours.md`](../specs/m2-colours.md). Each handoff names the sections that matter.
- [`CONTEXT.md`](../../CONTEXT.md), the glossary. Use its terms exactly: Piece, Debris (visual only), Rubble (physical), Spill, Droplet, Patch, Blast.
- The ADRs in [`docs/adr/`](../adr/): above all 0001 (only `src/physics/` imports the engine; lint enforces it), 0002 (Lines stay fixed), 0003 (the only runtime joint is green sticking), 0004 (Objects start Frozen), 0007 (glue drags every moving body) and 0008 (red explodes when destroyed).
- `CLAUDE.md` and `docs/agents/*.md`.

## Working agreement (settled with the user; don't ask again)

- **Scope.** Work only your issue. Finish it with every check green, then commit to `main` with `Closes #N` in the message and push with `git push -u origin main`. Don't open a pull request. Every push to `main` deploys to GitHub Pages.
- **When to stop.** Stop only for a real blocker, or for a design question that the spec, the issue and your handoff don't answer. Otherwise decide, and list what you decided under "Decisions the spec left open:" in the commit message, as `73c1655` does.
- **Starting numbers are yours to pick.** Put every number in the material table (`src/materials/material-table.ts`); the F2 panel lists whatever the table holds, with no changes needed. Every Colour gets every field; use 0 where a role doesn't apply.
- **Commits.** Don't add Claude as a co-author (CLAUDE.md). End each commit message with a `Claude-Session:` line for your own session only. Put no model names in commits. The subject is imperative with no prefix. The body explains what changed and why, in plain prose.
- **README.** Update `README.md` in the same commit: the controls table if you add a control, a paragraph on what your slice adds, and the gallery paragraph for new demos.
- **Gallery demos.** Build them through the Sandbox world's commands. Start physics and let the Objects go before the snapshot with `letGo()` in `src/gallery/gallery.ts`, so R and then Space replay the demo. Add each demo to `GALLERY`. The gallery test checks that every demo builds and replays identically.
- **Reset and Clear.** Whatever a slice adds to the Arena contents is a kind (see [Patterns](#patterns-the-slices-follow-as-of-24)), or part of one: its `save`, `restore` and `clear` are how Reset and Clear cover it. Clear also forgets the snapshot.
- **Also settled:**
  - F2 edits are lost on reload; "Copy as JSON" is how the user keeps them.
  - Restitution mixes as the max of the two sides and friction as the geometric mean, as Box2D does.
  - A Fill's ink weighs the same per px² as an Outline's (`inkMass`).
  - All art is procedural placeholder drawn in Phaser, and the F2 panel is plain HTML.

### Decisions the user made for later slices (2026-09-25)


## Checks and environment

- Run the whole CI check before every commit. Save this as `check.sh` in your scratchpad:

  ```bash
  #!/usr/bin/env bash
  set -eo pipefail
  cd /home/user/inkforge
  npm run -s lint
  npm run -s format:check > /dev/null
  npm run -s typecheck
  npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|×"
  npx vitest run > /dev/null 2>&1
  npm run -s build > /dev/null 2>&1
  echo "ALL CHECKS PASSED"
  ```

  - Never pipe lint through `tail`; that once hid a lint error and turned CI red.
  - Lint forbids `Math.random` and unused variables, including ones left over from destructuring.
- `npm install` runs `scripts/patch-phaser-box2d.mjs` as a postinstall step. The patch frees a destroyed world's slot, and `destroyB2World` throws if it is missing.
- Run `npm run verdict` once at the end. The ADR 0001 checks (tunnelling, stacking, performance, stability) must still pass.
- **Visual checks:**
  - Start the dev server with `(setsid npx vite --port 5173 --strictPort --force > <scratch>/vite.log 2>&1 &)`.
  - **Never** run `pkill -f "vite --port 5173"`. The pattern also matches your own shell, so it kills it.
  - Take screenshots with headless Chromium through the global Playwright: `NODE_PATH=$(npm root -g) node shot.cjs`, launched with `args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader']`.
- **GitHub.** Cloud sessions have no `gh` CLI, so use the GitHub MCP tools for what `docs/agents/issue-tracker.md` does with `gh`: read the issue, and list the workflow runs for your commit to check CI.
- **`main` may move.** The session that reviews your work can push small fixes. If your push is rejected, `git pull --rebase origin main`, run the checks again, then push.

## Engine facts (Phaser Box2D 1.1.0, a JS port of Box2D v3; 50 px per metre)

- **Typings.** Only `src/physics/` imports the engine. Its typings are hand-written in `src/physics/box2d/phaser-box2d.d.ts`; declare each new function you use there.
- **Available functions.** All of these exist in `node_modules/phaser-box2d/dist/PhaserBox2D.js`:
  - circle shapes: `b2CreateCircleShape`, `b2Circle`
  - weld joints: `b2CreateWeldJoint`, `b2DefaultWeldJointDef`, `b2DestroyJoint`
  - forces and impulses: `b2Body_ApplyForce(ToCenter)`, `b2Body_ApplyTorque`, `b2Body_ApplyLinearImpulse(ToCenter)`, `b2Body_ApplyAngularImpulse`
  - queries and shapes: `b2World_OverlapAABB`, `b2Shape_GetClosestPoint`, `b2DestroyShape`
  - body settings: `b2Body_SetBullet`, `b2Body_SetMassData`
  - collision filters: `filter.categoryBits`, `maskBits` and `groupIndex` on the shape def
- **Checked on 2026-09-25 with small scripts:**
  - A dynamic body welded to a fixed one hangs in place, sagging 0.09 px in 2 s.
  - A shape of density 0 added to a moving body leaves its mass unchanged, and so does destroying that shape.
  - Two shapes in the same negative `groupIndex` never touch.
  - Destroying a body destroys its joints.
  - `b2Shape_GetClosestPoint` returns the right point.
  - **`b2World_OverlapCircle` is broken:** it hands a `b2Vec2` to `b2MakeProxy`, which wants an array, and throws. Use `b2World_OverlapAABB`, which only tests fat bounding boxes, then `b2Shape_GetClosestPoint` for exact distances.
- **Frozen Objects are fixed bodies.** Box2D can't turn a fixed body into a moving one (ADR 0001), so Release, waking and the end of a slide destroy the body and build a new one: `rebuild` in `box2d-physics-world.ts`. Whatever is attached to a body must be carried over there:
  - already done: the shapes' surface and density, and their `ShapeId`s;
  - bonds (#17), since joints die with their body: `rebuild` welds each of the body's bonds again (`reweld`), holding the two bodies as they are then, so a slide carries a bond along;
  - Patch shapes (#18): the shapes `addCapsule` added, kept with their `ShapeId`s and surfaces (`added` in the adapter).
- **Who touches whom.**
  - Fixed bodies (Terrain, Lines, Frozen Objects) never touch each other.
  - Kinematic bodies (Objects sliding off a Line) don't touch fixed ones.
- **Contact events.**
  - Begin and end events are per shape pair. They are cleared at the start of every `b2World_Step`. So the end events the engine makes between steps are lost: the adapter reports a removed body's contacts ending itself (`pendingEnds`), and so does a new weld joint (`weld`), since a joint without `collideConnected` destroys its two bodies' contacts.
  - A begin event carries the contact manifold. The adapter keeps where each pair that began in the last step touched: `physics.touchPoint(pair)`. It is there even for a body the step rebuilt (a wake), whose contacts the engine has already forgotten.
  - A hit event is reported when either shape enables hit events. Object and circle (Rubble, Droplet) shapes have them on; Line and Terrain shapes have them off. A Patch shape has them as its host's own shapes do.
  - Destroying a shape (`removeShape`) destroys its contacts, and their end events are lost too: the adapter reports them itself, as for a removed body.
- **Replays are identical only in a fresh engine world.** Every start and every R calls `physics.reset()` and rebuilds everything from the snapshot. Body and shape ids start again from 1 after a reset, so never keep them in a snapshot or a Settled pair; use the Sandbox world's own ids, which are never reused: Party ids (the Contact ledger's `newId`), and each kind's own ids (Stroke, Rubble, Droplet and Patch ids). The Patches kind maps each Patch to its new `ShapeId` on restore.
- **Live references.** `b2Body_GetPosition` and `b2Body_GetRotation` return live objects. Copy them before you destroy or rebuild a body.
- **Exact transforms.** Converting an angle to the engine's cosine and sine and back isn't exact to the last bit, so R and then Space could drift. Since #15, an Object reports the transform and velocity it was created with for as long as the engine still holds exactly those (`Placement` and `placed` in the adapter). Circles (`addCircle`, #16) do the same through the adapter's `place` helper; any other new body kind created with a pose or a velocity needs it too.
- **Ghost collisions.** A body sliding fast along a Line can catch the round end where two capsules meet and be thrown off (ADR 0001). Pieces add seams.
- **Continuous collision** is on. Every fast moving body gets it against fixed bodies; that is the milestone 1 tunnelling check. `isBullet` adds it against moving bodies too.
- **Contact buffer.** `contactBuffer` holds 64 entries. Patches add shapes, and contacts, to their hosts. `contactCentre` and `trackContacts` read at most 64 contacts of one shape or body. Since #16, `contactCentre` reads the moving side's shape, so the Terrain's ground under a big Rubble pile doesn't overflow it. A rebuilt body buried in more than 64 contacts would still lose track of some in `trackContacts`.
- **Circles roll to a stop.** Box2D has no rolling resistance, so the adapter gives circles an angular damping (`CIRCLE_ANGULAR_DAMPING`, 3 per second); spin damping slows a roll through friction. Glue drag on Rubble comes on top of it.
- **Drawn balls are polygons.** A drawn circle is a polygon of many sides, so it rocks onto a flat when it comes to rest (about 1.5 s), and it slows as it rolls. It also hops over the seams between capsules and Pieces when rolling fast or down a steep Line: a green ball rolling down a 45° grey ramp leaves it for 7 steps and more.
- **Bodies sleep.** A body at rest for a while sleeps, and reads a velocity of exactly 0. `applyImpulse` wakes it.
- **Added shapes** (#18). `addCapsule(body, segment, radius, surface)` adds a capsule in the body's own coordinates with density 0, so the body's mass is unchanged; `removeShape` and `setShapeSurface` go with it. `setSurface` and `setMass` touch only a body's own shapes. On a fixed body an added shape finds what already overlaps it at once (`forceContactCreation`).
- **Bodies within a radius** (#19). `bodiesWithin(centre, radius)` returns every body with one of its own shapes within `radius`, with its nearest point and distance (0 if the centre is inside it), leaving out shapes `addCapsule` added. It queries `b2World_OverlapAABB` and measures each shape with `b2Shape_GetClosestPoint`. The order is the engine's, so sort what you get (Blasts sort by Party id).
- **Circle options** (#18). `CircleBodyDef` takes `group` (circles of one group never touch: a negative `groupIndex`), `wakes: false` (its hits never wake a Frozen Object; the adapter's wake loop skips it) and `bullet` (continuous collision against moving bodies too). Droplets use all three.

## Patterns the slices follow (as of #19)

- **Arena contents are kinds.** Each kind of Arena contents (`CONTEXT.md`) is a module of its own behind the shared `Kind` shape in `src/sandbox/arena-contents.ts`. Today there are six:
  - `Strokes` (`src/sandbox/strokes.ts`): Lines with their Pieces, Objects with their Fills, the undo history, the squeeze, and breaking Objects and Pieces;
  - `Rubble` (`src/sandbox/rubble.ts`, next to `packRubble` and `launchRubble`): the Rubble, the cap and the fading ghosts;
  - `Bonds` (`src/sandbox/bonds.ts`): green Objects stuck to what they touched. Each bond keeps the Party ids of both sides and its physics bond; it saves the bond's anchors (`physics.getBond`) and restores it by looking both Parties up in the ledger (`contacts.party(id)`). Its views give each bond's Object and point;
  - `Droplets` (`src/sandbox/droplets.ts`, next to `dropletCount` and `packSpill`): the Droplets in flight. Each is a harmless Party (below); `land(contacts.newContacts)` removes every Droplet with a new contact and returns a `Landing` (Colour, length share, centre, host Party) for each. Droplets that leave the Arena vanish in its turn;
  - `Patches` (`src/sandbox/patches.ts`, next to `layPatch`): the Patches, each a capsule added to its host's body (`physics.addCapsule`), with the host's Party id, its segment in host coordinates and how much of it is used. A Patch has no Party of its own: contacts and hits on it are its host's and name its shape (`isPatch(shape)`). It wears by `wearByHits(contacts.hits)` (times its Fill Colour's `patchHitWear`) and by glue (`wear`), `removeUsedUp()` returns a `Puff` of Debris for each one used up, and `add` applies the cap (`patchCap`).
  - `Blasts` (`src/sandbox/blasts.ts`, next to `blastInk`, `blastSize` and `blastStrength`): the Blasts still spreading, each with its centre, reach R, strength S, radius now and the Party ids it has acted on. It has no bodies. `add(centre, ink)` starts one, and `spread(dt, act)` grows every ring and hands the world what each newly reached (step order below). Its `gone` forgets gone Parties in the acted-on sets.

  A kind owns its records and its own ids, which are never reused (not even after R or Clear). It covers its `views`, its part of the snapshot (`save`) and rebuilding from it (`restore`), `clear`, `dropVisuals` (what R drops), `solids` (what new Objects may not overlap), `surfaceOf(party)` (a body's `HostSurface` in its own coordinates, where a Droplet lands: an Object's Outline, a Piece's capsules, a Rubble circle; null for the rest), `applySurfaces` (after a table edit), `gone` (host gone, below) and `step` (its turn in each step). It gets the Contact ledger's `PartyIndex` when it is constructed, registers each of its bodies' Parties as it adds the body, also on restore, and unregisters it as it removes the body (see Parties below). It keeps nothing for what is gone, not even a lookup entry, apart from its ids.
- **One list of kinds.** The Sandbox world holds the kinds in one fixed list, in rebuild order: `Kinds` and `this.kinds` in `sandbox-world.ts`, today Strokes, Rubble, Bonds, Droplets, Patches, then Blasts. A new kind is one new module added to that list after its hosts. The snapshot, rebuilding, Clear, the Stroke context, the table re-apply, host gone and the step then cover it with no other change, and registering its Parties covers its contacts. `world.contents` holds every kind's views by kind name (`contents.strokes.lines`, `contents.rubble`, `contents.bonds`, `contents.droplets`, `contents.patches`, `contents.blasts`); it is only Arena contents, and the renderer doesn't use it.
- **Host gone.** Whatever is attached to a body goes when the body goes. Every removal goes through the ledger (`unregister`), which logs the Party; the world drains the log (`contacts.takeGone()`) in `passOnGone` and hands the Parties to every kind's `gone(parties)`, in kind order: at the end of each step, before the kinds' turns, and after `remove` and `undo`. Clear drops the log, since every kind clears itself. `Bonds.gone` removes each bond with a side gone, and the green Object falls free; `Patches.gone` drops each Patch whose host is gone (its shape went with the body). A rebuild forgets Parties without them going.
- **Kinds never call each other.** A kind reports what happened, and the world passes it on. `strokes.break(target)` removes a broken Object or Piece and returns a `Broken`: the Debris to burst, and for an Object its `ReleasedFill` (Colour, mass, local Outline, and the Object's pose and motion as it broke). For an Object it also has a `BrokenOutline` (Colour, length and centre). The world's `breakTarget` bursts the Debris, calls `releaseFill`, which hands the Rubble to `rubble.add` or the Spill to `droplets.add`, and then `explode`, which starts a Blast (`blasts.add`) if the Outline or Fill `explodes`. A Blast reports what its ring reached, and the world pushes, damages and breaks (`blastReached`). A Droplet's `Landing` goes from `droplets.land` to `patches.add` through the world, with the host's surface from `surfaceOf` (the world's own Terrain polygons for Party 0).
- **Step order.** `SandboxWorld.step()`:
  1. applies table edits, steps physics (`StepReport { hits, begins, ends }`) and hands the report to the Contact ledger (`contacts.step(report)`), and steps Debris;
  2. runs the damage rules (`src/sandbox/material-rules.ts`) on the ledger's hits: `rules.applyStep(contacts.hits)` returns what broke, not yet broken;
  3. runs sticking (`src/sandbox/sticking.ts`) over every Object, `sticking.step(strokes.objectRecords(), dt)`, and bonds each Object that sticks to its host at `physics.touchPoint(pair)` (`bonds.add`). This comes before breaking, so a green Object whose first new contact breaks in the same step sticks and falls free at once;
  4. lands Droplets (`layPatches`: `droplets.land`, then `patches.add` for each), and wears Patches by the ledger's hits (`patches.wearByHits`). This too comes before breaking, so a Patch on something that breaks in the step goes with it;
  5. breaks what the damage rules returned, with `breakTarget`;
  6. applies glue drag (`src/sandbox/glue.ts`) to what touches glue, `glue.apply([...strokes.pieces(), ...patches.gluers()], dt, wearGluer)`, and breaks the Pieces it wore out with `breakTarget`;
  7. spreads the Blasts (`blasts.spread(dt, blastReached)`): each ring grows by `blast.speed × dt`, in creation order, and acts once on each Piece, Object, Rubble and Droplet it newly reaches (`physics.bodiesWithin`, measured to the nearest point; not the Terrain, not added capsules such as Patches), by Party id, at `S × (1 − d/R)²`. `blastReached` damages Pieces and Objects not sliding (`rules.applyBlast`, which doesn't count an impact), wakes a Frozen Object whose push over mass beats `wakeSpeed`, pushes free bodies outward (`applyImpulse`, `push × s`, capped at `maxPushSpeed` of speed change), then breaks what broke with `breakTarget`. Red broken there starts a Blast that grows in the same call, after the others. Blasts at their reach are dropped;
  8. passes on what the step removed (`passOnGone`, host gone above), removes the used-up Patches with a puff of Debris each (`patches.removeUsedUp()`), and then gives each kind its turn, in list order. (Rubble's turn ages the fading ghosts; Droplets' removes those out of the Arena.)
- **Fill release.** `releaseFill(fill)` in the world puts out a broken Object's Fill in the same step: a Spill if its Fill Colour `spills` (blue, green; `releaseSpill`), otherwise Rubble (`releaseRubble`), which is none for a Fill whose `rubbleMax` is 0 (red). Grey and black give Rubble: `packRubble` and `launchRubble` in `src/sandbox/rubble.ts` pack circles inside the Outline and kick them outward (`kickSpeed` per Fill Colour, `kickSpread` shared), and `rubble.add` gives them ids and applies the cap. A Spill is `packSpill` (in `droplets.ts`: the count, then a spot per Droplet from `hexSpots`, drawn from `world.random` in that order) launched by the same `launchRubble`. Blasts (#19) come after it, in `breakTarget`: `explode` sums the broken Object's red ink (`blastInk`) and starts a Blast at its centre, so the Blast acts on what the Fill released.
- **The Contact ledger** (`ContactLedger` in `src/sandbox/contact-ledger.ts`, the world's `contacts`) decides which contacts count, for every rule. It is fed each step's report and never reads the engine; it asks physics only whether a sliding Object still slides. After each step it gives three channels, in the engine's report order, in arrays reused from step to step:
  - `hits`: `{ a, b, hit }`, the hits that count, as two Parties and the `ContactHit`;
  - `newContacts`: `{ a, b, pair }`, Party pairs that didn't touch as the step began and do at its end, with the shape pair that made them touch;
  - `touching(body)`: `{ party, pairs }` for each Party touching that body's Party now, Settled pairs included, with the shape pairs between them.

  Hits and new contacts leave out Settled pairs and Squeezed Objects, and every channel leaves out a Squeezed Object while it slides; what it touches in the step its slide ends isn't new. Its touching is built from the report's begins and ends (ends first, as the adapter applies them), so it changes only when contacts do: a resting pile costs nothing per step. A test on the real engine checks that it equals `touchingPairs()` after every step; the Sandbox world no longer calls `touchingPairs()`.

  It also looks a registered Party up by its id (`party(id)`) or its body (`partyOf(body)`, #19), and logs every Party unregistered (`takeGone()`, host gone above).
- **Parties.** Each body is a Party (`Party<T>`) to the ledger:
  - `id`: a `PartyId`, a number from the ledger's one counter (`newId`), never reused, not even after R or Clear, and not in the snapshot. Each record keeps its id as `party`, so it is the same after a rebuild. The Terrain is 0 (`TERRAIN_PARTY`), registered by the world at construction and after every `physics.reset()`;
  - `stroke`: the Stroke it is part of. A Line has a Party id but no body, and each of its Pieces carries it as `stroke`; anything else carries its own id;
  - `body`, and a `target` that takes damage (an Object or a Piece, a `StrokeTarget`), or `null` (Terrain, Rubble, Droplets);
  - `harmless`, true for a Droplet: the damage rules skip every hit with a harmless Party, sticking never sticks to one, and a Patch doesn't wear from one.

  A kind builds each Party once per record, when it adds the body, and registers it (`register`); `unregister(body)` drops the Party with everything it touched and was Settled with, at once. `Strokes` calls `squeezed(body)` after every `slideOut`, and the ledger then checks only the sliding Objects each step. Pair keys are numbers (`pairKey`, exact while ids stay below 2²⁶), never strings.
- **Breakables** (`ObjectStroke`, `Piece` in `strokes.ts`) carry a `role`, `'outline'` or `'line'`, which picks their Colour's numbers in the table. Pieces have no impact limit.
- **Lines.** A `LineStroke` holds the ordered `Piece`s it has left. Each Piece is its own fixed body, made with `physics.addLine(piece.segments, …)`, so its capsules are in world coordinates. The Line goes with its last Piece.
- **Settled pairs.** Pairs of Parties touching when physics starts are Settled (`CONTEXT.md`): they give no hits and no new contacts until they have come apart, but they are touching. The ledger is their only owner. Its `save()` keeps every pair Settled or touching then, a Squeezed Object's too, as numeric pair keys, and its `restore()` takes them back after `physics.reset()`. A Settled pair is dropped once it no longer touches at the end of a step (so one that ends and begins again in one step stays Settled), and the first step after a restore drops every Settled pair not touching again. After a rebuild, the engine reports every existing contact as beginning again; those pairs are Settled, so anything reading hits or new contacts skips them with no extra work.
- **Damage.** `MaterialRules.applyStep` reads the ledger's hits. Each target takes only the strongest hit of the step from each Stroke it hit (grouped by the receiver's id and the other side's `stroke`, in the order the hits came, which is the order what broke comes back in). So an Object landing across two Pieces takes one impact, while each Piece takes its own hit. Each side is checked against its own threshold, and damage is `(impulse − threshold) × damagePerImpulse`.
  - Squeezed Objects deal and take no damage: the ledger leaves out their hits, and Blasts skip them.
  - Blasts damage through `MaterialRules.applyBlast(target, strength)`, against the same threshold, without counting an impact.
  - Terrain and Rubble take none. Droplets deal and take none (harmless).
  - A blue Object also counts impacts and breaks on the third.
- **Rubble.** The `Rubble` kind holds it oldest first. Its private `cap()` removes (and unregisters) the oldest over `rubbleCap` at once and leaves a body-less fading ghost (`world.fadingRubble`, visual only like Debris, not in `world.contents`). Anything attached to Rubble (a green bond, a Patch) goes when the cap removes it, through host gone. `packRubble`'s helpers `hexSpots` and `deepestPoint` are exported for Spills.
- **Glue drag** (`Glue` in `src/sandbox/glue.ts`, one of the Material rules). Each step it walks the gluers it is handed (every Piece and every Patch; a `Gluer` has a `colour`, a `body` and, for a Patch, the one `shape` it glues through) whose Line Colour has `glueDrag` above 0, and reads what each touches from the ledger, through the touching `pairs`: a Patch only through its own shape, a Piece only through its own shapes, not the Patches on it (`isPatch`, handed to `Glue` at construction). Every free body touching glue (`physics.isFree`) is dragged once, by the strongest glue it touches: its velocity and spin each lose `min(c·dt/m, 1)` of themselves (`applyImpulse`, `applyAngularImpulse` with `getInertia`). The momentum removed, times the gluer's `glueWear`, is shared evenly between the gluers it touches, and handed to the `wear` callback `apply` takes: the world's `wearGluer` damages a Piece and uses up a Patch (`patches.wear`). `apply` returns the ones worn out. Bodies at rest (asleep, velocity 0) are skipped, so resting on glue never wears it.
- **Sticking** (`Sticking` in `src/sandbox/sticking.ts`, one of the Material rules). Each Object keeps a `StickState` (`sticking` on `ObjectStroke`, saved with it; replaced, never changed in place, since the snapshot shares it): `waiting` (with whether it was free after the last step), `moving` (with the Strokes it started moving with, each with how long they've been apart) or `done`. Only Outlines whose Colour has `sticks` above 0 take part. An Object starts moving when `physics.isFree` has been true after two steps in a row: that covers Release, a wake by a hit or a Blast, and the end of a slide (a squeeze while moving sends it back to `waiting`), with no hook. What it touches then, by Stroke (the Party's `stroke`), doesn't count until they've been apart `FORGET_SECONDS` (0.25 s), which rides over hops at seams. Then its first entry in the ledger's `newContacts` with any other Stroke, not a Droplet (harmless), sticks it, and it is `done` for good. A green Object landing on a Patch sticks to the Patch's host.
- **Snapshot.** `takeSnapshot()` keeps `{ contents, contacts, random, time }`, where `contents` is each kind's `save()` by kind name and `contacts` is the ledger's `save()`. `rebuild()` resets physics, restores the ledger, adds the Terrain and calls each kind's `restore` in list order: Strokes in drawing order (each Line's Pieces in order), then Rubble oldest first, then Bonds, Droplets and Patches oldest first, then Blasts (no bodies). That order is replay order: changing it moves Box2D's ids and breaks exact replays. Only Debris and fading ghosts are left out. Space rebuilds from the snapshot it just took; R rebuilds from it and also drops Debris and each kind's visuals.
- **Randomness.** Simulation randomness comes only from `world.random`, whose state is in the snapshot. Kinds don't draw from it themselves: the world draws in a fixed order (`packRubble` or `packSpill`, then `launchRubble`, per broken Object, in the order the rules return them) and hands the results on. Debris has its own generator, so visuals never shift the simulation.
- **Rendering.**
  - The renderer reads only views: `world.lines`, `world.objects`, `world.rubble`, `world.fadingRubble`, `world.bonds`, `world.droplets`, `world.patches`, `world.blasts`, `world.debrisParticles`, and the ones you add (forward a getter to your kind's views). It never reads the physics module.
  - `world-renderer.ts` redraws a Stroke only when its look key changes.
  - `debug-overlay.ts` (F1) reuses a pool of text labels.
- **Tests.** There are two seams: pure units, and the headless Sandbox world with the helpers in `src/sandbox/test-support.ts`. The Contact ledger's tests (`contact-ledger.test.ts`) feed it hand-made step reports, plus one run on the real engine; the Material rules' tests feed them hits in the ledger's form; the glue's (`glue.test.ts`) feed it stub bodies and contacts. Green's world tests are in `green.test.ts`, Spills' and Patches' in `spills.test.ts` (with `spillWorld`, whose blue-outlined boxes break at their first touch and spill with no kick), Blasts' in `blasts.test.ts` (with `detonate`, a red ball dropped fast so it explodes where it lands, and `bombAt`, a Frozen red ball on the ground).
  - Tests check what a player would notice, not engine internals.
  - Milestone 1's tests must keep passing unchanged, unless your issue changes what they measure. Say so in the commit message, as #15 did.
  - The gallery replay test (`played` in `src/gallery/gallery.test.ts`) compares `world.contents` with every `id` left out, since what a run makes (Rubble, Droplets and Patches from a broken Fill) gets new ids each time it is played. A new kind is covered without editing it. Another gallery test checks, for every demo, that `world.contents` after R equals `world.contents` at Space, ids included.
  - The Fill release tests (`src/sandbox/fill-release.test.ts`) break grey-outlined boxes on short black Lines, so red exploding leaves them alone. One test checks that blue, green and red Fills release no Rubble; it stays true now that blue and green release Spills and red Blasts.

## When you're done

- Check CI on GitHub for your pushed commit, and fix it if it is red.
- Report to the user: what you built, and the decisions you made.
- Suggested skills: `tdd` (test first at the two seams), `diagnosing-bugs` (replays that differ, things breaking at rest), `code-review` (review your diff against the issue and the spec before you commit).
