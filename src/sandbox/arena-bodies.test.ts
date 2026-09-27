import { describe, expect, it } from 'vitest';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import { createMaterialTable } from '../materials/material-table';
import type { BodyDef, BodyId, ShapeId, StepReport, Surface } from '../physics';
import { ArenaBodies, type BodiesPhysics } from './arena-bodies';
import { ContactLedger, TERRAIN_PARTY, type Party, type PartyId } from './contact-ledger';
import type { Happening, Thing } from './happenings';
import { Numbers } from './numbers';

/** A physics module that only numbers bodies and shapes, and logs every call. */
class StubPhysics implements BodiesPhysics {
  readonly log: string[] = [];
  /** Bodies still sliding, and what they have left to go. */
  readonly slides = new Map<BodyId, Vec2>();
  /** The shapes added on each body. */
  private readonly capsules = new Map<BodyId, Set<ShapeId>>();
  private nextBody = 1;
  private nextShape = 1;

  private add(what: string): BodyId {
    const body = this.nextBody++ as BodyId;
    this.capsules.set(body, new Set());
    this.log.push(`add ${what} ${body}`);
    return body;
  }

  addBody = ({ shapes, motion }: BodyDef) =>
    this.add(
      shapes.kind === 'capsules'
        ? 'line'
        : shapes.kind === 'circle'
          ? 'circle'
          : motion
            ? 'object'
            : 'terrain',
    );

  getTransform = (body: BodyId) => ({ x: body, y: 0, angle: 0 });
  getVelocity = () => ({ x: 0, y: 5 });

  removeBody = (body: BodyId) => {
    this.capsules.delete(body);
    this.slides.delete(body);
    this.log.push(`remove body ${body}`);
  };

  slideOut = (body: BodyId, displacement: Vec2) => {
    this.slides.set(body, displacement);
    this.log.push(`slide ${body}`);
  };

  addCapsule = (body: BodyId) => {
    const shape = this.nextShape++ as ShapeId;
    this.capsules.get(body)!.add(shape);
    this.log.push(`add shape ${shape} on ${body}`);
    return shape;
  };

  removeShape = (shape: ShapeId) => {
    this.log.push(`remove shape ${shape}`);
    for (const shapes of this.capsules.values()) shapes.delete(shape);
  };

  setSurface = (body: BodyId, { friction, restitution }: Surface) => {
    this.log.push(`surface ${body} ${friction}/${restitution}`);
  };

  setShapeSurface = (shape: ShapeId, { friction, restitution }: Surface) => {
    this.log.push(`shape surface ${shape} ${friction}/${restitution}`);
  };

  reset = () => {
    this.capsules.clear();
    this.slides.clear();
    this.nextBody = 1;
    this.nextShape = 1;
    this.log.push('reset');
  };

  /** The shapes on a body the engine still holds. */
  shapesOn(body: BodyId): ShapeId[] {
    return [...(this.capsules.get(body) ?? [])];
  }
}

const segment: Segment = { a: { x: 0, y: 0 }, b: { x: 40, y: 0 } };
const square = [
  { x: -10, y: -10 },
  { x: 10, y: -10 },
  { x: 10, y: 10 },
  { x: -10, y: 10 },
];

