import { describe, expect, it } from 'vitest';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import { createMaterialTable } from '../materials/material-table';
import type { BodyId, ShapeId, StepReport, Surface } from '../physics';
import { ArenaBodies, type BodiesPhysics } from './arena-bodies';
import { ContactLedger, TERRAIN_PARTY, type Party, type PartyId } from './contact-ledger';

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

  addTerrain = () => this.add('terrain');
  addLine = () => this.add('line');
  addObject = () => this.add('object');
  addCircle = () => this.add('circle');

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
  });
  const materials = createMaterialTable();
  /** Each call to the gone hearer: what went, and what the ledger and engine held then. */
  const heard: { parties: PartyId[]; registered: boolean; log: string[] }[] = [];
  const bodies = new ArenaBodies<string>(physics, contacts, materials, (parties) => {
    heard.push({
      parties: [...parties],
      registered: [...parties].some((id) => contacts.party(id) !== undefined),
      log: [...physics.log],
    });
  });
  bodies.addTerrain([square]);

  /** A Party of its own, with `target` as its name. */
  const own =
    (target: string, extra: Partial<Party<string>> = {}) =>
    (body: BodyId): Party<string> => {
      const id = bodies.newId();
      return { id, stroke: id, body, target, ...extra };
    };
  const line = () => bodies.addLine([segment], 8, 'grey', own('line'));
  const object = () =>
    bodies.addObject(
      { position: { x: 0, y: 0 }, parts: [square], frozen: true, mass: 1 },
      'blue',
      square,
      own('object'),
    );
  const pebble = (extra: Partial<Party<string>> = {}) =>
    bodies.addCircle(
      { position: { x: 0, y: 0 }, radius: 6, mass: 1 },
      { colour: 'grey', role: 'outline' },
      own('pebble', extra),
    );
  return { physics, contacts, materials, bodies, heard, line, object, pebble };
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

    bodies.removeBody(box.body);

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
    bodies.removeBody(body);
    const calls = physics.log.length;

    bodies.removeBody(body);

    expect(physics.log).toHaveLength(calls);
    expect(heard).toHaveLength(1);
  });

  it('removes the Patch shapes on a host with it, and leaves those on others', () => {
    const { physics, bodies, line, object } = setup();
    const host = object();
    const other = line();
    const onHost = bodies.addShape(host.id, segment, 1.5, 'green')!;
    const onOther = bodies.addShape(other.id, segment, 1.5, 'blue')!;
    expect(onHost.body).toBe(host.body);

    bodies.removeBody(host.body);
    physics.log.length = 0;
    bodies.removeShape(onHost.shape); // already gone with its host
    bodies.applySurfaces();

    expect(physics.shapesOn(host.body)).toEqual([]);
    expect(physics.shapesOn(other.body)).toEqual([onOther.shape]);
    expect(physics.log).not.toContain(`remove shape ${onHost.shape}`);
    expect(physics.log.filter((call) => call.startsWith('shape surface'))).toEqual([
      `shape surface ${onOther.shape} 0.1/0.9`,
    ]);
  });

  it('adds no shape on a host that is gone', () => {
    const { bodies, physics, pebble } = setup();
    const rock = pebble();
    bodies.removeBody(rock.body);
    const calls = physics.log.length;

    expect(bodies.addShape(rock.id, segment, 1.5, 'blue')).toBeNull();
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
    bodies.removeBody(gone.body);
    expect(bodies.surfaceOf(gone.id)).toBeNull();
  });

  it('re-applies every body’s and Patch shape’s surface from the table after an edit', () => {
    const { physics, materials, bodies, line, object, pebble } = setup();
    const a = line();
    const b = object();
    const c = pebble();
    const patch = bodies.addShape(b.id, segment, 1.5, 'green')!;
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
    const { physics, bodies, line, object, pebble } = setup();

    const a = line();
    const b = object();
    const patch = bodies.addShape(b.id, segment, 1.5, 'blue')!;
    const c = pebble();
    bodies.slideOut(b.body, { x: 0, y: -10 }, 250);
    bodies.removeShape(patch.shape);
    bodies.removeBody(a.body);
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
    const { physics, contacts, bodies, heard, object } = setup();
    const box = object();
    const onTerrain = bodies.addShape(TERRAIN_PARTY, segment, 1.5, 'blue')!;
    physics.log.length = 0;

    bodies.clear();

    expect(physics.log).toEqual([`remove shape ${onTerrain.shape}`, `remove body ${box.body}`]);
    expect(heard).toEqual([]);
    expect(contacts.partyOf(box.body)).toBeUndefined();
    expect(contacts.party(TERRAIN_PARTY)).toBeDefined();
  });

  it('forgets every body on a reset, so the rebuild adds them all again', () => {
    const { physics, contacts, bodies, heard, object } = setup();
    const box = object();

    bodies.reset({ settled: [] });
    bodies.removeBody(box.body);

    expect(physics.log.slice(-1)).toEqual(['reset']);
    expect(contacts.partyOf(box.body)).toBeUndefined();
    expect(bodies.surfaceOf(box.id)).toBeNull();
    expect(heard).toEqual([]);
  });
});
