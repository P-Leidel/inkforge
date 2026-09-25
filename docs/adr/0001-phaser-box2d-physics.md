# Phaser with Phaser Box2D for physics

The original GDD named Matter.js. We use Phaser for rendering and input and Phaser Box2D (the MIT-licensed JavaScript port of Box2D v3) for physics instead. The game's core case is fast, bouncy Objects hitting thin, hand-drawn Lines. Matter.js has no continuous collision detection, so fast bodies tunnel through thin ones ([liabru/matter-js#5](https://github.com/liabru/matter-js/issues/5)). Box2D prevents tunnelling against fixed bodies.

Box2D v3's chain shape is one-sided, so it only suits Terrain outlines. Lines are built from short capsule segments instead, which collide from both sides and match the piece-by-piece breaking of Lines.

## Considered Options

- **Matter.js**: rejected for tunnelling.
- **Rapier** (`@dimforge/rapier2d-deterministic`): guarantees identical results across machines, but is a heavier WebAssembly setup. It is the fallback if Phaser Box2D fails the milestone 1 stress test (fast balls vs thin Lines, stacked boxes, 100 pebbles; pass criteria in the [milestone 1 spec](../specs/m1-physics-sandbox.md#engine-verdict)).

## Consequences

Identical results across machines is a "keep possible" goal, not a requirement: we use a fixed physics timestep and seeded randomness from day one, and all simulation goes through our own physics module so the engine can be swapped.
