import { afterEach, describe, expect, it } from 'vitest';
import {
  capsuleOverlapsPolygon,
  circleOverlapsPolygon,
  convexPolygonsOverlap,
} from '../geometry/overlap';
import { polygonContainsPoint, type Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { applyTransform, transformPoints } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import { createMaterialTable } from '../materials/material-table';
import { createPhysicsWorld, type BodyId, type PhysicsWorld } from '../physics';
import { SANDBOX_ARENA } from './arena';
import { ArenaBodies } from './arena-bodies';
import { ArenaQuery, type Capsule } from './arena-query';
import { brushTouchesCapsules, brushTouchesCircle, brushTouchesPolygon, type Brush } from './brush';
import { ContactLedger, type Party } from './contact-ledger';
import type { Thing } from './happenings';
import { Random } from './random';

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.destroy();
});

const square = (half: number): Polygon => [
  { x: -half, y: -half },
  { x: half, y: -half },
  { x: half, y: half },
  { x: -half, y: half },
];

/** The Sandbox Arena with its Terrain, and a way to add each kind of body to it. */
function setup() {
  const physics = createPhysicsWorld({
    gravity: { x: 0, y: 1000 },
    timeStep: 1 / 60,
    wakeSpeed: 1e9,
    minBounceSpeed: 1,
  });
  worlds.push(physics);
  const contacts = new ContactLedger<null>(physics);
  const bodies = new ArenaBodies<null>(
    physics,
    contacts,
    createMaterialTable(),
    () => {},
    () => {},
  );
  bodies.addTerrain(SANDBOX_ARENA.terrain);
  const query = new ArenaQuery(physics, bodies);

  let things = 0;
  const own =
    (extra: Partial<Party<null>> = {}) =>
    (body: BodyId): Party<null> => {
      const id = bodies.newId();
      return { id, stroke: id, body, target: null, ...extra };
    };
  /** An Object at `position`: `outline` to be drawn by, `parts` to collide with. */
  const object = (position: Vec2, outline: Polygon, parts: readonly Polygon[] = [outline]) => {
    const what = { thing: 'object', id: ++things } as const;
    const party = bodies.addObject(
      { position, parts, frozen: true, mass: 1 },
      'grey',
      outline,
      what,
      own(),
    );
    return { what, body: party.body, party };
  };
  const piece = (segments: readonly Segment[], thickness = 8) => {
    const what = { thing: 'piece', id: ++things, index: 0 } as const;
    return { what, body: bodies.addLine(segments, thickness, 'grey', what, own()).body };
  };
  const circle = (position: Vec2, radius: number, droplet = false) => {
    const id = ++things;
    const what: Thing = droplet
      ? { thing: 'droplet', id }
      : { thing: 'rubble', id, colour: 'grey', radius };
    const party = bodies.addCircle(
      { position, radius, mass: 1 },
      { colour: 'grey', role: droplet ? 'line' : 'outline' },
      what,
      own(droplet ? { harmless: true } : {}),
    );
    return { what, body: party.body };
  };
  const patch = (host: Party<null>, segment: Segment, thickness = 3) => {
    const what = { thing: 'patch', id: ++things, colour: 'blue', segment, thickness } as const;
    bodies.addShape(host.id, segment, thickness / 2, 'blue', what);
    return { what };
  };
  return { physics, bodies, query, object, piece, circle, patch };
}

const click = (x: number, y: number, radius = 12): Brush => ({ path: [{ x, y }], radius });

