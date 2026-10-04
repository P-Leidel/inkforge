# A Wave lists what it sends, in order

Status: Accepted.

A Wave used to be a count for every Enemy type, `counts: { crawler, runner, heavy }`, and the Enemies arrived in the order the type list had: every Crawler, then every Runner, then every Heavy, one Wave `gap` apart. Adding the Siege Walker would have put a `'siege-walker': 0` in every Wave of every Level, sent the boss always last, and given a Level no way to pause before it walks in. And Roguelite Mode, after the Campaign's go/no-go test ([ADR 0006](0006-campaign-before-roguelite.md)), will want endless Waves with Enemies in random order, which a count per type can't say.

So a Wave is an **ordered list of groups**, each some Enemies of one type, with an optional gap of its own:

```ts
{ sends: [{ type: 'crawler', count: 4 }, { type: 'siege-walker', count: 1, gap: 6 }, { type: 'runner', count: 3 }], gap: 1.5 }
```

- Its Enemies arrive group by group, in the order it lists them. The first comes as the Wave starts; each after it waits its group's `gap`, or the Wave's if the group has none.
- A Wave names only what it sends. A random Wave is a list of groups of one, each with whatever gap a generator picks, so a hand-made Level and a generator produce the same value.
- The Analysis still shows only how many of each type, in the catalogue's order: not the order, nor the gaps.
- F2 shows a row per group, its count and its own gap. Groups are added, removed or reordered in the Level's code. A gap edit during a Wave counts from its next arrival; a count edit, from the next Wave's start, as before.

We rejected partial counts per type (they still leave the order to the type list) and a time for every Enemy (too fiddly to write by hand).

**Enemy types are named once.** `src/materials/enemy-types.ts` lists the types in order, the order Shift+1, Shift+2, … send them in the sandbox and the Analysis lists them in, and what each is called. A type's numbers stay in the enemy table, which F2 tunes; its look in the renderer; its shape in the sandbox. Each of those is a record by type, so the compiler asks a new type for a row in each, and none of them mixes pure data, Phaser colours and engine shapes in one entry.

**Later: a Wave source.** The Defence loop holds a Level's Waves as a fixed list and shows "Wave 3 of 5" from it. Roguelite Mode will make Wave _n_ on demand, with no last Wave; that is when the loop asks a `WaveSource` (`wave(n)`, and a count, or none for endless) instead of a list. It isn't built now, while it would have only one implementation.
