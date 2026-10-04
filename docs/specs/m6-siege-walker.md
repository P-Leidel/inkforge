# Spec: Milestone 6, the Siege Walker

**In progress**: the Siege Walker is a type that walks, presses and dies; Tipped, the Push, its gait and the boss Level are to come. Roadmap step 6 of the [GDD](../gdd.md#15-roadmap). Terms in **bold** are defined in [`CONTEXT.md`](../../CONTEXT.md). Builds on the [milestone 5 spec](m5-defence-loop.md), whose exit playtest ([#138](https://github.com/P-Leidel/inkforge/issues/138)) is still under way; this milestone assumes it passes.

## Progress

- [x] **The Enemy body seam** ([ADR 0019](../adr/0019-enemy-bodies-behind-a-shape.md)): the rules ask an `EnemyShape`, not a box. Built before this milestone as a refactor that changes no behaviour; `boxShape` is today's Crawler, Runner and Heavy.
- [x] **Runs hold together by touching** ([ADR 0018](../adr/0018-runs-hold-together-by-touching.md)): a hanging or falling bar cut in two comes apart, which dropping things on the boss leans on.
- [x] **Waves that list what they send, in order, and Enemy types named once** ([ADR 0020](../adr/0020-a-wave-lists-what-it-sends-in-order.md)), candidate 2 of the [architecture review after #176](../adr/reports/architecture-review-2026-10-03-after-176.html). Built before this milestone as a refactor that changes no behaviour.
- [x] **The Session owns the start of a Level, and the Tutorial is a Level** ([ADR 0022](../adr/0022-the-tutorial-is-a-level.md)), candidate 6 of the same review. The boss Level's start and end have a home: a Level can bring Cards before the Wave they teach, and its end offers what comes next.
- [x] **Objects are a sibling of Lines**, candidate 5 of the same review: `Objects` and `Lines` are each a kind of Arena contents and the only record of what they hold, and `Strokes` keeps only what goes for both. Built before this milestone as a refactor that changes no behaviour, so dropping things on the boss lands on Objects testable on their own.
- [x] **One reading a frame, and one HP bar**, candidate 7 of the same review: the Session builds a `Frame` once a frame and the HUD, the palette and the rewards screen draw from it; every HP bar, the boss's included, is drawn by `drawHpBar` (`src/rendering/hp-bar.ts`), `small` or `large`. Built before this milestone as a refactor that changes no behaviour.
- [x] 0. Rename the walking-force cap `push` to `walkForce` ([#184](https://github.com/P-Leidel/inkforge/issues/184)).
- [x] 1. The Siege Walker as a type ([#185](https://github.com/P-Leidel/inkforge/issues/185)).
- [ ] 2. Tipped, and getting back up ([#186](https://github.com/P-Leidel/inkforge/issues/186)).
- [ ] 3. The Push ([#187](https://github.com/P-Leidel/inkforge/issues/187)).
- [ ] 4. The gait and the boss bar ([#188](https://github.com/P-Leidel/inkforge/issues/188)).
- [x] 5. The boss Level ([#189](https://github.com/P-Leidel/inkforge/issues/189)).
- [ ] 6. The exit playtest: the go/no-go ([#190](https://github.com/P-Leidel/inkforge/issues/190)).

## Problem Statement

After milestone 5, the Campaign is three Levels that teach the Colours one at a time against Crawlers, Runners and Heavies. Every one of those Enemies can be stopped by enough wall: a defence of grey and black, refilled every Intermission, holds or it doesn't. Nothing in the game yet demands what the GDD promises: physics as the answer, rather than raw damage. The Campaign also has no end beyond its third Level, and the GDD's go/no-go test (§16) asks for "a full Campaign run: three arenas plus the boss".

Enemies also only ever wear a wall on their own. A line of them pressed against it is no worse than the one at the front, so a crowd never breaks through faster than a single Enemy does.

## Solution

The **Siege Walker**: a four-legged, top-heavy boss, one rigid body far too heavy to wall off and too tough to wear down. Small hits do nothing to it. It walks only while upright, and once it tilts too far it is **Tipped**: it lies helpless, takes what lands on it as usual, and after a while gets back up with a capped torque that grows with each failed try. So it is beaten by tripping it, dropping things on it and blowing it up.

The **Push**: Enemies lined up behind one that presses a wall push it on, and it wears the wall faster. A Crawler adds a little, a Heavy more, the Siege Walker a great deal.

A fourth Campaign Level, the **boss Level**: three Waves in an Arena shaped for those answers, the Siege Walker in the last, brought in by a Card. Clearing it clears the Campaign.

The milestone answers one question: **can a player beat the Siege Walker with physics, when raw damage alone fails, and does it feel like a boss?** Its exit playtest is also the GDD's go/no-go: a full Campaign run, three Levels plus the boss.

## User Stories

### The Siege Walker

1. As a player, I want a boss that no wall of mine can hold for long, so that I have to find another answer.
2. As a player, I want small hits to do nothing to it and big ones to hurt it, so that I aim for the big ones.
3. As a player, I want to be able to knock it over, so that I can stop it without a wall.
4. As a player, I want a toppled Siege Walker to lie helpless for a while and then get back up, so that knocking it over buys me a window to hurt it.
5. As a player, I want to see its legs walk, stall and flail, so that I can read what it is doing.
6. As a player, I want a large HP bar for it at the top of the screen, so that I can see my answers working.
7. As a player, I want it to cost me most of my Ink Core if it gets through, so that it is the threat of the Level.
8. As a player, I want its death to let out a large Belly, often a big Blast, so that killing it pays off and where I kill it matters.

### The Push

9. As a player, I want Enemies queued behind one at my wall to make it wear through faster, so that a crowd at a wall is a danger and thinning it matters.

### The boss Level

10. As a player, I want the boss Level to unlock when I clear Level 3 and to show in the Level list, so that the Campaign leads to it.
11. As a player, I want two Waves to build up before the boss arrives, so that I can prepare the Arena.
12. As a player, I want a Card before the boss Wave that tells me what kind of answer it needs, without telling me where, so that the puzzle stays mine.
13. As a player, I want "Campaign cleared" after the boss, so that the run ends there.

### Tuning and debugging

14. As a developer, I want to send in a Siege Walker in the sandbox with Shift+4, so that I can try it anywhere.
15. As a developer, I want its numbers in F2 like every type's, and each number's intent written as a headless test, so that tuning by feel can't drift from what it is for.

## Implementation Decisions

### Scope

- Roguelite Mode, procedural Arenas and upgrades are out. Clearing the boss Level says "Campaign cleared" and unlocks nothing new.
- Tuning is in only as far as the boss Level needs, plus the `push` pass on today's types. Levels 1 to 3 are retuned only if the exit playtest shows the Push broke them.
- Every number below is a starting value, tuned with the F2 panel within the reference cases under **Numbers**.

### The walking force is `walkForce`

- The enemy table's `push` today is the cap on an Enemy's walking force in multiples of its weight ([ADR 0010](../adr/0010-enemies-walk-by-capped-force.md)). It is renamed `walkForce`, so `push` can mean the **Push**. A refactor that changes no behaviour; F2's Copy as JSON key changes with it.

### The Siege Walker's body ([ADR 0019](../adr/0019-enemy-bodies-behind-a-shape.md))

- One rigid body that can tip, its own `EnemyShape`: a hull with four legs as convex parts of it, with no joints. The drawing makes the gait.
- Size: a hull about 220 wide by 110 tall on legs about 90 tall, about 200 high in all; outer foot to outer foot about 180. Its footprint is narrower than it is tall, so its centre of mass is high and it can be tipped. Low things pass under its hull, between its legs.
- One HP pool; a hit or a Blast counts once. Legs never break off.
- It walks by the capped force of ADR 0010 only while **upright**: standing on something and tilted less than its tip angle.
- It never climbs, and is never a step. It presses and wears what is in its way, at its own rate.
- Touching the Ink Core with any part deals its `coreDamage` and it goes. The Wave goes on as usual: escorts can still finish the Ink Core.
- Wholly below the screen, by its bounds, it dies without letting out its Belly. No Arena of this milestone has a Pit, but the rule stands.
- One damage rule for every Enemy: being beaten with physics comes from a high `damageThreshold`, not from a special immunity. Pebbles, grey walls and light drops do nothing; a dropped black Object, a red Blast or its own fall off a slope hurt it.

### Tipped, and getting back up

- **Tipped**: tilted past its tip angle. It doesn't walk and presses nothing.
- In the air but level, it is not upright, so it doesn't walk, but it isn't Tipped either: no timer starts.
- Getting up: after a delay, a torque toward upright, the short way round, capped. If it doesn't get up, each later try raises the cap. Weight on it delays it, more weight longer, but it always gets up in the end. So the Wave never locks, and the player never wins just by pinning it. Upside down it does the same.
- Tipping does no damage of its own; the impact counts by the usual rule. Tipping over on flat ground shouldn't pass the threshold, tipping down a slope should.
- What lands on it while it is down hurts as usual.
- ADR 0023 records why the torque grows, rather than a fixed cap or a death timer. **Tipped** goes into `CONTEXT.md`.

### The Push

- A **Push**: the Enemies behind one that presses a Piece or an Object, each pressing into the next (an `isAhead` contact while it walks toward the Ink Core). The front Enemy doesn't have to be stalled.
- Each Enemy in it adds its type's `push` to the wear dealt at the front: `pressing × (1 + stackWear × Stack + Σ push)`.
- The wear lands only on what the front Enemy presses; Enemies never wear. An Enemy counts once, however many chains reach it. A Tipped Siege Walker pushes nothing.
- Starting values: Crawler 0.2, Runner 0.1, Heavy 0.6, Siege Walker 4. Small for today's types, so Levels 1 to 3 change little; the exit playtest checks it.
- ADR 0021 records it, and **Push** goes into `CONTEXT.md`.

### Numbers

Each number's intent is a headless reference case. The starting values are set so the cases pass; tuning by feel moves them only within the cases.

| Number | Start | Reference case |
|---|---|---|
| Size | hull 220×110, 4 legs 20×90, footprint 180 | fits through no gap of the boss Arena; tips at shin height |
| `density` | 1 (about 20 Crawlers) | shoves a free black Object of about 80 px; can't shove a Frozen one |
| `walkingSpeed` | 30 px/s | crosses an open Arena in about 50 s |
| `walkForce` | 2 weights | walks up a 30° slope |
| `climb` | 0 | never climbs |
| `pressing` | 4000 /s | wears through a black Line in a few seconds, grey almost at once |
| `push` | 4 | four Crawlers behind it roughly double a Crawler's wear |
| `damageThreshold` | the impulse of a 60 px grey box dropped 300 px onto it | that does nothing; a 100 px black box dropped 400 px does |
| `hp` | about 3.5 × the damage of that black drop | three or four good answers kill it |
| `coreDamage` | 8, of the Ink Core's 10 | close to a loss |
| tip angle | 40° | a shin-high bar under its front legs while something pushes its hull tips it; a 10° bump doesn't |
| getting-up delay | 4 s | |
| righting torque | first try lifts its own weight from lying on its side; +50% each failed try | a black box on it delays it, never stops it |
| Drop | about 3 × a Heavy's | |
| Belly | about 4 × a Heavy's ink; weights red 5, black 3, grey 1, blue 1, green 1 | most kills end in a large Blast |

### Adding the Siege Walker as a type

- A row in `ENEMY_TYPES` and its name (`src/materials/enemy-types.ts`), and a row in each record by type the compiler then asks for: the enemy table, the renderer's looks and pop colours, and the sandbox's shapes. Shift+4 sends one in the sandbox.
- No Level but the boss Level sends it.

### Looks

- **The gait** is drawn only: the renderer swings the legs in pairs at a rate tied to its speed over the ground, stands them still when it stalls, and flails them while it is Tipped. The colliders stay in the standing pose.
- **The boss bar**: a `large` HP bar, top-centre, labelled "Siege Walker", from when it is sent in until it dies or goes. No small bar over its body.
- Placeholder art otherwise, its Belly shown as on every Enemy.

### The boss Level

A plain `Level` in `src/levels/`, the Campaign's fourth, "Level 4 · Siege Walker". Its Arena sketch is rough; its slice turns it into Terrain, tuned by playing it in the browser.

- **Arena.** A Spawn lane of at least 320 px on the left, so the Siege Walker is sent in wholly out of view. A long flat approach for building. An **overhang** above the middle of the path to hang Frozen black Objects from. A **crest** with a short, steep down-slope behind it, where the Siege Walker is top-heavy and easy to tip: its signature. The Ink Core on a low plateau at the end of a gentle ramp.
- **No step anywhere on its path.** It never climbs and Terrain never breaks, so a step would stall it forever: only slopes it can walk, 30° at most.
- **No Pit.** A Pit wide enough to swallow the Siege Walker swallows every Enemy that reaches it.
- **Colours and Tanks.** All five Colours at today's Tank maximums, as in Level 3. If the playtest shows it needs more red or black, those two are raised for this Level only.
- **Waves:**

  | Wave | Sends, in order (gap before each) |
  |---|---|
  | 1 | 6 Crawlers and Runners, mixed (2.5 s) |
  | 2 | 8 Crawlers, Runners and 2 Heavies, mixed (2.5 s) |
  | 3 | 3 Crawlers (2 s), the **Siege Walker** (3 s), 3 Crawlers (1.5 s), 2 Heavies (3 s) |

  The Crawlers close behind the Siege Walker make a Push of it; the Heavies come late to shove it on or to finish the Ink Core after it. Tuned in the slice by playing it.
- **Card**, before Wave 3: *"The Siege Walker. Too heavy to wall off, too tough to wear down. It's top-heavy: trip it, drop things on it, blow it up. Once it's down, it's helpless for a while."*
- **Analysis** hint, as for every new type: *"New: the Siege Walker. Knock it over."*

### Campaign flow

- The Level list shows four Levels. Level 4 unlocks when Level 3 is cleared and is saved like the others.
- "Campaign cleared" moves from after Level 3 to after Level 4; Level 3's cleared panel offers **Next Level**.

### Modules

- **Enemy types and enemy table.** The Siege Walker's row; `walkForce`; the `push` column.
- **Enemy shapes** (ADR 0019). The Siege Walker's hull and legs as one `EnemyShape`.
- **Enemy rules.** Upright and Tipped, getting up with growing torque, and the Push. Headless.
- **Renderer.** The gait, flailing, and the boss bar through `drawHpBar`.
- **Levels and Campaign.** `level-4.ts` and the Campaign's fourth entry.

### Exit criteria

Milestone 6 is done when all three hold:

1. **Feature-complete** as specified here.
2. **The go/no-go.** A playtester new to the game plays the full Campaign with F2 untouched. They beat the boss Level within 3 tries using at least one physics answer (a tip, a drop or a Blast), and a defence of walls alone visibly fails against the Siege Walker. The run is judged on GDD §16: the Colours are clearly distinct, the economy stops any single answer being spammed, and the Enemies demand different answers. One of the milestone 5 playtesters also plays the boss Level and replays Levels 1 to 3, to check the Push didn't break them. If no fresh playtester can be found, the milestone 5 playtesters play the full run, and the result says the go/no-go was judged by players who had seen the game before.
3. **Performance.** The boss Level's Wave 3 against a full defence averages at least 60 fps on the baseline machine (see the README) with no frame over 33 ms.

### Delivery order

Vertical slices, one GitHub issue each, linking to this spec. Each slice extends R, Clear and the demos to what it adds, and updates the README's controls table when it adds a control.

0. **Rename `push` to `walkForce`.** No change in behaviour.
1. **The Siege Walker as a type.** Its `EnemyShape`, its row in every record by type, its numbers and their reference cases, Shift+4 in the sandbox. It walks while upright, presses, dies and goes; no Tipped yet.
2. **Tipped, and getting back up.** The upright check, Tipped, the delay and the growing torque; ADR 0023; **Tipped** in `CONTEXT.md`.
3. **The Push.** Chains, the formula, `push` for every type; ADR 0021; **Push** in `CONTEXT.md`.
4. **The gait and the boss bar.**
5. **The boss Level.** Arena, Waves, Tanks, Card, Analysis hint, the Campaign's fourth entry, "Campaign cleared" moved.
6. **The go/no-go and frame rate** (for a person, not an agent).

0 comes first. 2 and 3 follow 1 and can run in parallel; 4 follows 2. 5 follows 1 and can start alongside 2, but its tuning needs 2 and 3. 6 comes last.

## Testing Decisions

- As before, a good test drives a module through its public commands and checks outcomes the player would notice: "a Siege Walker pressed at its hull over a bar tips", "four Crawlers behind it wear the wall faster". Tests don't inspect internal stages or engine objects.
- **Seam 1: pure units.** Push chains: each Enemy counted once, chains that branch, a chain broken by a gap, a Tipped Siege Walker in it. The wear formula. The growing-torque schedule.
- **Seam 2: the headless Sandbox world.** The reference cases under **Numbers**. It tips past its tip angle and not on a 10° bump; it gets up on flat ground; a black box on it delays it but doesn't stop it; it never climbs; below the screen it dies with no Belly; touching the Ink Core deals its `coreDamage` and it goes.
- **Seam 3: the Levels and the Campaign.** The boss Level loads and is one screen, has every Colour, and a Siege Walker sent in with no defence reaches the Ink Core: no step on its path. The Campaign has four Levels, Level 4 unlocks when Level 3 is cleared, and "Campaign cleared" follows Level 4.
- **Unchanged:** the gallery replay tests, the render budget test and `npm run verdict` pass as they are after slice 0; after slice 3, any replay the Push changes is re-recorded in that slice, with the reason in its commit.
- **Browser only.** The gait, the boss bar, the feel of the boss Level, the playtest and the frame rate.

## Out of Scope

- Roguelite Mode, upgrades and procedural Arenas.
- Pits in the boss Arena.
- Joints and legs that move as bodies, or break off.
- Final art.

## Later

- **Pits.** A Pit on the only lane kills everything that reaches it. Later Arenas will have a Pit with a bridge over it that the player must break to use it. That Arena has to answer what happens when the bridge is broken early: today every Enemy, the Siege Walker included, would then walk in.
- **Roguelite Mode.** Endless Waves of Enemies in random order use the same Wave format, groups of one. The Defence loop then asks a `WaveSource` for each Wave instead of holding a list (ADR 0020).

## Further Notes

Decided while writing this spec:

- The milestone's question is whether physics beats the boss when raw damage doesn't; its exit playtest is also the GDD's go/no-go.
- The walking-force cap is renamed `walkForce` so **Push** has one meaning in the code and the glossary.
- Physics over damage comes from a high `damageThreshold` and HP sized for three or four good answers, not from immunity to some sources.
- Four legs on a footprint narrower than it is tall, so it can be tripped; the gait is drawn, not simulated.
- A Tipped Siege Walker gets up with a torque that grows each try, so pinning it buys time but never locks the Wave.
- "Pit it" is dropped from this Arena: no Pit on a single lane can take the Siege Walker without taking everything.
- The boss Level has three Waves, escorts around the Siege Walker in the last, at today's Tank maximums.
