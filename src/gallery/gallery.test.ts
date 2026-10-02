import { describe, expect, it } from 'vitest';
import { COLOURS } from '../materials/colour';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { SANDBOX_LEVEL } from '../game/level';
import { games } from '../game/test-support';
import { objectById, runFor, sandboxWorlds } from '../sandbox/test-support';
import {
  BOULDER_DEMO,
  BOUNCE_DEMO,
  CHAIN_DEMO,
  DEMOLITION_DEMO,
  DROP_DEMO,
  GALLERY,
  GLUE_DEMO,
  KNOCK_DEMO,
  PIT_DEMO,
  PIT_LEFT,
  PIT_RIGHT,
  RUBBLE_DEMO,
  SHRAPNEL_DEMO,
  SLIDE_DEMO,
  STAIRCASE_DEMO,
  STAIRCASE_WALL_HEIGHT,
  STAIRCASE_WALL_X,
  STICK_DEMO,
  THIRD_BOUNCE_DEMO,
  THREE_WAVES_DEMO,
  type Demo,
} from './gallery';

const createWorld = sandboxWorlds();
const createGame = games();

/**
 * A new Game with `demo` loaded, as the scene loads it, then with Waves off
 * and physics running on from where the demo left it; its Sandbox world.
 */
function loaded(demo: Demo): SandboxWorld {
  const game = createGame(true);
  game.load(demo); // throws if any of its Strokes is refused
  // A demo with its own Waves turns them on, which pauses it.
  game.waves = false;
  game.world.resume();
  return game.world;
}

/** A copy of `value` with every field named in `keys` left out. */
function without(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => without(item, keys));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !keys.has(key))
      .map(([key, field]) => [key, without(field, keys)]),
  );
}

/**
 * The poses bodies had as the latest step began, which views carry for the
 * renderer. R forgets them on purpose: it is drawn where it is.
 */
const PREVIOUS_POSES = new Set(['previousTransform', 'hostPoses', 'objectPoses']);

/**
 * Everything in the Arena, of every kind: what a replay must play out the
 * same. Ids are left out: ids are never reused, so what a run makes (Rubble
 * from a broken Fill) gets new ones each time it is played.
 */
const played = (world: SandboxWorld) => without(world.contents, new Set(['id']));

/** Everything in the Arena, of every kind, that R brings back. */
const arenaContents = (world: SandboxWorld) => without(world.contents, PREVIOUS_POSES);

