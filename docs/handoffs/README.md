# Milestone 2 handoffs

One handoff per remaining agent slice of milestone 2. Each is for a fresh session that implements exactly one issue:

| Issue | Handoff |
|---|---|
| [#27 Contact ledger](https://github.com/P-Leidel/inkforge/issues/27) | [27-contact-ledger.md](27-contact-ledger.md) |
| [#17 Green](https://github.com/P-Leidel/inkforge/issues/17) | [17-green.md](17-green.md) |
| [#18 Spills and Patches](https://github.com/P-Leidel/inkforge/issues/18) | [18-spills-and-patches.md](18-spills-and-patches.md) |
| [#19 Red Objects and Blasts](https://github.com/P-Leidel/inkforge/issues/19) | [19-red-objects-and-blasts.md](19-red-objects-and-blasts.md) |
| [#20 Red Lines and the fuse](https://github.com/P-Leidel/inkforge/issues/20) | [20-red-lines-and-the-fuse.md](20-red-lines-and-the-fuse.md) |
| [#21 Demolition scene](https://github.com/P-Leidel/inkforge/issues/21) | [21-demolition-scene.md](21-demolition-scene.md) |

[#22](https://github.com/P-Leidel/inkforge/issues/22) (the blind check and the frame rate) is for a person, so it has no handoff.

The issues form a chain, in the order of the table: each is blocked by the one before it. The [architecture review after #16](../adr/reports/architecture-review-2026-09-25.html) inserted refactors before #17: #24 (Arena contents in their own modules, its candidate 1) is done, and #27 (the Contact ledger, its candidate 2) comes next. Start an issue only once the one before it is closed and CI is green on `main`. To start one, open a session on this repository and say:

> Implement issue #27 of P-Leidel/inkforge. Read `docs/handoffs/README.md`, then `docs/handoffs/27-contact-ledger.md`, and follow them.

## How fresh these are

These were written on 2026-09-25 against the code at `1e13bc5`, the commit that closed #15 (Lines break Piece by Piece). Anything they say about code from #16 onwards is a plan, not a fact. #16 and #24 updated them to the code they left behind: #24 moved each kind of Arena contents into a module of its own, so every name below from `sandbox-world.ts` was checked against the code after #24. #27's handoff was written against that code (`b245ec7`). The handoffs for #17–#19 were rewritten with it to read contacts from the Contact ledger it plans, so their ledger names are a plan until #27 lands.

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

- **#27 and #17.** A green Object never sticks while it slides off a Line. The end of the slide counts as it starting to move, and contacts touching at that moment (usually the Line it slid off) don't count. So it sticks to the next thing it touches. The Contact ledger (#27) carries the contact half of this for every rule: a Squeezed Object is out of every channel while it slides, and what it touches in the step its slide ends counts as already touching.
- **#18.** A hit on a Patch damages the Patch's host by the normal rule. The Patch itself takes no damage, and a blue Patch wears by the impulse of the bounce.

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
  - Patch shapes (#18);
  - green bonds (#17), since joints die with their body.
- **Who touches whom.**
  - Fixed bodies (Terrain, Lines, Frozen Objects) never touch each other.
  - Kinematic bodies (Objects sliding off a Line) don't touch fixed ones.
- **Contact events.**
  - Begin and end events are per shape pair. They are cleared at the start of every `b2World_Step`.
  - A hit event is reported when either shape enables hit events. Object and circle (Rubble) shapes have them on; Line and Terrain shapes have them off.
- **Replays are identical only in a fresh engine world.** Every start and every R calls `physics.reset()` and rebuilds everything from the snapshot. Body and shape ids start again from 1 after a reset, so never keep them in a snapshot or a settled-pair key; use the Sandbox world's own ids, which are never reused (`nextStrokeId`).
- **Live references.** `b2Body_GetPosition` and `b2Body_GetRotation` return live objects. Copy them before you destroy or rebuild a body.
- **Exact transforms.** Converting an angle to the engine's cosine and sine and back isn't exact to the last bit, so R and then Space could drift. Since #15, an Object reports the transform and velocity it was created with for as long as the engine still holds exactly those (`Placement` and `placed` in the adapter). Circles (`addCircle`, #16) do the same through the adapter's `place` helper; any other new body kind created with a pose or a velocity needs it too.
- **Ghost collisions.** A body sliding fast along a Line can catch the round end where two capsules meet and be thrown off (ADR 0001). Pieces add seams.
- **Continuous collision** is on. Every fast moving body gets it against fixed bodies; that is the milestone 1 tunnelling check. `isBullet` adds it against moving bodies too.
- **Contact buffer.** `contactBuffer` holds 64 entries. `contactCentre` and `trackContacts` read at most 64 contacts of one shape or body. Since #16, `contactCentre` reads the moving side's shape, so the Terrain's ground under a big Rubble pile doesn't overflow it. A rebuilt body buried in more than 64 contacts would still lose track of some in `trackContacts`.
- **Circles roll to a stop.** Box2D has no rolling resistance, so the adapter gives circles an angular damping (`CIRCLE_ANGULAR_DAMPING`, 3 per second); spin damping slows a roll through friction. Glue drag on Rubble (#17) comes on top of it.

## Patterns the slices follow (as of #24)

- **Arena contents are kinds.** Each kind of Arena contents (`CONTEXT.md`) is a module of its own behind the shared `Kind` shape in `src/sandbox/arena-contents.ts`. Today there are two:
  - `Strokes` (`src/sandbox/strokes.ts`): Lines with their Pieces, Objects with their Fills, the undo history, the squeeze, and breaking Objects and Pieces;
  - `Rubble` (`src/sandbox/rubble.ts`, next to `packRubble` and `launchRubble`): the Rubble, the cap and the fading ghosts.

  A kind owns its records and its own ids, which are never reused (not even after R or Clear). It covers its `views`, its part of the snapshot (`save`) and rebuilding from it (`restore`), `clear`, `dropVisuals` (what R drops), `partyOf` (the Party of each of its bodies), `solids` (what new Objects may not overlap), `applySurfaces` (after a table edit) and `step` (its turn in each step). It keeps nothing for what is gone, not even a lookup entry, apart from its ids.
- **One list of kinds.** The Sandbox world holds the kinds in one fixed list, in rebuild order: `Kinds` and `this.kinds` in `sandbox-world.ts`, today Strokes, then Rubble. A new kind is one new module added to that list after its hosts. The snapshot, rebuilding, Clear, Party lookup, the Stroke context, the table re-apply and the step then cover it with no other change. `world.contents` holds every kind's views by kind name (`contents.strokes.lines`, `contents.rubble`); it is only Arena contents, and the renderer doesn't use it.
- **Kinds never call each other.** A kind reports what happened, and the world passes it on. `strokes.break(target)` removes a broken Object or Piece and returns a `Broken`: the Debris to burst, and for an Object its `ReleasedFill` (Colour, mass, local Outline, and the Object's pose and motion as it broke). The world's `breakTarget` bursts the Debris and calls `releaseFill`, which hands the Rubble to `rubble.add`.
- **Step order.** `SandboxWorld.step()` applies table edits, steps physics (`StepReport { hits, begins, ends }`) and Debris, then runs the Material rules (`src/sandbox/material-rules.ts`). It breaks what they return with `breakTarget`, and then gives each kind its turn, in list order. (Rubble's turn ages the fading ghosts.)
- **Fill release.** `releaseFill(fill)` in the world puts out a broken Object's Fill in the same step. Grey and black give Rubble: `packRubble` and `launchRubble` in `src/sandbox/rubble.ts` pack circles inside the Outline and kick them outward (`kickSpeed` per Fill Colour, `kickSpread` shared), and `rubble.add` gives them ids and applies the cap. #18 adds Spills and #19 Blasts in `releaseFill`.
- **Parties.** The Material rules see each body as a Party:
  - a stable `key`: `stroke ${id}` for an Object, `stroke ${lineId} piece ${index}` for a Piece, `rubble ${id}` for a piece of Rubble, `terrain`;
  - for a Piece, also `stroke`: its Line's key;
  - a `target` that takes damage (an Object or a Piece, a `StrokeTarget`), or `null` (Terrain, Rubble);
  - a `sliding` flag.

  `partyOf` in `sandbox-world.ts` checks the Terrain, then asks each kind in turn; each kind keeps a map from its bodies to its records. A body without a Party is ignored by every rule.
- **Breakables** (`ObjectStroke`, `Piece` in `strokes.ts`) carry a `role`, `'outline'` or `'line'`, which picks their Colour's numbers in the table. Pieces have no impact limit.
- **Lines.** A `LineStroke` holds the ordered `Piece`s it has left. Each Piece is its own fixed body, made with `physics.addLine(piece.segments, …)`, so its capsules are in world coordinates. The Line goes with its last Piece.
- **Settled pairs.** Pairs of Parties touching when physics starts are settled: they deal no damage until they have come apart. The snapshot keeps them by key, and `settledPairs()` in the world unions the rules' settled pairs with the pairs touching now (see `64210ef`). After a rebuild, the engine reports every existing contact as beginning again. Anything triggered by a contact beginning (green sticking, a Droplet landing) must skip settled pairs the same way.
- **Damage.** Each target takes only the strongest hit of the step from each Stroke it hit. So an Object landing across two Pieces takes one impact, while each Piece takes its own hit. Each side is checked against its own threshold, and damage is `(impulse − threshold) × damagePerImpulse`.
  - Sliding Parties deal and take no damage.
  - Terrain takes none.
  - A blue Object also counts impacts and breaks on the third.
- **Rubble.** The `Rubble` kind holds it oldest first. Its private `cap()` removes the oldest over `rubbleCap` at once and leaves a body-less fading ghost (`world.fadingRubble`, visual only like Debris, not in `world.contents`). Anything attached to Rubble (a green bond, a Patch) must go when the cap removes it: that is "host gone", which #17 adds.
- **Snapshot.** `takeSnapshot()` keeps `{ contents, random, time, settled }`, where `contents` is each kind's `save()` by kind name. `rebuild()` resets physics, adds the Terrain and calls each kind's `restore` in list order: Strokes in drawing order (each Line's Pieces in order), then Rubble oldest first. That order is replay order: changing it moves Box2D's ids and breaks exact replays. Only Debris and fading ghosts are left out. Space rebuilds from the snapshot it just took; R rebuilds from it and also drops Debris and each kind's visuals.
- **Randomness.** Simulation randomness comes only from `world.random`, whose state is in the snapshot. Kinds don't draw from it themselves: the world draws in a fixed order (`packRubble`, then `launchRubble`, per broken Object, in the order the rules return them) and hands the results on. Debris has its own generator, so visuals never shift the simulation.
- **Rendering.**
  - The renderer reads only views: `world.lines`, `world.objects`, `world.rubble`, `world.fadingRubble`, `world.debrisParticles`, and the ones you add (forward a getter to your kind's views). It never reads the physics module.
  - `world-renderer.ts` redraws a Stroke only when its look key changes.
  - `debug-overlay.ts` (F1) reuses a pool of text labels.
- **Tests.** There are two seams: pure units, and the headless Sandbox world with the helpers in `src/sandbox/test-support.ts`.
  - Tests check what a player would notice, not engine internals.
  - Milestone 1's tests must keep passing unchanged, unless your issue changes what they measure. Say so in the commit message, as #15 did.
  - The gallery replay test (`played` in `src/gallery/gallery.test.ts`) compares `world.contents` with every `id` left out, since what a run makes (Rubble from a broken Fill) gets new ids each time it is played. A new kind is covered without editing it. Another gallery test checks, for every demo, that `world.contents` after R equals `world.contents` at Space, ids included.
  - The Fill release tests (`src/sandbox/fill-release.test.ts`) break grey-outlined boxes on short black Lines, so red exploding (#19, #20) and blue spilling (#18) leave them alone. One test checks that blue, green and red Fills release no Rubble; it stays true when they release Spills and Blasts.

## When you're done

- Check CI on GitHub for your pushed commit, and fix it if it is red.
- Report to the user: what you built, and the decisions you made.
- Suggested skills: `tdd` (test first at the two seams), `diagnosing-bugs` (replays that differ, things breaking at rest), `code-review` (review your diff against the issue and the spec before you commit).