function setup() {
  const physics = new StubPhysics();
  const contacts = new ContactLedger<string>({
    getSlide: (body) => physics.slides.get(body) ?? null,
    touchNormal: () => null,
  });
  const materials = createMaterialTable();
  /** Each call to the gone hearer: what went, and what the ledger and engine held then. */
  const heard: { parties: PartyId[]; registered: boolean; log: string[] }[] = [];
  /** What it said happened. */
  const said: Happening[] = [];
  const bodies = new ArenaBodies<string>(
    physics,
    contacts,
    new Numbers(materials),
    (parties) => {
      heard.push({
        parties: [...parties],
        registered: [...parties].some((id) => contacts.party(id) !== undefined),
        log: [...physics.log],
      });
    },
    (happening) => said.push(happening),
  );
  bodies.addTerrain([square]);

  /** A Party of its own, with `target` as its name. */
  const own =
    (target: string, extra: Partial<Party<string>> = {}) =>
    (body: BodyId): Party<string> => {
      const id = bodies.newId();
      return { id, stroke: id, body, target, ...extra };
    };
  let things = 0;
  const line = () =>
    bodies.addLine(
      [segment],
      8,
      { kind: 'piece', colour: 'grey' },
      { thing: 'piece', id: ++things, index: 0 },
      own('line'),
    );
  const object = () =>
    bodies.addObject(
      { position: { x: 0, y: 0 }, parts: [square], frozen: true, mass: 1 },
      { kind: 'object', colour: 'blue' },
      square,
      { thing: 'object', id: ++things },
      own('object'),
    );
  const pebble = (extra: Partial<Party<string>> = {}) =>
    bodies.addCircle(
      { position: { x: 0, y: 0 }, radius: 6, mass: 1 },
      { kind: 'rubble', colour: 'grey' },
      { thing: 'rubble', id: ++things, colour: 'grey', radius: 6 },
      own('pebble', extra),
    );
  const patchOn = (host: PartyId, colour: 'green' | 'blue' = 'blue') => {
    const what: Thing = { thing: 'patch', id: ++things, colour, segment, thickness: 3 };
    return bodies.addShape(host, segment, 1.5, { kind: 'patch', colour }, what);
  };
  return { physics, contacts, materials, bodies, heard, said, line, object, pebble, patchOn };
}

