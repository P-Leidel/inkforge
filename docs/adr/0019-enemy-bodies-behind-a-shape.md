# Enemies have a shape the rules ask; the Siege Walker is one rigid body that can tip

Status: Accepted. Keeps [ADR 0010](0010-enemies-walk-by-capped-force.md), [ADR 0011](0011-enemies-climb-by-capped-force.md) and [ADR 0013](0013-enemies-climb-low-walls.md) as they are.

Every Enemy so far is one upright box, and about 30 places in seven files read that box: the Enemy rules put its feet at `y + height / 2` and the room it climbs into `width` ahead, the Arena query tests one convex polygon, spawning stacks boxes, and the HP bar spans `width`. The Siege Walker, milestone 6's boss, is "a multi-legged heavy enemy, beaten with physics (trip it, pit it, drop things on it, blow it up)" ([GDD §9](../gdd.md#9-enemies)). It has nothing to plug into.

**The Siege Walker is one rigid body that can tip.** Its legs are convex parts of that body, with no joints ([ADR 0003](0003-no-joints-in-mvp.md)): the renderer can make the gait look like walking while the physics stays rigid. It is not kept upright, so a leg over a Pit, or caught on what is in its way, tips it. We rejected a trunk and legs joined by joints, because joints between bodies are a new class of problem (snapshots, a change of form, exact replays), and a box with legs only drawn, because it can't be tripped.

**Every Enemy has one HP pool, and a hit or a Blast counts once per Enemy.** Its legs never break off on their own. Tripping comes from physics, not from wearing a leg away. Breakable legs would mean a body changing form in a fight, as Lines do; they fit the same seam later if playtests ask for them.

**An Enemy walks only while it is upright.** It walks by the same capped force (ADR 0010) while it stands on something and is tilted less than its tip angle; past that it is **Tipped**, lies helpless, and gets back up after a while with a capped torque. Whatever lands on it while it is down hurts as usual. A box is kept upright by the engine, so it is never Tipped.

**The Siege Walker never climbs, and is never a step.** It presses and wears what is in its way, at its own rate. Climbing stays what boxes do (ADR 0011, ADR 0013).

**At the Ink Core and at a Pit, the usual rules hold.** Any part of it touching the Ink Core deals its `coreDamage` and it goes; wholly below the screen, measured by its bounds, it dies without letting out its Belly.

So the rules no longer read a box. Each Enemy carries an **`EnemyShape`** (`src/sandbox/enemy-shape.ts`), which answers what they ask, wherever the body is:

| Asks | Who asks |
|---|---|
| `parts`, `outline` | The Arena query (`Form 'enemy'`, posed with the body's full transform, rotation included), the drawing, the pop |
| `staysUpright` | Arena bodies, which keep a box from turning |
| `bounds(at)` | Spawning, the HP bar, below the screen |
| `feet(at)` | Standing and climbing |
| `upright(at)` | Walking: a Tipped Enemy doesn't walk |
| `climb` (`height`, `top(at)`, `roomAhead(at, heading, feet)`) | Climbing, only for a shape that climbs |

`boxShape(width, height)` is the Crawler's, the Runner's and the Heavy's shape, unchanged; the Siege Walker's is milestone 6's. Contacts, normals, the walking force and the time a Tipped Enemy stays down stay with the Enemy rules: the shape answers questions of geometry only. The seam was built before milestone 6 as a refactor that changes no behaviour, with the rules tested through a fake legged shape as the second adapter until the Siege Walker arrives.

The **Push** (Enemies lined up behind one that presses a wall add to the wear it deals) was decided with this and is part of the [milestone 6 spec](../specs/m6-siege-walker.md); it gets its own ADR when it is built.