describe('Arena query', () => {
  it('finds the Objects under a point by their Outline, oldest first', () => {
    const { query, object } = setup();
    // Its Outline sticks out 2 px past the part it collides with, as a drawn Object's may.
    const first = object({ x: 400, y: 400 }, square(30), [square(28)]);
    const second = object({ x: 440, y: 400 }, square(30));

    expect(query.objectsAt({ x: 371, y: 400 })).toEqual([first.what]);
    expect(query.objectsAt({ x: 420, y: 400 })).toEqual([first.what, second.what]);
    expect(query.objectsAt({ x: 480, y: 400 })).toEqual([]);
    expect(query.objectsAt({ x: 300, y: 900 })).toEqual([]); // the Terrain is no Object
  });

  it('finds an Object where it is now', () => {
    const { physics, query, object } = setup();
    const box = object({ x: 400, y: 300 }, square(20));
    physics.release(box.body);
    for (let step = 0; step < 60; step++) physics.step();

    const { x, y } = physics.getTransform(box.body);
    expect(query.objectsAt({ x, y })).toEqual([box.what]);
    expect(query.objectsAt({ x: 400, y: 300 })).toEqual([]);
  });

  it('counts the Terrain, Objects and Rubble as solid; not Lines, Droplets or Patches', () => {
    const { query, object, piece, circle, patch } = setup();
    const at = (x: number, y: number) => square(10).map((p) => ({ x: p.x + x, y: p.y + y }));
    const host = object({ x: 400, y: 400 }, square(20));
    piece([{ a: { x: 600, y: 400 }, b: { x: 700, y: 400 } }]);
    circle({ x: 800, y: 400 }, 6);
    circle({ x: 1000, y: 400 }, 6, true);
    patch(host.party, { a: { x: -20, y: -24 }, b: { x: 20, y: -24 } });

    expect(query.overlapsSolid(at(300, 880))).toBe(true); // the ground
    expect(query.overlapsSolid(at(300, 869))).toBe(false); // resting on it
    expect(query.overlapsSolid(at(415, 400))).toBe(true);
    expect(query.overlapsSolid(at(650, 400))).toBe(false);
    expect(query.overlapsSolid(at(800, 400))).toBe(true);
    expect(query.overlapsSolid(at(1000, 400))).toBe(false);
    expect(query.overlapsSolid(at(400, 360))).toBe(false); // on the Patch, above the host
  });

  it('finds the Objects capsules cross by their collider parts, oldest first', () => {
    const { query, object } = setup();
    const low = object({ x: 400, y: 400 }, square(30), [square(28)]);
    const high = object({ x: 400, y: 300 }, square(30));
    const across = (y: number) => ({ segment: { a: { x: 300, y }, b: { x: 500, y } }, radius: 4 });

    expect(query.objectsCrossing([across(400), across(300)])).toEqual([low.what, high.what]);
    expect(query.objectsCrossing([across(300), across(400)])).toEqual([low.what, high.what]);
    // Into the Outline, but not the collider part, by more than 1 px: no crossing.
    expect(query.objectsCrossing([across(435)])).toEqual([]);
    expect(query.objectsCrossing([across(430)])).toEqual([low.what]);
  });

  it('finds everything the brush touches, oldest first, never the Terrain', () => {
    const { query, object, piece, circle, patch } = setup();
    const host = object({ x: 400, y: 400 }, square(20));
    const line = piece([{ a: { x: 300, y: 440 }, b: { x: 500, y: 440 } }]);
    const rubble = circle({ x: 460, y: 425 }, 6);
    const droplet = circle({ x: 340, y: 400 }, 3, true);
    const onTop = patch(host.party, { a: { x: -20, y: -21.5 }, b: { x: 20, y: -21.5 } });

    expect(query.touchedBy(click(400, 870, 30))).toEqual([]);
    expect(query.touchedBy(click(400, 369))).toEqual([host.what, onTop.what]);
    expect(query.touchedBy(click(400, 366))).toEqual([onTop.what]);
    const sweep: Brush = {
      path: [
        { x: 300, y: 430 },
        { x: 500, y: 430 },
      ],
      radius: 12,
    };
    expect(query.touchedBy(sweep)).toEqual([host.what, line.what, rubble.what]);
    expect(query.touchedBy(click(340, 400, 1))).toEqual([droplet.what]);
  });

  it('gives the same answers as testing every body, in a heap that has settled', () => {
    const { physics, bodies, query, object, piece, circle, patch } = setup();
    const random = new Random(7);
    const at = (lo: number, hi: number) => lo + (hi - lo) * random.next();
    const objects = Array.from({ length: 25 }, () => {
      const half = at(8, 30);
      const found = object({ x: at(100, 1800), y: at(100, 700) }, square(half), [
        square(half - 1.5),
      ]);
      physics.release(found.body);
      return found;
    });
    for (let k = 0; k < 8; k++) {
      const x = at(100, 1700);
      const y = at(300, 800);
      piece([{ a: { x, y }, b: { x: x + at(40, 120), y: y + at(-40, 40) } }]);
    }
    for (let k = 0; k < 30; k++)
      circle({ x: at(100, 1800), y: at(100, 600) }, at(2, 8), k % 3 === 0);
    for (const { party } of objects.slice(0, 10)) {
      patch(party, { a: { x: -5, y: -3 }, b: { x: 5, y: -3 } });
    }
    for (let step = 0; step < 120; step++) physics.step();

    // What testing every body finds, from the bodies' shapes where they are now.
    const all = everyBody(bodies, physics);
    for (let k = 0; k < 200; k++) {
      const point = { x: at(0, 1920), y: at(0, 1080) };
      const end = { x: point.x + at(-80, 80), y: point.y + at(-20, 20) };
      expect(query.objectsAt(point)).toEqual(all.objectsAt(point));
      const brush: Brush = { path: [point, end], radius: 12 };
      expect(query.touchedBy(brush)).toEqual(all.touchedBy(brush));
      const part = square(at(5, 40)).map((p) => ({ x: p.x + point.x, y: p.y + point.y }));
      expect(query.overlapsSolid(part)).toBe(all.overlapsSolid(part));
      const capsule: Capsule = { segment: { a: point, b: end }, radius: 3 };
      expect(query.objectsCrossing([capsule])).toEqual(all.objectsCrossing(capsule));
    }
  });
});