describe('Arena bodies', () => {
  it('registers the Party of every body it adds', () => {
    const { contacts, line, object, pebble } = setup();

    const parties = [line(), object(), pebble()];

    for (const party of parties) expect(contacts.partyOf(party.body)).toBe(party);
    expect(contacts.party(TERRAIN_PARTY)?.target).toBeNull();
  });

  it('unregisters a body it removes, and every kind hears it went before the removal returns', () => {
    const { physics, contacts, bodies, heard, object } = setup();
    const box = object();

    bodies.removeBody(box.body, 'broke');

    expect(contacts.partyOf(box.body)).toBeUndefined();
    expect(heard).toEqual([
      { parties: [box.id], registered: false, log: expect.any(Array) as unknown },
    ]);
    // By the time "gone" is heard, the engine has removed the body.
    expect(heard[0]!.log.at(-1)).toBe(`remove body ${box.body}`);
    expect(physics.log.at(-1)).toBe(`remove body ${box.body}`);
  });

  it('does nothing to a body already gone, and tells no one again', () => {
    const { physics, bodies, heard, pebble } = setup();
    const { body } = pebble();
    bodies.removeBody(body, 'broke');
    const calls = physics.log.length;

    bodies.removeBody(body, 'broke');

    expect(physics.log).toHaveLength(calls);
    expect(heard).toHaveLength(1);
  });

  it('removes the Patch shapes on a host with it, and leaves those on others', () => {
    const { physics, bodies, line, object, patchOn } = setup();
    const host = object();
    const other = line();
    const onHost = patchOn(host.id, 'green')!;
    const onOther = patchOn(other.id, 'blue')!;
    expect(onHost.body).toBe(host.body);

    bodies.removeBody(host.body, 'broke');
    physics.log.length = 0;
    bodies.removeShape(onHost.shape, 'used-up'); // already gone with its host
    bodies.applySurfaces();

    expect(physics.shapesOn(host.body)).toEqual([]);
    expect(physics.shapesOn(other.body)).toEqual([onOther.shape]);
    expect(physics.log).not.toContain(`remove shape ${onHost.shape}`);
    expect(physics.log.filter((call) => call.startsWith('shape surface'))).toEqual([
      `shape surface ${onOther.shape} 0.1/0.9`,
    ]);
  });

  it('adds no shape on a host that is gone', () => {
    const { bodies, physics, pebble, patchOn } = setup();
    const rock = pebble();
    bodies.removeBody(rock.body, 'broke');
    const calls = physics.log.length;

    expect(patchOn(rock.id, 'blue')).toBeNull();
    expect(physics.log).toHaveLength(calls);
  });

  it('marks a sliding body Squeezed: its hits don’t count until its slide ends', () => {
    const { physics, contacts, bodies, object, line } = setup();
    const box = object();
    const floor = line();
    const hit = {
      bodyA: box.body,
      bodyB: floor.body,
      shapeA: 1 as ShapeId,
      shapeB: 2 as ShapeId,
      point: { x: 0, y: 0 },
      normal: { x: 0, y: 1 },
      speed: 500,
      impulse: 500,
    };
    const report: StepReport = { hits: [hit], begins: [], ends: [] };

    bodies.slideOut(box.body, { x: 0, y: -20 }, 250);
    contacts.step(report);
    expect(physics.log.at(-1)).toBe(`slide ${box.body}`);
    expect(contacts.hits).toEqual([]);

    physics.slides.delete(box.body); // the slide ends
    contacts.step(report);
    contacts.step(report);
    expect(contacts.hits.map(({ a, b }) => [a.target, b.target])).toEqual([['object', 'line']]);
  });

  it('knows the surface of every Party: where a Patch can be laid', () => {
    const { bodies, line, object, pebble } = setup();

    expect(bodies.surfaceOf(TERRAIN_PARTY)).toEqual({ kind: 'polygons', polygons: [square] });
    expect(bodies.surfaceOf(line().id)).toEqual({
      kind: 'capsules',
      segments: [segment],
      radius: 4,
    });
    expect(bodies.surfaceOf(object().id)).toEqual({ kind: 'polygons', polygons: [square] });
    expect(bodies.surfaceOf(pebble().id)).toEqual({ kind: 'circle', radius: 6 });
    // Nothing lands on a Droplet.
    expect(bodies.surfaceOf(pebble({ harmless: true }).id)).toBeNull();
    const gone = pebble();
    bodies.removeBody(gone.body, 'broke');
    expect(bodies.surfaceOf(gone.id)).toBeNull();
  });

  it('names what the query found, with its form, each once and in the order added', () => {
    const { physics, bodies, line, object, pebble, patchOn } = setup();
    const a = line();
    const b = object();
    const c = pebble({ harmless: true });
    const patch = patchOn(b.id)!;
    const terrainBody = 1 as BodyId; // the stub numbers bodies from 1, the Terrain first
    const own = (body: BodyId) => ({ body, shape: 999 as ShapeId });
    const onB = physics.shapesOn(b.body);

    // Found in any order, some more than once, with a body already gone.
    const gone = pebble();
    bodies.removeBody(gone.body, 'broke');
    const figures = bodies.figures([
      own(c.body),
      { body: b.body, shape: onB[0]! },
      own(b.body),
      own(gone.body),
      own(a.body),
      own(terrainBody),
      own(a.body),
    ]);

    expect(figures.map(({ what }) => what)).toEqual([
      null,
      { thing: 'piece', id: 1, index: 0 },
      { thing: 'object', id: 2 },
      { thing: 'rubble', id: 3, colour: 'grey', radius: 6 },
      { thing: 'patch', id: 4, colour: 'blue', segment, thickness: 3 },
    ]);
    expect(figures.map(({ body }) => body)).toEqual([terrainBody, a.body, b.body, c.body, b.body]);
    expect(figures.map(({ form }) => form)).toEqual([
      { kind: 'terrain', polygons: [square] },
      { kind: 'capsules', segments: [segment], radius: 4 },
      { kind: 'object', outline: square, parts: [square] },
      { kind: 'circle', radius: 6 },
      { kind: 'capsule', segment, radius: 1.5 },
    ]);
    expect(patch.shape).toBe(onB[0]);
  });

  it('re-applies every body’s and Patch shape’s surface from the table after an edit', () => {
    const { physics, materials, bodies, line, object, pebble, patchOn } = setup();
    const a = line();
    const b = object();
    const c = pebble();
    const patch = patchOn(b.id, 'green')!;
    materials.colours.grey.line.friction = 0.2;
    materials.colours.blue.outline.restitution = 0.5;
    materials.colours.green.line.restitution = 0.3;
    physics.log.length = 0;

    bodies.applySurfaces();

    // In the order they were added; the Terrain's never changes.
    expect(physics.log).toEqual([
      `surface ${a.body} 0.2/0.1`,
      `surface ${b.body} 0.1/0.5`,
      `surface ${c.body} 0.6/0.1`,
      `shape surface ${patch.shape} 0.6/0.3`,
    ]);
  });

  it('makes its engine calls in a fixed order', () => {
    const { physics, bodies, line, object, pebble, patchOn } = setup();

    const a = line();
    const b = object();
    const patch = patchOn(b.id, 'blue')!;
    const c = pebble();
    bodies.slideOut(b.body, { x: 0, y: -10 }, 250);
    bodies.removeShape(patch.shape, 'used-up');
    bodies.removeBody(a.body, 'broke');
    bodies.clear();

    expect(physics.log).toEqual([
      'add terrain 1',
      `add line ${a.body}`,
      `add object ${b.body}`,
      `add shape ${patch.shape} on ${b.body}`,
      `add circle ${c.body}`,
      `slide ${b.body}`,
      `remove shape ${patch.shape}`,
      `remove body ${a.body}`,
      `remove body ${b.body}`,
      `remove body ${c.body}`,
    ]);
  });

  it('clears every shape and body but the Terrain, telling no one', () => {
    const { physics, contacts, bodies, heard, object, patchOn } = setup();
    const box = object();
    const onTerrain = patchOn(TERRAIN_PARTY, 'blue')!;
    physics.log.length = 0;

    bodies.clear();

    expect(physics.log).toEqual([`remove shape ${onTerrain.shape}`, `remove body ${box.body}`]);
    expect(heard).toEqual([]);
    expect(contacts.partyOf(box.body)).toBeUndefined();
    expect(contacts.party(TERRAIN_PARTY)).toBeDefined();
  });

  it('says what it added, and what went and why, with where its body was', () => {
    const { bodies, said, object, pebble, patchOn } = setup();
    const box = object();
    const rock = pebble();
    patchOn(box.id);
    const onRock = patchOn(rock.id)!;

    bodies.removeShape(onRock.shape, 'used-up');
    bodies.removeBody(rock.body, 'capped');
    bodies.removeBody(box.body, 'broke');

    const [boxThing, rockThing, onBox, onRockThing] = said
      .slice(0, 4)
      .map((h) => (h.kind === 'added' ? h.what : null));
    expect(said.slice(0, 4).map((h) => h.kind)).toEqual(['added', 'added', 'added', 'added']);
    expect([boxThing?.thing, rockThing?.thing, onBox?.thing, onRockThing?.thing]).toEqual([
      'object',
      'rubble',
      'patch',
      'patch',
    ]);
    const went = (what: Thing | null | undefined, why: string, body: BodyId) => ({
      kind: 'went',
      what,
      why,
      transform: { x: body, y: 0, angle: 0 },
      velocity: { x: 0, y: 5 },
    });
    expect(said.slice(4)).toEqual([
      // A Patch goes where its host is, moving as its host moves.
      went(onRockThing, 'used-up', rock.body),
      went(rockThing, 'capped', rock.body),
      // The shapes on a body go first, with their host.
      went(onBox, 'with-host', box.body),
      went(boxThing, 'broke', box.body),
    ]);
  });

  it('says nothing for the Terrain, for what is already gone, or on Clear and reset', () => {
    const { bodies, said, object, patchOn } = setup();
    const box = object();
    patchOn(TERRAIN_PARTY);
    bodies.removeBody(box.body, 'broke');
    const before = said.length;

    bodies.removeBody(box.body, 'broke');
    patchOn(box.id);
    object();
    const after = said.length;
    bodies.clear();
    bodies.reset({ settled: [] });

    expect(said.slice(0, before).map((h) => h.kind)).toEqual(['added', 'added', 'went']);
    expect(after).toBe(before + 1); // the second Object
    expect(said).toHaveLength(after);
  });

  it('forgets every body on a reset, so the rebuild adds them all again', () => {
    const { physics, contacts, bodies, heard, object } = setup();
    const box = object();

    bodies.reset({ settled: [] });
    bodies.removeBody(box.body, 'broke');

    expect(physics.log.slice(-1)).toEqual(['reset']);
    expect(contacts.partyOf(box.body)).toBeUndefined();
    expect(bodies.surfaceOf(box.id)).toBeNull();
    expect(heard).toEqual([]);
  });
});
