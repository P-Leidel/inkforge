# Spec: Milestone 1, physics sandbox

Roadmap step 1 of the [GDD](../gdd.md#15-roadmap). Terms in **bold** are defined in [`CONTEXT.md`](../../CONTEXT.md).

## Problem Statement

The whole game rests on one unproven promise: that a hand-drawn Stroke turns into a physics body that behaves the way the player expects. Fast things must not pass through thin **Lines**, drawn boxes must stack without jittering, many small **Objects** must not tank the frame rate, and odd drawings (tiny, self-crossing, spiky, concave) must not produce bodies that explode. Until that works, nothing built on top of it (Colours, ink, enemies) can be judged, and we don't yet know whether Phaser Box2D is the right engine ([ADR 0001](../adr/0001-phaser-box2d-physics.md)).

## Solution

A playable browser sandbox with one neutral material. The player draws on a fixed Arena with Terrain: open Strokes become fixed Lines, closed Strokes become Frozen Objects with exactly the drawn shape. Space toggles between paused (stands in for the **Build Phase**) and running physics (stands in for the **Wave**). Buttons launch three stress-test scenes whose results decide the physics engine. Every build is deployed to GitHub Pages so it can be played without cloning.

## User Stories

### Drawing Lines

1. As a player, I want to hold the left mouse button and drag to draw a Stroke, so that drawing feels like drawing.
2. As a player, I want to see my Stroke as I draw it, so that I know what I'm about to create.
3. As a player, I want an open Stroke to become a Line when I release the button, so that I can build walls and ramps.
4. As a player, I want a Line to stay exactly where I drew it, even in mid-air, so that I can place ramps and platforms anywhere ([ADR 0002](../adr/0002-lines-stay-fixed.md)).
5. As a player, I want a Line to look exactly as thick as it collides, so that I can judge gaps and hits by eye.
6. As a player, I want things to collide with a Line from both sides, so that a Line works as a wall whichever way I drew it.
7. As a player, I want a Line drawn into Terrain to be cut at the Terrain surface, so that Lines never sit inside the ground.
8. As a player, I want Lines to cross each other freely, so that I can layer and patch structures.
9. As a player, I want a very short Stroke (a mis-click) to be ignored silently, so that accidental clicks don't litter the Arena.
10. As a player, I want my shaky hand smoothed out, so that Lines come out clean without me drawing perfectly.
11. As a player, I want a Line drawn through an Object to shove that Object out of the way when physics runs, so that I can use Lines to push things around.

### Drawing Objects

12. As a player, I want a Stroke whose end returns near its start to become an Object, so that I can draw balls, boxes and other movable shapes.
13. As a player, I want a marker to show when my pointer is close enough to the start to close the shape, so that I know whether I'm drawing a Line or an Object.
14. As a player, I want a short scribble not to snap shut by accident, so that tiny Lines don't turn into Objects.
15. As a player, I want an Object to have exactly the shape I drew, so that circles roll, boxes stack and triangles tip.
16. As a player, I want concave shapes such as an "L" or a star to behave as that shape, so that I'm not limited to simple forms.
17. As a player, I want an Object to collide as a solid shape, so that closed shapes behave predictably.
18. As a player, I want a new Object to hang Frozen where I drew it with a visible pinned look, so that I can place it precisely and choose when it drops ([ADR 0004](../adr/0004-objects-start-frozen.md)).
19. As a player, I want a Frozen Object to wake up when a moving body hits it hard enough, so that my traps spring when something runs into them.
20. As a player, I want gentle resting contact not to wake a Frozen Object, so that Objects don't drop by accident.
21. As a player, I want two Frozen Objects touching each other to stay Frozen, so that I can build hanging structures from several Objects.
22. As a player, I want the collision that wakes a Frozen Object to play out naturally, so that a ball knocking a Frozen box sends both moving as if the box had been hanging there.
23. As a player, I want to right-click a Frozen Object while physics is running to Release it, so that I can drop things at the right moment.
24. As a player, I want a Frozen Object that a Line crosses to be Released as soon as physics starts, so that my deliberate shove happens right away.
25. As a player, I want to draw an Object over an existing Line, so that draw order doesn't matter for shoving.
26. As a player, I want an Object that would overlap Terrain or another Object to show red and be refused, so that I never create bodies stuck inside each other.

### Rejections

27. As a player, I want an Object smaller than 20 × 20 px² to be rejected with "Too small", so that I don't create bodies too small to simulate.
28. As a player, I want a closed Stroke that crosses itself to be rejected with "Shape crosses itself", so that I understand why nothing appeared.
29. As a player, I want a rejected Stroke to flash red and fade out with a short message at the pointer, so that rejection is clear but not disruptive.
30. As a player, I want thin spikes and overly detailed Strokes to be simplified silently rather than rejected, so that I'm only told about problems I can fix.

### Sandbox controls

31. As a player, I want Space to toggle between paused and running physics, so that I can build and then watch it play out.
32. As a player, I want to draw both while paused and while running, so that I can test drawing into a moving scene.
33. As a player, I want Ctrl+Z to undo my last Stroke, so that I can fix mistakes quickly.
34. As a player, I want a Clear button that removes all my Strokes, so that I can start over.
35. As a player, I want the Arena to scale to fit my window while keeping its 1920 × 1080 layout, so that it plays the same at any window size.
36. As a player, I want an Arena with flat ground, a wall at each side, a slope and a pit, so that I can try my drawings against typical Terrain.

### Stress tests and debugging

37. As a developer, I want F1 to toggle a debug overlay showing colliders, body count and fps, so that I can see what the physics engine sees.
38. As a developer, I want a ball-cannon button that fires fast balls at a thin Line, so that I can see tunnelling happen or not.
39. As a developer, I want a box-tower button that builds a tower of 10 drawn boxes, so that I can judge stacking stability.
40. As a developer, I want a pebble button that drops 100 small Objects, so that I can judge performance.
41. As a developer, I want the stress tests to build their bodies through the same Stroke pipeline as the player, so that the tests measure what players will actually get.
42. As a developer, I want the tunnelling test to run headless in the test suite, so that the engine verdict can be checked without a browser.
43. As a developer, I want the physics engine hidden behind our own module, so that we can switch to Rapier if Phaser Box2D fails.
44. As a developer, I want a fixed 60 Hz physics step and a seeded random generator, so that runs are repeatable.

### Tooling

45. As a developer, I want lint, typecheck and tests to run in CI on every push, so that broken builds are caught at once.
46. As a playtester, I want every build on the main line deployed to GitHub Pages, so that I can play the latest version in the browser.

## Implementation Decisions

### Stack

- TypeScript, Vite, Phaser for rendering and input, Phaser Box2D for physics ([ADR 0001](../adr/0001-phaser-box2d-physics.md)).
- One neutral material only: no Colours, no ink, no enemies, no Ink Core.

### Modules

- **Stroke pipeline** (pure, no engine or Phaser dependency). Input: the raw pointer samples of one Stroke plus a read-only view of what already exists (Terrain, Lines, Objects). Output: exactly one of
  - a Line: an ordered list of segments after cutting at Terrain,
  - an Object: an outline polygon plus its convex pieces,
  - a rejection with a reason (`too-small`, `self-crossing`, `overlaps`) for display,
  - nothing (silently dropped).

  Stages: sampling → smoothing → simplification → close detection → geometry validation → collider description.
- **Physics module** (the only code that talks to the engine). Creates and removes Line and Object bodies from collider descriptions, steps the world at a fixed 60 Hz, reports contacts with impact strength, and exposes body positions for rendering. Frozen state lives here. Its interface is engine-neutral so Rapier can be dropped in.
- **Sandbox world** (headless). Owns the Arena, the list of Strokes, the pause state and undo. Its commands: submit a Stroke, undo, clear, toggle pause, Release at a point, step. This is the main testing seam and has no rendering dependency.
- **Phaser scene** (thin). Turns pointer and keyboard input into Sandbox world commands and draws the world's state: Strokes in progress, the close marker, Frozen look, rejection flashes, the debug overlay, and the stress-test buttons.
- **Stress-test scenes.** Scripted setups that submit Strokes through the Sandbox world, plus the measurements for the engine verdict.

### Geometry rules

- **Close detection.** A Stroke closes when its end is within 24 px of its start and the Stroke is at least 72 px long (three times the snap radius). The marker shows while the pointer is inside the snap radius and the length condition holds.
- **Minimums.** An Object under 20 × 20 px² of area is rejected (`too-small`). A Line shorter than 16 px is dropped silently.
- **Self-crossing.** A closed Stroke that crosses itself is rejected (`self-crossing`).
- **Simplification.** Smoothing removes hand jitter, and simplification caps point count. Spikes thinner than the Line thickness are flattened. None of this rejects anything.
- **Concave Objects** are split into convex pieces that together form one rigid body. Box2D polygons are convex and have at most 8 vertices, so the split must also respect that limit.
- **Solid collision.** Objects collide as solid shapes. Being unfilled makes an Object light, not hollow in the collision sense.

### Lines

- A Line is a row of short capsule segments, one fixed thickness of 8 px, drawn exactly as thick as it collides. Capsules collide from both sides. Box2D v3's chain shape is one-sided and is not used for Lines. Segmenting also prepares for milestone 2, where Lines break piece by piece.
- Lines are fixed (static) bodies.
- A Line running into Terrain is cut at the Terrain surface. A Line crossing an Object is **not** cut: the overlap stays, and physics squeezes the Object out once it runs. Box2D caps the push-out speed, so the Object slides out rather than being launched.

### Objects and overlap

- An Object may overlap Lines. It may not overlap Terrain or other Objects. (In later milestones, enemies and the Ink Core are added to the forbidden list.) A refused Object shows red while drawing and is rejected (`overlaps`) on release.
- Density is uniform for the neutral material. Colour-dependent mass comes in milestone 2.

### Frozen state

- Every new Object starts Frozen: it takes part in collisions but ignores gravity and doesn't move.
- A Frozen Object wakes when a **moving** body hits it with an impact above a small threshold (tuned in the sandbox). Resting contact and contact with Lines, Terrain or other Frozen Objects never wake it.
- The collision that wakes it plays out as a normal collision: the hitting body's momentum is shared as if the Object had been free.
- When physics starts running, every Frozen Object overlapped by a Line is Released, so the push-out can happen.
- Right-click on a Frozen Object Releases it, but only while physics is running.

### Sandbox controls

- Space toggles pause and play. Drawing works in both states. Ctrl+Z undoes the last Stroke in both states; a Clear button removes all Strokes.
- The Arena has a fixed 1920 × 1080 logical size, scaled to fit the window. Terrain: flat ground, a left and a right wall, one slope and one pit.
- F1 toggles the debug overlay: colliders, body count, fps.
- The physics step is fixed at 60 Hz; all randomness comes from a seeded generator.

### Engine verdict

Phaser Box2D passes only if all four hold:

1. **Tunnelling.** A ball fired at 3000 px/s at a 4 px thick Line never passes through it, over 1000 shots at random angles. (This one test uses a thinner Line than the 8 px default, to leave a margin.)
2. **Stacking.** A tower of 10 drawn boxes settles within 2 s with no visible jitter and stays standing for 60 s.
3. **Performance.** 100 pebbles falling into a pile hold ≥ 60 fps on a mid-range laptop in Chrome.
4. **Stability.** No body gains speed from nothing or is flung out of a contact.

If any check fails, the physics module is switched to Rapier (`@dimforge/rapier2d-deterministic`) within this milestone, and the milestone is done only when one engine passes. The verdict is recorded in ADR 0001.

### Delivery order

Vertical slices, one GitHub issue each, linking to this spec:

1. Project skeleton and CI (including GitHub Pages deploy).
2. Arena and Terrain.
3. Line drawing end to end.
4. Object drawing end to end, with the Frozen state.
5. Rejections and the overlap rules.
6. Stress-test scenes and the engine verdict.

## Testing Decisions

- A good test drives a module through its public commands and checks outcomes the player would notice: "this Stroke became an Object with this shape", "this ball did not pass the Line", "this Object is still Frozen". Tests don't inspect internal stages, point counts or engine objects.
- **Seam 1: the Stroke pipeline.** Pure input → output. Unit tests (Vitest) cover close detection including the length condition, minimums, self-crossing, smoothing and spike flattening (by the shape of the result), concave splitting (the pieces cover the outline and each is convex with ≤ 8 vertices), and cutting at Terrain.
- **Seam 2: the headless Sandbox world.** Integration tests that submit Strokes and step the world: Lines stay fixed, Objects start Frozen, a hit wakes a Frozen Object and resting contact doesn't, Frozen-on-Frozen stays Frozen, Release only works while running, Line-over-Object is Released and squeezed out at play, overlap refusal, undo and clear. The headless tunnelling test (1000 seeded shots) runs here.
- The stacking, performance and stability checks are judged by running the stress-test scenes in the browser; they are not CI tests, because they depend on hardware and on watching for jitter.
- There is no prior art in the codebase yet; these tests set it.
- CI runs lint, typecheck and all tests on every push.

## Out of Scope

- Colours, Outline and Fill, Spills, explosions and breaking (milestone 2).
- Ink Tanks, costs, overlap charging, Locked and Wave Ink, drops (milestone 3).
- Enemies, the Ink Core and the Core Zone (milestone 4).
- The real Build Phase / Wave / Aftermath loop, re-freezing after a Wave, and real arenas (milestone 5).
- Joints of any kind ([ADR 0003](../adr/0003-no-joints-in-mvp.md)).
- Mobile and touch input.

## Further Notes

- Decided for milestone 3 while writing this spec: the rule "ink is only charged for parts of a Stroke that don't overlap existing ink" applies only where a Line lies on another Line. Where a Line crosses an Object it costs full price. Recorded in the GDD, section 10.
- The Frozen wake-up threshold is the one number left to tune by feel in the sandbox.
