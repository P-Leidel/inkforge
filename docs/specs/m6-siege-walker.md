# Spec: Milestone 6, the Siege Walker

**Draft**: decisions taken so far, before the full spec is written. Roadmap step 6 of the [GDD](../gdd.md#15-roadmap). Terms in **bold** are defined in [`CONTEXT.md`](../../CONTEXT.md). Builds on the [milestone 5 spec](m5-defence-loop.md).

## Progress

- [x] **The Enemy body seam** ([ADR 0019](../adr/0019-enemy-bodies-behind-a-shape.md)): the rules ask an `EnemyShape`, not a box. Built before this milestone as a refactor that changes no behaviour; `boxShape` is today's Crawler, Runner and Heavy.
- [x] **Runs hold together by touching** ([ADR 0018](../adr/0018-runs-hold-together-by-touching.md)): a hanging or falling bar cut in two comes apart, which dropping things on the boss leans on.
- [ ] The Siege Walker's shape, numbers and drawing.
- [ ] Tipped, and getting back up.
- [ ] The Push.
- [ ] The boss arena.
- [x] **Waves that list what they send, in order, and Enemy types named once** ([ADR 0020](../adr/0020-a-wave-lists-what-it-sends-in-order.md)), candidate 2 of the [architecture review after #176](../adr/reports/architecture-review-2026-10-03-after-176.html). Built before this milestone as a refactor that changes no behaviour.
- [x] **The Session owns the start of a Level, and the Tutorial is a Level** ([ADR 0022](../adr/0022-the-tutorial-is-a-level.md)), candidate 6 of the same review. The boss Level's start and end have a home: a Level can bring Cards before the Wave they teach, and its end offers what comes next.
- [ ] The exit playtest.

## Decided

### The Siege Walker's body ([ADR 0019](../adr/0019-enemy-bodies-behind-a-shape.md))

- One rigid body that can tip. Its legs are convex parts of it, with no joints; the drawing makes the gait.
- One HP pool; a hit or a Blast counts once. Legs never break off.
- It walks by the capped force of ADR 0010 only while **upright**: standing on something and tilted less than its tip angle.
- Past that it is **Tipped**: it lies helpless and gets back up after a while with a capped torque. What lands on it while it is down hurts as usual.
- It never climbs, and is never a step. It presses and wears what is in its way, at its own rate.
- Touching the Ink Core with any part deals its `coreDamage` (tuned high: close to a loss) and it goes. Wholly below the screen, by its bounds, it dies without letting out its Belly: "pit it".

### The Push

Enemies lined up behind one that presses a wall push it on, and it wears the wall faster.

- A **Push**: the Enemies behind one that presses a Piece or an Object, each pressing into the next (an `isAhead` contact while it walks toward the Ink Core). It doesn't have to be stalled.
- Each Enemy in it adds its type's `push` number (a new column of the enemy table) to the wear dealt at the front: `pressing × (1 + stackWear × Stack + Σ push)`. A Crawler adds a little, a Heavy more, the Siege Walker a great deal: a blocked Siege Walker behind a line of Crawlers makes the front one chew through a wall.
- The wear lands only on what the front Enemy presses; Enemies never wear. An Enemy counts once, however many chains reach it.
- Today's types get `push` too, tuned in the same pass as the boss. It gets its own ADR (0021), and **Push** and **Tipped** go into `CONTEXT.md`, when it is built.

### Adding the Siege Walker as a type

- A row in `ENEMY_TYPES` and its name (`src/materials/enemy-types.ts`), and a row in each record by type the compiler then asks for: the enemy table, the renderer's looks and pop colours, and the sandbox's shapes. It gets a Shift+N key in the sandbox like every type.
- The boss arena's Waves name it where it arrives, with a gap of its own before it if it needs one ([ADR 0020](../adr/0020-a-wave-lists-what-it-sends-in-order.md)). No other Level changes.

### Later: Roguelite Mode

Endless Waves of Enemies in random order use the same Wave format, groups of one. The Defence loop then asks a `WaveSource` for each Wave instead of holding a list (ADR 0020). Not part of this milestone.

## Still to decide

- The Siege Walker's shape (how many legs, how big) and its numbers: HP, mass, walking force, pressing, `push`, `coreDamage`, tip angle, how long it stays down, its righting torque, its Belly and how much it holds.
- The boss arena, and how the Campaign brings it in.
- How the gait is drawn.
- `push` for the Crawler, the Runner and the Heavy.
