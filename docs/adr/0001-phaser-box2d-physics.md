# Phaser with Phaser Box2D for physics

The original GDD named Matter.js. We use Phaser for rendering and input and Phaser Box2D (the MIT-licensed JavaScript port of Box2D v3) for physics instead. The game's core case is fast, bouncy Objects hitting thin, hand-drawn Lines. Matter.js has no continuous collision detection, so fast bodies tunnel through thin ones ([liabru/matter-js#5](https://github.com/liabru/matter-js/issues/5)). Box2D prevents tunnelling against fixed bodies and has a built-in shape type for drawn lines.

## Considered Options

- **Matter.js**: rejected for tunnelling.
- **Rapier** (`@dimforge/rapier2d-deterministic`): guarantees identical results across machines, but is a heavier WebAssembly setup. It is the fallback if Phaser Box2D fails the milestone 1 stress test (fast balls vs thin Lines, stacked boxes, 100 pebbles).

## Consequences

Identical results across machines is a "keep possible" goal, not a requirement: we use a fixed physics timestep and seeded randomness from day one, and all simulation goes through our own physics module so the engine can be swapped.