describe('Colour gallery', () => {
  for (const demo of GALLERY) {
    it(`${demo.name}: loads through the Game and starts physics`, () => {
      const world = loaded(demo);

      expect(world.isRunning).toBe(true);
      // It lets go of Objects, or sends in Enemies.
      expect(world.objects.some((o) => !o.frozen) || world.enemyCount > 0).toBe(true);
    });

    it(`${demo.name}: plays the same again after R and Space`, () => {
      const world = loaded(demo);
      runFor(world, 1);
      const first = played(world);

      world.reset();
      runFor(world, 1);

      expect(played(world)).toEqual(first);
    });

    it(`${demo.name}: R brings back the Arena contents as they were at Space`, () => {
      const world = loaded(demo);
      runFor(world, 1);
      const running = arenaContents(world);

      world.togglePause();
      world.togglePause(); // takes a snapshot and rebuilds the world from it
      const started = arenaContents(world);
      runFor(world, 1);
      world.reset();

      expect(started).toEqual(running);
      expect(arenaContents(world)).toEqual(started);
    });
  }

  it('Grounds every Line of every demo: none hangs Frozen', () => {
    for (const demo of GALLERY) {
      const world = createWorld({ arena: demo.arena });
      demo.build(world);
      for (const line of world.lines) expect(line.grounded, demo.name).toBe(true);
    }
  });

  it('Three Waves: loads with Waves on, paused in the first Intermission', () => {
    const game = createGame(true);

    game.load(THREE_WAVES_DEMO);

    expect(game.waves).toBe(true);
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, waves: 3 });
    expect(game.isRunning).toBe(false);
  });

  it('Bounce: puts a Line of each Colour side by side', () => {
    const world = createWorld();
    BOUNCE_DEMO.build(world);

    // Each on a grey post, drawn after them.
    expect(world.lines.slice(0, 5).map((line) => line.colour)).toEqual([...COLOURS]);
    expect(world.lines.every((line) => line.grounded)).toBe(true);
  });

  it('Slide: the box races down blue and holds on black', () => {
    const world = createWorld();
    SLIDE_DEMO.build(world);
    const start = world.objects.map((o) => o.transform);

    runFor(world, 0.8);

    const moved = world.objects.map((o, k) =>
      Math.hypot(o.transform.x - start[k]!.x, o.transform.y - start[k]!.y),
    );
    const [grey, blue, , black] = moved;
    expect(blue).toBeGreaterThan(2 * grey!);
    expect(black).toBeLessThan(3);
  });

  it('Knock: the hollow box flies, the grey-filled one is nudged, the black-filled one holds', () => {
    const world = createWorld();
    KNOCK_DEMO.build(world);

    runFor(world, 0.3);

    const boxes = world.objects.filter((o) => o.mass > 1); // the balls weigh 0.75
    const [hollow, grey, black] = boxes;
    expect(boxes.map((b) => b.fill)).toEqual([null, 'grey', 'black']);
    expect(hollow!.velocity.x).toBeGreaterThan(1.5 * grey!.velocity.x);
    expect(grey!.frozen).toBe(false);
    expect(black!.frozen).toBe(true);
  });

  it('Drop: red explodes, grey, blue and green crack, black is barely scratched', () => {
    const world = createWorld();
    DROP_DEMO.build(world);

    runFor(world, 3);

    const wear = Object.fromEntries(world.objects.map((o) => [o.colour, o.wear]));
    expect(Object.keys(wear)).toEqual(['grey', 'blue', 'green', 'black']);
    for (const colour of ['grey', 'blue', 'green'] as const) {
      expect(wear[colour]).toBeGreaterThan(0.25); // cracked
      expect(wear[colour]).toBeLessThan(1);
    }
    expect(wear.black).toBeLessThan(0.25);
  });

  it('Third bounce: the blue ball breaks on its third bounce', () => {
    const world = createWorld();
    THIRD_BOUNCE_DEMO.build(world);
    let impacts = 0;

    for (let step = 0; step < 600 && world.objects.length > 0; step++) {
      impacts = world.objects[0]!.impacts;
      world.step();
    }

    expect(world.objects).toHaveLength(0);
    expect(impacts).toBe(2); // the third impact broke it
  });

  it('Boulder: breaks the grey Line and falls through; the black Line cracks and holds it', () => {
    const world = createWorld();
    BOULDER_DEMO.build(world);

    runFor(world, 2);

    const [grey, black] = world.lines;
    expect(grey!.pieces.length).toBeLessThan(5);
    expect(black!.pieces).toHaveLength(5);
    expect(black!.pieces.some((p) => p.wear > 0.25)).toBe(true);
    const [fallen, held] = world.objects;
    expect(fallen!.transform.y).toBeGreaterThan(700);
    expect(held!.transform.y + 30).toBeCloseTo(616, 0);
  });

  it('Rubble: pebbles and stones spill onto the grey Line, and the stones crack it', () => {
    const world = createWorld();
    RUBBLE_DEMO.build(world);

    runFor(world, 3);

    expect(world.objects).toHaveLength(0);
    const pebbles = world.rubble.filter((r) => r.colour === 'grey');
    const stones = world.rubble.filter((r) => r.colour === 'black');
    expect(pebbles.length).toBeGreaterThan(stones.length);
    expect(stones.length).toBeGreaterThan(0);
    // The grey Lines under the pebbles and under the stones; the anvils between.
    const [underPebbles, , underStones] = world.lines;
    const worn = (line: typeof underPebbles) => Math.max(...line!.pieces.map((p) => p.wear));
    expect(worn(underStones)).toBeGreaterThan(0.25); // cracked
    expect(worn(underPebbles)).toBeLessThan(worn(underStones));
  });

  it('Glue: green stops the hollow ball soonest and the black-filled one last; the one on grey rolls furthest', () => {
    const world = createWorld();
    GLUE_DEMO.build(world);

    runFor(world, 3);

    const [onGrey, hollow, greyFilled, blackFilled] = world.objects.map((o) => o.transform.x - 230);
    expect(hollow).toBeLessThan(2 * 48);
    expect(greyFilled).toBeGreaterThan(hollow!);
    expect(blackFilled).toBeGreaterThan(greyFilled!);
    expect(onGrey).toBeGreaterThan(1.5 * blackFilled!);
    const green = world.lines.slice(1, 4);
    for (const line of green) expect(line.pieces.some((p) => p.wear > 0)).toBe(true);
  });

  it('Stick: each green Object glues itself to the first new thing it touches', () => {
    const world = createWorld();
    STICK_DEMO.build(world);

    runFor(world, 2);

    const green = world.objects.filter((o) => o.colour === 'green');
    expect(world.bonds.map((b) => b.object).sort()).toEqual(green.map((o) => o.id).sort());
    const [hanger] = green;
    expect(hanger!.transform.y).toBeLessThan(340); // hanging under the Line
    const knocked = world.objects.find((o) => o.colour === 'grey')!;
    expect(knocked.frozen).toBe(false);
  });

  it('Chain: the bombs go off one by one; the one beyond reach stays', () => {
    const world = createWorld();
    CHAIN_DEMO.build(world);
    const bombs = world.objects.filter((o) => o.colour === 'red');
    const lone = bombs.find((o) => Math.abs(o.transform.x - 230) < 1); // hanging above the chain

    let most = 0;
    for (let step = 0; step < 180; step++) {
      world.step();
      most = Math.max(most, world.blasts.length);
    }

    expect(world.objects.filter((o) => o.colour === 'red').map((o) => o.id)).toEqual([lone!.id]);
    expect(objectById(world, lone!.id)).toMatchObject({ frozen: true, wear: 0 });
    expect(most).toBeGreaterThan(1); // rings spreading at once, each started later
    expect(most).toBeLessThan(bombs.length - 1);
    expect(world.objects.filter((o) => o.colour === 'grey').every((o) => !o.frozen)).toBe(true);
  });

  it('Shrapnel: the Blast throws the pebbles, which knock loose posts it can’t reach', () => {
    const world = createWorld();
    SHRAPNEL_DEMO.build(world);

    let fastest = 0;
    for (let step = 0; step < 90; step++) {
      world.step();
      for (const { velocity } of world.rubble) {
        fastest = Math.max(fastest, Math.hypot(velocity.x, velocity.y));
      }
    }

    expect(world.rubble.length).toBeGreaterThan(10);
    expect(fastest).toBeGreaterThan(1000); // the Fill's kick alone is 200 px/s
    const posts = world.objects.filter((o) => o.colour === 'grey');
    expect(posts).toHaveLength(2);
    expect(posts.every((o) => !o.frozen)).toBe(true);
  });

  it('Demolition: the chain plays out, with 5 Blasts, about 60 Rubble and about 30 Droplets', () => {
    const world = createWorld();
    DEMOLITION_DEMO.build(world);
    const { rubbleCap } = world.materials;
    // By the list of what happened: a Droplet turns into a Patch as it lands.
    const heard = world.happenings.reader();
    let blasts = 0;
    let rubble = 0;
    let droplets = 0;

    for (let step = 0; step < 300; step++) {
      world.step();
      for (const entry of heard.read()) {
        if (entry.kind === 'exploded') blasts++;
        else if (entry.kind === 'added' && entry.what.thing === 'rubble') rubble++;
        else if (entry.kind === 'added' && entry.what.thing === 'droplet') droplets++;
      }
      expect(world.rubble.length).toBeLessThan(rubbleCap);
    }
    heard.close();

    expect(blasts).toBe(5);
    expect(world.blasts).toHaveLength(0);
    expect(rubble).toBeGreaterThanOrEqual(55);
    expect(rubble).toBeLessThanOrEqual(65);
    expect(droplets).toBeGreaterThanOrEqual(20); // two Spills of 10 to 15
    expect(droplets).toBeLessThanOrEqual(30);
    expect(world.objects).toHaveLength(0); // every bomb, box and Spill went
  });

  it('Staircase: the first three Crawlers make a stair at the wall, and the rest climb it and get over', () => {
    const world = loaded(STAIRCASE_DEMO);
    const crossed = new Set<number>();
    const heard = world.happenings.reader();

    for (let step = 0; step < 25 * 60; step++) {
      world.step();
      for (const enemy of world.enemies)
        if (enemy.transform.x > STAIRCASE_WALL_X + 40) crossed.add(enemy.id);
    }
    for (const entry of heard.read())
      if (entry.kind === 'went' && entry.what.thing === 'enemy') crossed.add(entry.what.id);
    heard.close();

    const ground = world.arena.spawn.y;
    const feet = (id: number) => {
      const enemy = world.enemies.find((e) => e.id === id)!;
      return ground - (enemy.transform.y + enemy.height / 2);
    };
    expect([...crossed].sort()).toEqual([4, 5, 6]);
    expect(feet(1)).toBeLessThan(1); // against the wall
    expect(feet(2)).toBeCloseTo(STAIRCASE_WALL_HEIGHT / 3, -0.5); // on the first
    expect(feet(3)).toBeLessThan(1); // the step
  });

  describe('Pit', () => {
    /** Whether the Terrain has a gap open to the bottom of the screen at `x`. */
    const openAt = (world: SandboxWorld, x: number) =>
      !world.arena.terrain.some((polygon) => {
        const xs = polygon.map((p) => p.x);
        return Math.min(...xs) < x && x < Math.max(...xs);
      });

    /** Steps until no Enemy is left or `seconds` pass; the ids of those that died, in order. */
    function deaths(world: SandboxWorld, seconds: number): number[] {
      const heard = world.happenings.reader();
      const died: number[] = [];
      for (let step = 0; step < seconds * 60 && world.enemyCount > 0; step++) {
        world.step();
        for (const entry of heard.read())
          if (entry.kind === 'went' && entry.what.thing === 'enemy') died.push(entry.what.id);
      }
      heard.close();
      return died;
    }

    it('loads with its gap, which the sandbox Arena has none of', () => {
      const game = createGame(true);
      const middle = (PIT_LEFT + PIT_RIGHT) / 2;
      expect(openAt(game.world, middle)).toBe(false);

      game.load(PIT_DEMO);
      const world = game.world;

      expect(openAt(world, middle)).toBe(true);
      expect(openAt(world, PIT_LEFT - 1)).toBe(false);
      expect(openAt(world, PIT_RIGHT + 1)).toBe(false);
      expect(world.enemyCount).toBe(3);
    });

    it('every Crawler walks into the Pit and dies below the screen, short of the Ink Core', () => {
      const world = loaded(PIT_DEMO);
      const lowest = new Map<number, number>();
      const heard = world.happenings.reader();

      for (let step = 0; step < 30 * 60 && world.enemyCount > 0; step++) {
        world.step();
        for (const enemy of world.enemies) {
          lowest.set(enemy.id, Math.max(lowest.get(enemy.id) ?? 0, enemy.transform.y));
          expect(enemy.transform.x).toBeLessThan(PIT_RIGHT);
        }
      }
      const died = heard.read().filter((e) => e.kind === 'went' && e.what.thing === 'enemy');
      heard.close();

      expect(world.enemyCount).toBe(0);
      expect(died).toHaveLength(3);
      expect(world.inkCore.hp).toBe(world.inkCore.fullHp);
      for (const y of lowest.values()) expect(y).toBeGreaterThan(world.arena.height - 60);
    });

    it('R keeps its Terrain, and the Crawlers fall in again', () => {
      const world = loaded(PIT_DEMO);
      const terrain = world.arena.terrain;
      const first = deaths(world, 30);

      world.reset();

      expect(world.arena.terrain).toBe(terrain);
      expect(world.enemyCount).toBe(3);
      world.togglePause();
      expect(deaths(world, 30)).toEqual(first);
      expect(world.enemyCount).toBe(0);
    });

    it('Clear brings the sandbox Arena back', () => {
      const game = createGame(true);
      const world = game.world;
      const sandbox = world.arena.terrain;
      game.load(PIT_DEMO);

      game.load(SANDBOX_LEVEL);

      expect(world.arena.terrain).toBe(sandbox);
      expect(world.enemyCount).toBe(0);
      // A Crawler walks straight over where the gap was.
      world.spawn('crawler', { x: PIT_LEFT - 100, y: world.arena.spawn.y - 22 });
      world.togglePause();
      runFor(world, 5);
      expect(world.enemies[0]!.transform.x).toBeGreaterThan(PIT_RIGHT);
    });

    for (const demo of GALLERY.filter((d) => d !== PIT_DEMO)) {
      it(`${demo.name} after it plays as on a fresh world`, () => {
        const fresh = loaded(demo);
        runFor(fresh, 1);
        const game = createGame(true);
        game.load(PIT_DEMO);
        runFor(game.world, 1);

        game.load(demo);
        const world = game.world;
        runFor(world, 1);

        expect(world.arena.terrain).toBe(fresh.arena.terrain);
        expect(played(world)).toEqual(played(fresh));
      });
    }
  });
});
