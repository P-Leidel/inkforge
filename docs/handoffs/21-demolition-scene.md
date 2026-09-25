# Handoff: #21 Demolition scene

Issue: https://github.com/P-Leidel/inkforge/issues/21 (slice 12 of 13; blocked by #20). Read [README.md](README.md) first: it has the working agreement, the checks and the engine facts every slice needs.

A worst-case scene for performance: a chain of red bombs tearing through filled boxes, Spills and a wall of mixed-Colour Lines in quick succession. It's built through the Sandbox world, like milestone 1's stress tests. Your part is the scene, a headless check that the chain plays out, and physics timings. A person reads the frame rate on a real laptop in #22.

## Read first

- In the spec: [Performance and exit criteria](../specs/m2-colours.md#performance-and-exit-criteria), and in [Testing Decisions](../specs/m2-colours.md#testing-decisions) "the Demolition chain plays out".
- [ADR 0001](../adr/0001-phaser-box2d-physics.md): the verdict section and its table.
- `scripts/engine-verdict.ts`, `src/stress-tests/` and `src/gallery/gallery.ts`.
- The commits of #16–#20. The scene uses everything they built.

## What already exists

- **Gallery demos** are `Demo { name, build(world) }` objects in `src/gallery/gallery.ts`, listed in `GALLERY` and shown as a row of buttons by `SandboxScene` (`loadDemo` clears the Arena and builds the demo). `letGo()` starts physics and lets Objects go before the snapshot, so R and Space replay a demo.
- **`npm run verdict`** runs the milestone 1 checks headless. `pebbles()` shows how it times physics steps with `performance.now()` and prints the mean, p99 and max.
- **The F1 overlay** (`src/rendering/debug-overlay.ts`) prints fps (`game.loop.actualFps`) and the body count.

## Suggested design (a proposal)

**The scene.** Build it as a Demolition demo in the gallery (the issue asks for a gallery button), through the Sandbox world, with:

- **a chain of 5 red bombs,** spaced so each Blast sets off the next. The chain rule from #19 depends only on distance and strength.
- **3 grey-filled boxes and 1 black-filled box,** big enough that each releases the maximum Rubble: 3 × 18 + 8 = 62, "about 60". Check the Rubble cap of 150 isn't hit.
- **one blue- and one green-filled Object** that the chain breaks: 10–15 Droplets each, "about 30".
- **a wall of mixed-Colour Lines** in the Blasts' way.
- **a trigger,** e.g. the first bomb dropped from a height, or a ball Released at it.

Don't make the boxes red: the scene has exactly 5 Blasts. The boxes break from Blasts, from Rubble, or from falls after a Blast wakes them. Tune the layout until the chain reliably plays out.

**Headless test.** The chain plays out: all 5 Blasts go off, about 60 Rubble and about 30 Droplets.

- Count distinct ids seen in the views each step (Blasts, Rubble, Droplets), since Droplets turn into Patches within a step or two.
- Use tolerances that match "about".
- The gallery replay test also covers the new demo.

**Verdict.** Add a Demolition section to `scripts/engine-verdict.ts`: build the scene headless (seed 2026, like the rest), step through the chain, and print the physics step times (mean, p99, max) next to the milestone 1 numbers, in the same style. Recording the numbers in ADR 0001's table is a nice extra. The frame rate itself is #22's.

**F1 overlay.** While the Demolition demo runs, show the average fps and the longest frame time since the scene started, so "no frame over 33 ms" can be read in the browser.

- Feed the frame times from `SandboxScene.update(time, delta)`.
- Start counting when the demo is loaded. Start again on R, so a replay is measured on its own.
- Average fps = frames ÷ elapsed seconds.

**README.** Mention the Demolition button and what the overlay shows while it runs.

## Watch out for

- **Headless step times.** If p99 is over 16.7 ms (a 60 fps frame), look at what #16–#20 do per step before blaming the engine:
  - Blast queries over all bodies;
  - the glue drag loop;
  - Rubble piles and the 64-entry contact buffer;
  - Patch bookkeeping.

  Report what you find either way.
- **Replay.** The chain must play the same after R and Space (the gallery replay test).
- **Last slice.** This is the last agent slice. When you close #21, delete `docs/handoffs/` entirely (this file and the README) and the "Milestone 2 handoffs" section in `CLAUDE.md`. #22 is for a person.

## Tests (from the issue)

- Headless: the chain plays out, with 5 Blasts, about 60 Rubble and about 30 Droplets.
- The gallery tests (builds, replays) for the new demo.
- Worth adding: a unit test for the frame-time tracker (average fps, longest frame, restarting).
