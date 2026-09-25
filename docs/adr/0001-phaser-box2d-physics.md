# Phaser with Phaser Box2D for physics

The original GDD named Matter.js. We use Phaser for rendering and input and Phaser Box2D (the MIT-licensed JavaScript port of Box2D v3) for physics instead. The game's core case is fast, bouncy Objects hitting thin, hand-drawn Lines. Matter.js has no continuous collision detection, so fast bodies tunnel through thin ones ([liabru/matter-js#5](https://github.com/liabru/matter-js/issues/5)). Box2D prevents tunnelling against fixed bodies.

Box2D v3's chain shape is one-sided, so it only suits Terrain outlines. Lines are built from short capsule segments instead, which collide from both sides and match the piece-by-piece breaking of Lines.

## Considered Options

- **Matter.js**: rejected for tunnelling.
- **Rapier** (`@dimforge/rapier2d-deterministic`): guarantees identical results across machines, but is a heavier WebAssembly setup. It is the fallback if Phaser Box2D fails the milestone 1 stress test (fast balls vs thin Lines, stacked boxes, 100 pebbles; pass criteria in the [milestone 1 spec](../specs/m1-physics-sandbox.md#engine-verdict)).

## Consequences

Identical results across machines is a "keep possible" goal, not a requirement: we use a fixed physics timestep and seeded randomness from day one, and all simulation goes through our own physics module so the engine can be swapped.

## Verdict (milestone 1)

**Phaser Box2D passes all four checks. It stays.**

Measured with `npm run verdict` (headless, seed 2026) on an Intel Xeon @ 2.80 GHz (4 cores, Node 22.22). Physics is deterministic, so checks 1, 2 and 4 come out the same on any machine; step times depend on the machine.

Re-measured in milestone 2, after grey got a little bounce (restitution 0.1) and Objects their Outline-plus-Fill mass, which makes the milestone 1 pebbles hollow shells, the Frozen wake mass-aware and the stress-test boxes keep their mass. The table shows those numbers, on an Intel Xeon @ 2.10 GHz; the milestone 1 figures that changed are in brackets.

| # | Check | Criterion | Measured | Result |
|---|---|---|---|---|
| 1 | Tunnelling | 1000 shots at 3000 px/s at a 4 px Line, random angles: none pass | 1000 fired, 1000 reached the Line, 0 passed. With continuous collision switched off, all 1000 pass, so the check has teeth | Pass |
| 2 | Stacking | 10 drawn boxes settle within 2 s, no visible jitter, standing after 60 s | Settled after 0.63 s (0.65 s); moved at most 0.14 px after that (0.16 px); standing after 62 s | Pass |
| 3 | Performance | 100 pebbles falling into a pile hold ≥ 60 fps on a mid-range laptop in Chrome | Physics step with 100 drawn pebbles: 1.0 ms mean, 5.8 ms p99, 8.7 ms max (7.4 ms p99, 8.5 ms max on the 2.80 GHz machine; a 60 fps frame has 16.7 ms). Held 60 fps on a mid-range laptop in Chrome, checked by hand in milestone 1 | Pass |
| 4 | Stability | No body gains speed from nothing or is flung out of a contact | Pebbles never beat free fall (1050 vs 1208 px/s). Line push-out: 0 of 25 Objects stuck, none faster than gravity plus 233 px/s. Wake-on-hit keeps momentum (after / before = 1.000 from 300 to 3000 px/s) | Pass |

What we learned about Phaser Box2D 1.1.0 along the way (all handled inside `src/physics/`):

- It ships no TypeScript types, and its `main` entry points at a missing file. We import `dist/PhaserBox2D.js` and declare the parts we use in `phaser-box2d.d.ts`.
- `b2DestroyWorld` never frees the world's slot, so a process can only ever create 32 worlds. Milestone 1 recycled worlds instead. Milestone 2's Reset needs a fresh world at every start, because a world whose bodies were removed and rebuilt keeps internal id order that changes how the rebuild plays out, so `npm install` now patches the one line that frees the slot (`scripts/patch-phaser-box2d.mjs`).
- `b2Body_SetType` never moves a fixed body into the simulated set (it tests `b2BodyType.staticBody`, which doesn't exist). Releasing a Frozen Object therefore rebuilds it as a dynamic body.
- `b2Body_GetPosition` and `b2Body_GetRotation` return the body's live transform, which destroying the body can reset. Rebuilding an Object that had slid off a Line from them moved it to the Arena's top-left corner. The push-out numbers above were measured with that bug; after the fix (milestone 2) they come out the same: 0 of 25 stuck, 233 px/s.
- The default minimum bounce speed (`restitutionThreshold`) is 10 m/s, 500 px/s at our scale, so small drops never bounce. The sandbox sets its own.
- Box2D pushes each (capsule, convex part) pair apart on its own. A Line deep inside an Object made of several convex parts, or even inside a single triangle, can jam it on the Line for good (11 of 30 cases in a survey). The Sandbox world therefore slides such an Object the shortest way off the Line at Box2D's push-out speed, then hands it back to physics. Rapier resolves contacts pair by pair too, so switching engines would not remove the need for this.

Two findings were about our Stroke pipeline rather than the engine: drawn boxes only stack once smoothing keeps their corners sharp, and small drawn balls must keep their drawn area.