/**
 * The query's answers the slow way: every body and Patch Arena bodies holds,
 * each tested where it is now.
 */
function everyBody(bodies: ArenaBodies<null>, physics: PhysicsWorld) {
  const everything = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };
  const figures = () => bodies.figures(physics.shapesNear(everything));
  const transform = (body: BodyId) => physics.getTransform(body);
  const objects = () =>
    figures().flatMap(({ what, body, form }) =>
      form.kind === 'object' && what?.thing === 'object'
        ? [
            {
              what,
              outline: transformPoints(form.outline, transform(body)),
              parts: form.parts.map((part) => transformPoints(part, transform(body))),
            },
          ]
        : [],
    );
  return {
    objectsAt: (point: Vec2) =>
      objects()
        .filter(({ outline }) => polygonContainsPoint(outline, point))
        .map(({ what }) => what),
    objectsCrossing: ({ segment: { a, b }, radius }: Capsule) =>
      objects()
        .filter(({ parts }) => parts.some((part) => capsuleOverlapsPolygon(a, b, radius, part)))
        .map(({ what }) => what),
    overlapsSolid: (part: Polygon) =>
      figures().some(({ what, body, form }) => {
        if (form.kind === 'terrain')
          return form.polygons.some((p) => convexPolygonsOverlap(part, p));
        if (form.kind === 'object') {
          return form.parts.some((p) =>
            convexPolygonsOverlap(part, transformPoints(p, transform(body))),
          );
        }
        if (form.kind === 'circle' && what?.thing === 'rubble') {
          const { x, y } = transform(body);
          return circleOverlapsPolygon({ centre: { x, y }, radius: form.radius }, part);
        }
        return false;
      }),
    touchedBy: (brush: Brush) =>
      figures().flatMap(({ what, body, form }) => {
        const t = transform(body);
        const touches =
          (form.kind === 'object' &&
            brushTouchesPolygon(brush, transformPoints(form.outline, t))) ||
          (form.kind === 'capsules' && brushTouchesCapsules(brush, form.segments, form.radius)) ||
          (form.kind === 'circle' && brushTouchesCircle(brush, { x: t.x, y: t.y }, form.radius)) ||
          (form.kind === 'capsule' &&
            brushTouchesCapsules(
              brush,
              [{ a: applyTransform(form.segment.a, t), b: applyTransform(form.segment.b, t) }],
              form.radius,
            ));
        return what && touches ? [what] : [];
      }),
  };
}
