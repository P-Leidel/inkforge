import { afterEach, describe, expect, it } from 'vitest';
import type { Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import {
  createPhysicsWorld,
  type BodyId,
  type ContactHit,
  type ContactPair,
  type PhysicsWorld,
  type ShapeId,
  type StepReport,
  type Surface,
} from '../physics';
import { ContactLedger, TERRAIN_PARTY, type Party } from './contact-ledger';

describe('The Contact ledger', () => {
  /** A ledger whose Objects slide while their body is in `slides`. */
  function setup() {
    const slides = new Set<BodyId>();
    const ledger = new ContactLedger<string>({
      getSlide: (body) => (slides.has(body) ? { x: 0, y: -10 } : null),
    });
    return { ledger, slides };
  }

  /** A Party named `target`, on body `body`. */
  const party = (id: number, body: number, target = `party ${id}`): Party<string> => ({
    id,
    stroke: id,
    body: body as BodyId,
    target,
  });
  /** A shape pair between two Parties' bodies; each Party's shape is 10 × its id unless given. */
  const pair = (a: Party<string>, b: Party<string>, shapeA = a.id * 10, shapeB = b.id * 10) => ({
    bodyA: a.body,
    bodyB: b.body,
    shapeA: shapeA as ShapeId,
    shapeB: shapeB as ShapeId,
  });
  const hit = (a: Party<string>, b: Party<string>, impulse: number): ContactHit => ({
    ...pair(a, b),
    point: { x: 0, y: 0 },
    normal: { x: 0, y: 1 },
    speed: 100,
    impulse,
  });
  const report = (contacts: Partial<StepReport>): StepReport => ({
    hits: [],
    begins: [],
    ends: [],
    ...contacts,
  });

  const hitsOf = (ledger: ContactLedger<string>) =>
    ledger.hits.map(({ a, b, hit }) => [a.target, b.target, hit.impulse]);
  const newOf = (ledger: ContactLedger<string>) =>
    ledger.newContacts.map(({ a, b, pair }) => [a.target, b.target, pair.shapeA, pair.shapeB]);
  const touchingOf = (ledger: ContactLedger<string>, of: Party<string>) =>
    [...ledger.touching(of.body)].map((t) => t.party.target);

  /**
   * A ledger restored from a snapshot in which `a` and `b` touched, with
   * both registered again and stepped once touching again: they are Settled.
   */
  function settled(a: Party<string>, b: Party<string>) {
    const { ledger, slides } = setup();
    ledger.register(a);
    ledger.register(b);
    ledger.step(report({ begins: [pair(a, b)] }));
    ledger.restore(ledger.save());
    ledger.register(a);
    ledger.register(b);
    ledger.step(report({ begins: [pair(a, b)] }));
    return { ledger, slides };
  }

  it('hands out Party ids from 1 up, never again, also after a restore', () => {
    const { ledger } = setup();

    const first = [ledger.newId(), ledger.newId()];
    ledger.restore(ledger.save());
    const second = [ledger.newId(), ledger.newId()];

    expect(first).toEqual([1, 2]);
    expect(second).toEqual([3, 4]);
    expect(TERRAIN_PARTY).toBe(0);
  });

  it('passes on hits between registered Parties in report order, and drops one naming an unregistered body', () => {
    const { ledger } = setup();
    const [terrain, box, ball] = [party(0, 1, 'terrain'), party(1, 2, 'box'), party(2, 3, 'ball')];
    const gone = party(3, 4, 'gone');
    for (const p of [terrain, box, ball]) ledger.register(p);

    ledger.step(
      report({ hits: [hit(ball, box, 300), hit(box, gone, 200), hit(terrain, box, 100)] }),
    );

    expect(hitsOf(ledger)).toEqual([
      ['ball', 'box', 300],
      ['terrain', 'box', 100],
    ]);
    expect(ledger.hits[0]!.a).toBe(ball);
  });

  it('gives a Settled pair no hits and no new contact but shows it touching, until the two come apart', () => {
    const terrain = party(0, 1, 'terrain');
    const box = party(1, 2, 'box');
    const { ledger } = settled(terrain, box);
    expect(newOf(ledger)).toEqual([]);

    ledger.step(report({ hits: [hit(terrain, box, 900)] }));
    expect(hitsOf(ledger)).toEqual([]);
    expect(touchingOf(ledger, box)).toEqual(['terrain']);

    ledger.step(report({ ends: [pair(terrain, box)] }));
    expect(touchingOf(ledger, box)).toEqual([]);

    ledger.step(report({ begins: [pair(terrain, box)], hits: [hit(terrain, box, 900)] }));
    expect(newOf(ledger)).toEqual([['terrain', 'box', 0, 10]]);
    expect(hitsOf(ledger)).toEqual([['terrain', 'box', 900]]);
  });

  it('drops the Settled pairs that no longer touch after the first step that follows a restore', () => {
    const { ledger } = setup();
    const [terrain, box, ball] = [party(0, 1, 'terrain'), party(1, 2, 'box'), party(2, 3, 'ball')];
    for (const p of [terrain, box, ball]) ledger.register(p);
    ledger.step(report({ begins: [pair(terrain, box), pair(box, ball)] }));
    ledger.restore(ledger.save());
    for (const p of [terrain, box, ball]) ledger.register(p);

    // Only the box and the Terrain touch again: the ball fell off meanwhile.
    ledger.step(report({ begins: [pair(terrain, box)] }));
    ledger.step(report({ begins: [pair(box, ball)], hits: [hit(box, ball, 500)] }));

    expect(newOf(ledger)).toEqual([['box', 'ball', 10, 20]]);
    expect(hitsOf(ledger)).toEqual([['box', 'ball', 500]]);
    ledger.step(report({ hits: [hit(terrain, box, 500)] }));
    expect(hitsOf(ledger)).toEqual([]);
  });

  it('keeps a Settled pair Settled when it ends and begins again in one step', () => {
    const terrain = party(0, 1, 'terrain');
    const box = party(1, 2, 'box');
    const { ledger } = settled(terrain, box);

    ledger.step(
      report({
        ends: [pair(terrain, box)],
        begins: [pair(terrain, box, 0, 11)],
        hits: [hit(terrain, box, 900)],
      }),
    );

    expect(newOf(ledger)).toEqual([]);
    expect(hitsOf(ledger)).toEqual([]);
    expect(touchingOf(ledger, box)).toEqual(['terrain']);
  });

  it('leaves a Squeezed Object out of every channel, and Settles what it touches in the step its slide ends', () => {
    const { ledger, slides } = setup();
    const [terrain, line, box, ball] = [
      party(0, 1, 'terrain'),
      party(1, 2, 'line'),
      party(2, 3, 'box'),
      party(3, 4, 'ball'),
    ];
    for (const p of [terrain, line, box, ball]) ledger.register(p);
    slides.add(box.body);
    ledger.squeezed(box.body);

    ledger.step(report({ begins: [pair(box, ball)], hits: [hit(ball, box, 500)] }));
    expect(hitsOf(ledger)).toEqual([]);
    expect(newOf(ledger)).toEqual([]);
    expect(touchingOf(ledger, box)).toEqual([]);
    expect(touchingOf(ledger, ball)).toEqual([]);

    // It arrives: rebuilt as a moving body from rest, it touches the Line it
    // slid off, and settles onto it as if physics had just started.
    slides.delete(box.body);
    ledger.step(report({ begins: [pair(line, box)], hits: [hit(line, box, 400)] }));
    expect(hitsOf(ledger)).toEqual([]);
    expect(newOf(ledger)).toEqual([]);
    expect(touchingOf(ledger, box)).toEqual(['ball', 'line']);
    ledger.step(report({ hits: [hit(line, box, 400), hit(ball, box, 300)] }));
    expect(hitsOf(ledger)).toEqual([]);

    ledger.step(report({ begins: [pair(terrain, box)], hits: [hit(terrain, box, 200)] }));
    expect(newOf(ledger)).toEqual([['terrain', 'box', 0, 20]]);
    expect(hitsOf(ledger)).toEqual([['terrain', 'box', 200]]);

    // Once it has come apart from the ball, the two count again.
    ledger.step(report({ ends: [pair(box, ball)] }));
    ledger.step(report({ begins: [pair(box, ball)], hits: [hit(ball, box, 500)] }));
    expect(newOf(ledger)).toEqual([['box', 'ball', 20, 30]]);
    expect(hitsOf(ledger)).toEqual([['ball', 'box', 500]]);
  });

  it('keeps two Parties touching through two shape pairs as one entry until both end', () => {
    const { ledger } = setup();
    const terrain = party(0, 1, 'terrain');
    const box = party(1, 2, 'box');
    ledger.register(terrain);
    ledger.register(box);

    ledger.step(report({ begins: [pair(terrain, box, 0, 10), pair(terrain, box, 0, 11)] }));
    expect(newOf(ledger)).toEqual([['terrain', 'box', 0, 10]]);
    const [entry] = [...ledger.touching(box.body)];
    expect(entry!.party).toBe(terrain);
    expect(entry!.pairs.map((p) => p.shapeB)).toEqual([10, 11]);

    ledger.step(report({ ends: [pair(terrain, box, 0, 10), pair(terrain, box, 0, 12)] }));
    expect(touchingOf(ledger, box)).toEqual(['terrain']);
    ledger.step(report({ ends: [pair(terrain, box, 0, 11)] }));
    expect(touchingOf(ledger, box)).toEqual([]);
  });

  it('doesn’t count two Parties as new when one shape pair ends as another begins in one step', () => {
    const { ledger } = setup();
    const line = party(1, 1, 'line');
    const box = party(2, 2, 'box');
    ledger.register(line);
    ledger.register(box);
    ledger.step(report({ begins: [pair(line, box, 10, 20)] }));

    ledger.step(report({ ends: [pair(line, box, 10, 20)], begins: [pair(line, box, 11, 20)] }));

    expect(newOf(ledger)).toEqual([]);
    expect([...ledger.touching(box.body)][0]!.pairs.map((p) => p.shapeA)).toEqual([11]);
  });

  it('drops an unregistered body’s pairs at once, and ignores its late ends', () => {
    const terrain = party(0, 1, 'terrain');
    const box = party(1, 2, 'box');
    const { ledger } = settled(terrain, box);

    ledger.unregister(box.body);
    expect(touchingOf(ledger, terrain)).toEqual([]);
    expect(ledger.save().settled).toEqual([]);

    ledger.step(report({ ends: [pair(terrain, box)], hits: [hit(terrain, box, 900)] }));
    expect(hitsOf(ledger)).toEqual([]);
    expect(touchingOf(ledger, terrain)).toEqual([]);
  });

  it('Settles everything touching or Settled when saved, a Squeezed Object’s pairs too', () => {
    const [terrain, box, ball, rock] = [
      party(0, 1, 'terrain'),
      party(1, 2, 'box'),
      party(2, 3, 'ball'),
      party(3, 4, 'rock'),
    ];
    // The box and the Terrain are Settled; the ball touches the box.
    const { ledger, slides } = settled(terrain, box);
    ledger.register(ball);
    ledger.register(rock);
    ledger.step(report({ begins: [pair(box, ball)] }));
    // The rock is Squeezed while it touches the ball.
    ledger.squeezed(rock.body);
    slides.add(rock.body);
    ledger.step(report({ begins: [pair(ball, rock)] }));

    ledger.restore(ledger.save());
    slides.clear();
    for (const p of [terrain, box, ball, rock]) ledger.register(p);
    ledger.step(
      report({
        begins: [pair(terrain, box), pair(box, ball), pair(ball, rock)],
        hits: [hit(terrain, box, 900), hit(box, ball, 900), hit(ball, rock, 900)],
      }),
    );

    expect(newOf(ledger)).toEqual([]);
    expect(hitsOf(ledger)).toEqual([]);
  });
});

describe('The Contact ledger on the engine', () => {
  const worlds: PhysicsWorld[] = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.destroy();
  });

  const DEAD: Surface = { friction: 0.6, restitution: 0 };
  const box = (x: number, y: number, half: number): Polygon => [
    { x: x - half, y: y - half },
    { x: x + half, y: y - half },
    { x: x + half, y: y + half },
    { x: x - half, y: y + half },
  ];

  /** A body as the test builds it again after a reset, where it is then. */
  type Build =
    | { readonly kind: 'terrain' }
    | { readonly kind: 'line'; readonly from: Vec2; readonly to: Vec2 }
    | { readonly kind: 'object'; readonly half: number; readonly mass: number }
    | { readonly kind: 'circle'; readonly radius: number; readonly mass: number };

  interface Thing {
    readonly name: string;
    readonly build: Build;
    readonly id: number;
    party: Party<string>;
  }

  /** Every shape pair a ledger holds, by Party ids and shapes, from both sides. */
  function ledgerTouching(ledger: ContactLedger<string>, things: readonly Thing[]): Set<string> {
    const pairs = new Set<string>();
    for (const { party } of things) {
      for (const { party: other, pairs: shapes } of ledger.touching(party.body)) {
        for (const p of shapes) pairs.add(keyOf(party, other, p));
      }
    }
    return pairs;
  }

  function keyOf(a: Party<string>, b: Party<string>, p: ContactPair): string {
    const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
    const [s, t] = p.shapeA < p.shapeB ? [p.shapeA, p.shapeB] : [p.shapeB, p.shapeA];
    return `${lo.target} ${hi.target} ${s} ${t}`;
  }

  it('touches exactly what the engine touches after every step, through a wake, a squeeze, a removal and a rebuild', () => {
    const physics = createPhysicsWorld({
      gravity: { x: 0, y: 1000 },
      timeStep: 1 / 60,
      wakeSpeed: 80,
      minBounceSpeed: 50,
    });
    worlds.push(physics);
    const ledger = new ContactLedger<string>(physics);
    const things: Thing[] = [];
    const byBody = new Map<BodyId, Party<string>>();

    function add(name: string, build: Build, body: BodyId, id: number, stroke = id): Thing {
      const party = { id, stroke, body, target: name };
      ledger.register(party);
      byBody.set(body, party);
      const thing = { name, build, id, party };
      things.push(thing);
      return thing;
    }

    const ground: Polygon = [
      { x: 0, y: 500 },
      { x: 1000, y: 500 },
      { x: 1000, y: 600 },
      { x: 0, y: 600 },
    ];
    add('terrain', { kind: 'terrain' }, physics.addTerrain([ground], DEAD), TERRAIN_PARTY);
    // A Line of two Pieces, a shelf the Rubble falls on.
    const line = ledger.newId();
    const pieces: [Vec2, Vec2][] = [
      [
        { x: 600, y: 380 },
        { x: 700, y: 380 },
      ],
      [
        { x: 700, y: 380 },
        { x: 800, y: 380 },
      ],
    ];
    for (const [k, [from, to]] of pieces.entries()) {
      const body = physics.addLine([{ a: from, b: to }], 8, DEAD);
      add(`piece ${k}`, { kind: 'line', from, to }, body, ledger.newId(), line);
    }
    // A stack of two boxes on the ground.
    for (const [k, y] of [480, 440].entries()) {
      const body = physics.addObject({
        position: { x: 300, y },
        parts: [box(0, 0, 20)],
        frozen: false,
        surface: DEAD,
        mass: 2,
      });
      add(`stack ${k}`, { kind: 'object', half: 20, mass: 2 }, body, ledger.newId());
    }
    // A Frozen box, and a heavy ball that falls on it and wakes it.
    const frozen = physics.addObject({
      position: { x: 480, y: 300 },
      parts: [box(0, 0, 20)],
      frozen: true,
      surface: DEAD,
      mass: 1,
    });
    add('frozen', { kind: 'object', half: 20, mass: 1 }, frozen, ledger.newId());
    const ball = physics.addCircle({
      position: { x: 480, y: 200 },
      radius: 12,
      surface: DEAD,
      mass: 5,
      velocity: { x: 0, y: 600 },
    });
    add('ball', { kind: 'circle', radius: 12, mass: 5 }, ball, ledger.newId());
    // A Frozen box across the shelf, squeezed up off it.
    const squeezed = physics.addObject({
      position: { x: 700, y: 385 },
      parts: [box(0, 0, 20)],
      frozen: true,
      surface: DEAD,
      mass: 1,
    });
    add('squeezed', { kind: 'object', half: 20, mass: 1 }, squeezed, ledger.newId());
    // Rubble raining onto the shelf and the ground.
    for (let k = 0; k < 12; k++) {
      const position = { x: 560 + k * 22, y: 250 - (k % 3) * 30 };
      const body = physics.addCircle({ position, radius: 6, surface: DEAD, mass: 0.2 });
      add(`rubble ${k}`, { kind: 'circle', radius: 6, mass: 0.2 }, body, ledger.newId());
    }
    physics.slideOut(squeezed, { x: 0, y: -40 }, 250);
    ledger.squeezed(squeezed);

    /** Builds everything again on a fresh engine, where it is now, as R does. */
    function rebuild(): void {
      const saved = things.map(({ party: { body }, build }) => ({
        build,
        transform:
          build.kind === 'terrain' || build.kind === 'line' ? null : physics.getTransform(body),
        velocity:
          build.kind === 'circle' || build.kind === 'object' ? physics.getVelocity(body) : null,
        angularVelocity:
          build.kind === 'circle' || build.kind === 'object' ? physics.getAngularVelocity(body) : 0,
        frozen: build.kind === 'object' && physics.isFrozen(body),
        slide: build.kind === 'object' ? physics.getSlide(body) : null,
      }));
      const contacts = ledger.save();
      physics.reset();
      ledger.restore(contacts);
      byBody.clear();
      for (const [k, thing] of things.entries()) {
        const { build, transform, velocity, angularVelocity, frozen: isFrozen, slide } = saved[k]!;
        let body: BodyId;
        if (build.kind === 'terrain') body = physics.addTerrain([ground], DEAD);
        else if (build.kind === 'line')
          body = physics.addLine([{ a: build.from, b: build.to }], 8, DEAD);
        else if (build.kind === 'object')
          body = physics.addObject({
            position: { x: transform!.x, y: transform!.y },
            angle: transform!.angle,
            parts: [box(0, 0, build.half)],
            frozen: isFrozen || slide !== null,
            surface: DEAD,
            mass: build.mass,
            velocity: velocity!,
            angularVelocity,
          });
        else
          body = physics.addCircle({
            position: { x: transform!.x, y: transform!.y },
            angle: transform!.angle,
            radius: build.radius,
            surface: DEAD,
            mass: build.mass,
            velocity: velocity!,
            angularVelocity,
          });
        thing.party = { ...thing.party, body };
        ledger.register(thing.party);
        byBody.set(body, thing.party);
        if (slide) {
          physics.slideOut(body, slide, 250);
          ledger.squeezed(body);
        }
      }
    }

    let slidSteps = 0;
    let touchedSteps = 0;
    for (let step = 0; step < 240; step++) {
      if (step === 50) {
        // Remove a piece of Rubble resting on the shelf.
        const [gone] = things.splice(
          things.findIndex((t) => t.name === 'rubble 4'),
          1,
        );
        physics.removeBody(gone!.party.body);
        ledger.unregister(gone!.party.body);
      }
      if (step === 9 || step === 120) rebuild();

      ledger.step(physics.step());

      const sliding = (body: BodyId) => physics.getSlide(body) !== null;
      const engine = new Set<string>();
      for (const p of physics.touchingPairs()) {
        const a = byBody.get(p.bodyA);
        const b = byBody.get(p.bodyB);
        expect(a && b).toBeTruthy();
        if (sliding(p.bodyA) || sliding(p.bodyB)) continue;
        engine.add(keyOf(a!, b!, p));
      }
      expect(ledgerTouching(ledger, things)).toEqual(engine);
      if (things.some((t) => sliding(t.party.body))) slidSteps++;
      if (engine.size > 0) touchedSteps++;
    }

    // The scene did what it is meant to.
    const bodyOf = (name: string) => things.find((t) => t.name === name)!.party.body;
    expect(physics.isFrozen(bodyOf('frozen'))).toBe(false);
    expect(slidSteps).toBeGreaterThan(5);
    expect(physics.getSlide(bodyOf('squeezed'))).toBeNull();
    expect(touchedSteps).toBeGreaterThan(200);
    const onShelf = [...ledger.touching(bodyOf('piece 1'))];
    expect(onShelf.length).toBeGreaterThan(0);
  });
});
