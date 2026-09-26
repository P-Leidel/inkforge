import { describe, expect, it } from 'vitest';
import type { Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import {
  createMaterialTable,
  DEFAULT_MATERIAL_TABLE,
  type MaterialTable,
} from '../materials/material-table';
import type { BodyId, ShapeId } from '../physics';
import { blastSize, blastStrength, pieceBlastSize, type Reach } from './blasts';
import { TERRAIN_PARTY, type NewContact, type Party, type PartyHit } from './contact-ledger';
import { fuseBurns, impactDamage, wakes, wear, type Breakable } from './material-rules';
import { fakePatch, fakeRules } from './rules-test-support';
import { WAITING, type Sticker } from './sticking';
import type { Broken } from './strokes';

describe('The damage rule', () => {
  it('deals the impulse above the threshold, times k', () => {
    expect(impactDamage(1000, 400, 1)).toBe(600);
    expect(impactDamage(1000, 400, 0.5)).toBe(300);
  });

  it('deals nothing at or below the threshold', () => {
    expect(impactDamage(400, 400, 1)).toBe(0);
    expect(impactDamage(100, 400, 1)).toBe(0);
  });
});

/** The impact phase of the Material rules, fed hand-made hits as the Contact ledger gives them. */
function impactRules(materials: MaterialTable) {
  const { rules, contacts } = fakeRules<Breakable>(materials);
  return {
    impacts(hits: PartyHit<Breakable>[]): Breakable[] {
      contacts.hits = hits;
      return rules.impacts();
    },
  };
}

describe('Material rules: impacts', () => {
  const table = createMaterialTable();
  table.colours.grey.outline.damageThreshold = 400;
  table.colours.black.outline.damageThreshold = 2000;
  table.colours.blue.outline.damageThreshold = 200;
  table.colours.blue.outline.impactLimit = 3;
  table.damagePerImpulse = 1;

  const breakable = (colour: Colour): Breakable => ({
    colour,
    role: 'outline',
    damage: 0,
    impacts: 0,
  });
  /** A Party with the given id, of its own Stroke unless one is given. */
  const party = (id: number, target: Breakable | null, stroke: number = id): Party<Breakable> => ({
    id,
    stroke,
    body: (id + 100) as BodyId,
    target,
  });
  const TERRAIN = party(TERRAIN_PARTY, null);

  /** Hits between the parties by their place in `parties`, as the Contact ledger gives them. */
  function setup(parties: Party<Breakable>[]) {
    const hit = (a: number, b: number, impulse: number): PartyHit<Breakable> => ({
      a: parties[a]!,
      b: parties[b]!,
      hit: {
        bodyA: parties[a]!.body,
        bodyB: parties[b]!.body,
        shapeA: (a * 10) as ShapeId,
        shapeB: (b * 10) as ShapeId,
        point: { x: 0, y: 0 },
        normal: { x: 0, y: 1 },
        speed: 500,
        impulse,
      },
    });
    return { hit };
  }

  it('checks both sides against their own threshold', () => {
    const grey = breakable('grey');
    const black = breakable('black');
    const rules = impactRules(table);
    const { hit } = setup([party(1, grey), party(2, black)]);

    rules.impacts([hit(0, 1, 1000)]);

    expect(grey.damage).toBe(600);
    expect(black.damage).toBe(0);
  });

  it('never damages Terrain, and Terrain damages what hits it', () => {
    const grey = breakable('grey');
    const rules = impactRules(table);
    const { hit } = setup([TERRAIN, party(1, grey)]);

    rules.impacts([hit(0, 1, 900)]);

    expect(grey.damage).toBe(500);
  });

  it('counts two shapes of the same two bodies hitting in one step as one impact', () => {
    const blue = breakable('blue');
    const rules = impactRules(table);
    const { hit } = setup([TERRAIN, party(1, blue)]);

    rules.impacts([hit(0, 1, 500), hit(0, 1, 300)]);

    expect(blue.impacts).toBe(1);
    expect(blue.damage).toBe(300);
  });

  it('breaks a blue Breakable on its third impact above the threshold', () => {
    const blue = breakable('blue');
    const rules = impactRules(table);
    const { hit } = setup([TERRAIN, party(1, blue)]);

    const broken = [250, 150, 250, 250].map(
      (impulse) => rules.impacts([hit(0, 1, impulse)]).length,
    );

    expect(broken).toEqual([0, 0, 0, 1]);
    expect(blue.impacts).toBe(3);
    expect(wear(blue, table)).toBe(1);
  });

  it('breaks a Breakable when its damage reaches its durability', () => {
    const grey = breakable('grey');
    const rules = impactRules(table);
    const { hit } = setup([TERRAIN, party(1, grey)]);
    const durability = table.colours.grey.outline.durability;

    const first = rules.impacts([hit(0, 1, 400 + durability - 1)]);
    const second = rules.impacts([hit(0, 1, 401)]);

    expect(first).toEqual([]);
    expect(second).toEqual([grey]);
  });

  it("damages a Piece against its Line's numbers, not its Outline's", () => {
    const lines = createMaterialTable();
    lines.colours.grey.line.damageThreshold = 100;
    lines.colours.grey.line.durability = 500;
    const piece: Breakable = { colour: 'grey', role: 'line', damage: 0, impacts: 0 };
    const rules = impactRules(lines);
    const { hit } = setup([party(2, piece, 1), TERRAIN]);

    expect(rules.impacts([hit(0, 1, 350)])).toEqual([]);
    expect(piece.damage).toBe(250);
    expect(wear(piece, lines)).toBe(0.5);

    expect(rules.impacts([hit(0, 1, 350)])).toEqual([piece]);
  });

  it('never breaks a blue Piece by counting impacts: only damage wears it', () => {
    const piece: Breakable = { colour: 'blue', role: 'line', damage: 0, impacts: 0 };
    const rules = impactRules(table);
    const { hit } = setup([party(2, piece, 1), TERRAIN]);
    const threshold = table.colours.blue.line.damageThreshold;

    for (let k = 0; k < 4; k++) rules.impacts([hit(0, 1, threshold + 10)]);

    expect(piece.damage).toBe(40);
    expect(wear(piece, table)).toBeLessThan(1);
  });

  it("counts one Line's Pieces hit in one step as one impact on what hit them", () => {
    const grey = breakable('grey');
    const left: Breakable = { colour: 'grey', role: 'line', damage: 0, impacts: 0 };
    const right: Breakable = { colour: 'grey', role: 'line', damage: 0, impacts: 0 };
    const rules = impactRules(table);
    // Line 2 has no body; Pieces 3 and 4 are its Pieces.
    const { hit } = setup([party(1, grey), party(3, left, 2), party(4, right, 2)]);

    rules.impacts([hit(0, 1, 1000), hit(0, 2, 900)]);

    expect(grey.damage).toBe(600);
    expect(grey.impacts).toBe(1);
    expect(left.damage).toBe(600);
    expect(right.damage).toBe(500);
  });
});

/** A 60 px square about the origin: an Object's Outline, 3600 px². */
const SQUARE: Polygon = [
  { x: -30, y: -30 },
  { x: 30, y: -30 },
  { x: 30, y: 30 },
  { x: -30, y: 30 },
];

/** What breaking an Object at (100, 200) lets out, with its Outline and Fill Colours. */
function brokenObject(outline: Colour, fill: Colour | null): Broken {
  const centre = { x: 100, y: 200 };
  return {
    debris: { outline: SQUARE, velocity: { x: 0, y: 0 }, colours: [outline] },
    fill: fill && {
      colour: fill,
      mass: 2,
      outline: SQUARE,
      from: {
        transform: { ...centre, angle: 0 },
        velocity: { x: 0, y: 0 },
        angularVelocity: 0,
      },
    },
    outline: { colour: outline, length: 240, centre },
    piece: null,
  };
}

/** What breaking a Piece of `colour` centred at (100, 200) lets out. */
function brokenPiece(colour: Colour): Broken {
  return {
    debris: { outline: SQUARE, velocity: { x: 0, y: 0 }, colours: [colour] },
    fill: null,
    outline: null,
    piece: { colour, centre: { x: 100, y: 200 } },
  };
}

/** A Party whose body is its id, of its own Stroke. */
const partyOf = (id: number, target: Breakable | null, harmless = false): Party<Breakable> => ({
  id,
  stroke: id,
  body: id as BodyId,
  target,
  ...(harmless && { harmless }),
});

describe('Material rules: breaking', () => {
  const table = createMaterialTable();
  const object = (colour: Colour): Breakable => ({
    colour,
    role: 'outline',
    damage: 0,
    impacts: 0,
  });

  /** Breaks `target`, which lets out `broken`, as a hit that broke it would. */
  function breakOne(broken: Broken | null, materials = table) {
    const fake = fakeRules<Breakable>(materials);
    const target = object(broken?.outline?.colour ?? 'grey');
    if (broken) fake.arena.breaks.set(target, broken);
    fake.contacts.hits = [
      {
        a: partyOf(TERRAIN_PARTY, null),
        b: partyOf(1, target),
        hit: {
          bodyA: TERRAIN_PARTY as BodyId,
          bodyB: 1 as BodyId,
          shapeA: 1 as ShapeId,
          shapeB: 2 as ShapeId,
          point: { x: 0, y: 0 },
          normal: { x: 0, y: 1 },
          speed: 500,
          impulse: 1e6,
        },
      },
    ];
    const hit = fake.rules.impacts();
    const before = [...fake.arena.done];
    fake.rules.breakAll(hit);
    return { ...fake, target, hit, before };
  }

  it('breaks only when told to, after sticking and landing, what the hits broke', () => {
    const { hit, target, before, arena } = breakOne(brokenObject('grey', null));

    expect(hit).toEqual([target]);
    expect(before).toEqual([]);
    expect(arena.handed('break')).toEqual([target]);
  });

  it('bursts the Debris, then lets out the Fill, then starts the Blast', () => {
    const { arena } = breakOne(brokenObject('red', 'black'));

    expect(arena.done).toEqual(['break', 'burst', 'rubble', 'blast']);
  });

  it('lets a grey or black Fill out as Rubble, at most its rubbleMax, kicked from the Object', () => {
    const few = createMaterialTable();
    few.colours.grey.fill.rubbleMax = 3;
    const { arena } = breakOne(brokenObject('grey', 'grey'), few);

    const [rubble] = arena.handed('rubble') as { colour: Colour; motion: { velocity: Vec2 } }[][];
    expect(arena.done).toEqual(['break', 'burst', 'rubble']);
    expect(rubble!.length).toBeGreaterThan(0);
    expect(rubble!.length).toBeLessThanOrEqual(3);
    expect(rubble!.every(({ colour }) => colour === 'grey')).toBe(true);
    expect(
      rubble!.every(({ motion }) => Math.hypot(motion.velocity.x, motion.velocity.y) > 0),
    ).toBe(true);
  });

  it('lets a Fill Colour that spills out as a Spill of Droplets', () => {
    const { arena } = breakOne(brokenObject('grey', 'blue'));

    const [droplets] = arena.handed('droplets') as { colour: Colour }[][];
    expect(arena.done).toEqual(['break', 'burst', 'droplets']);
    expect(droplets!.length).toBeGreaterThanOrEqual(table.dropletsMin);
    expect(droplets!.length).toBeLessThanOrEqual(table.dropletsMax);
    expect(droplets!.every(({ colour }) => colour === 'blue')).toBe(true);
  });

  it('lets a red Fill out as a Blast of its ink, with no Rubble', () => {
    const { arena } = breakOne(brokenObject('grey', 'red'));

    expect(arena.handed('rubble').flat()).toEqual([]);
    expect(arena.handed('blast')).toEqual([
      { centre: { x: 100, y: 200 }, size: blastSize(3600, table) },
    ]);
  });

  it('lets out nothing from a Fill that neither spills, explodes nor has Rubble', () => {
    const none = createMaterialTable();
    none.colours.black.fill.rubbleMax = 0;
    const { arena } = breakOne(brokenObject('grey', 'black'), none);

    expect(arena.handed('rubble').flat()).toEqual([]);
    expect(arena.handed('droplets')).toEqual([]);
    expect(arena.handed('blast')).toEqual([]);
  });

  it('only bursts Debris from a Piece that doesn’t explode, and does nothing for what is already gone', () => {
    expect(breakOne(brokenPiece('grey')).arena.done).toEqual(['break', 'burst']);
    expect(breakOne(null).arena.done).toEqual(['break']);
  });

  it('starts a Blast of the fixed Piece size at a red Piece’s centre, after its Debris', () => {
    const { arena } = breakOne(brokenPiece('red'));

    expect(arena.done).toEqual(['break', 'burst', 'blast']);
    expect(arena.handed('blast')).toEqual([
      { centre: { x: 100, y: 200 }, size: { reach: 100, strength: 2400 } },
    ]);
  });

  it('sizes a Piece’s Blast by the table, whatever its Line Colour’s ink', () => {
    const tuned = createMaterialTable();
    tuned.blast.pieceRadius = 70;
    tuned.blast.pieceStrength = 900;
    tuned.colours.grey.line.explodes = 1;

    const { arena } = breakOne(brokenPiece('grey'), tuned);

    expect(arena.handed('blast')).toEqual([
      { centre: { x: 100, y: 200 }, size: pieceBlastSize(tuned) },
    ]);
    expect(pieceBlastSize(tuned)).toEqual({ reach: 70, strength: 900 });
  });
});

describe('Material rules: a Blast arriving', () => {
  const table = createMaterialTable();
  table.damagePerImpulse = 1;
  table.wakeSpeed = 100;
  table.blast.push = 1;
  table.blast.maxPushSpeed = 500;
  const CENTRE = { x: 0, y: 0 };

  const target = (colour: Colour, role: 'line' | 'outline' = 'outline'): Breakable => ({
    colour,
    role,
    damage: 0,
    impacts: 0,
  });
  /** The Blast reaching `party` at `point` with `strength`. */
  const reach = (party: Party<Breakable>, strength: number, point: Vec2 = { x: 30, y: 40 }) =>
    ({ party, centre: CENTRE, point, strength }) satisfies Reach<Breakable>;

  it('damages what it reaches above its own threshold, and never counts an impact', () => {
    const { rules, physics } = fakeRules<Breakable>(table);
    const blue = target('blue');
    const { damageThreshold } = table.colours.blue.outline;
    physics.add(1, { frozen: true, free: false, mass: 1e6 });

    rules.blastReached([reach(partyOf(1, blue), damageThreshold)]);
    expect(blue.damage).toBe(0);
    for (let k = 0; k < 5; k++)
      rules.blastReached([reach(partyOf(1, blue), damageThreshold + 100)]);

    expect(blue.damage).toBe(500);
    expect(blue.impacts).toBe(0);
  });

  it('wakes a Frozen Object when its push over its mass beats the wake speed, and pushes it outward', () => {
    const { rules, physics } = fakeRules<Breakable>(table);
    // A push of 300: 150 px/s for the light one, 60 px/s for the heavy one.
    physics.add(1, { frozen: true, free: false, mass: 2 });
    physics.add(2, { frozen: true, free: false, mass: 5 });

    rules.blastReached([
      reach(partyOf(1, target('grey')), 300),
      reach(partyOf(2, target('grey')), 300),
    ]);

    expect(physics.log).toEqual(['release 1', 'impulse 1']);
    expect(physics.body(1 as BodyId).velocity.x).toBeCloseTo(150 * 0.6, 9);
    expect(physics.body(1 as BodyId).velocity.y).toBeCloseTo(150 * 0.8, 9);
    expect(physics.body(2 as BodyId).frozen).toBe(true);
  });

  it('names the wake measure: a push over mass beating the wake speed', () => {
    expect(wakes(300, 2, 100)).toBe(true);
    expect(wakes(200, 2, 100)).toBe(false);
  });

  it('never changes a body’s speed by more than maxPushSpeed', () => {
    const { rules, physics } = fakeRules<Breakable>(table);
    physics.add(1, { mass: 0.1 });

    rules.blastReached([reach(partyOf(1, null), 1000)]);

    const { velocity } = physics.body(1 as BodyId);
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(500, 9);
  });

  it('pushes a body it started inside away from the body’s centre, or else straight up', () => {
    const { rules, physics } = fakeRules<Breakable>(table);
    physics.add(1, { transform: { x: 0, y: 20, angle: 0 } });
    physics.add(2);

    rules.blastReached([reach(partyOf(1, null), 10, CENTRE), reach(partyOf(2, null), 10, CENTRE)]);

    expect(physics.body(1 as BodyId).velocity).toEqual({ x: 0, y: 10 });
    expect(physics.body(2 as BodyId).velocity).toEqual({ x: 0, y: -10 });
  });

  it('leaves a Squeezed Object sliding off a Line alone', () => {
    const { rules, physics, arena } = fakeRules<Breakable>(table);
    const squeezed = target('red');
    physics.add(1, { free: false, slide: { x: 0, y: -12 } });

    rules.blastReached([reach(partyOf(1, squeezed), 1e6)]);

    expect(squeezed.damage).toBe(0);
    expect(physics.log).toEqual([]);
    expect(arena.done).toEqual([]);
  });

  it('only damages a Piece, which is fixed', () => {
    const { rules, physics } = fakeRules<Breakable>(table);
    const piece = target('grey', 'line');
    physics.add(1, { free: false });

    rules.blastReached([reach(partyOf(1, piece), 500)]);

    expect(piece.damage).toBe(500 - table.colours.grey.line.damageThreshold);
    expect(physics.log).toEqual([]);
  });

  it('breaks what it broke once it has pushed everything else it reached, without pushing it', () => {
    const { rules, physics, arena } = fakeRules<Breakable>(table);
    const weak = target('red');
    arena.breaks.set(weak, brokenObject('red', null));
    physics.add(1, { mass: 1 });
    physics.add(2, { mass: 1 });
    const pushedFirst: string[] = [];
    const breakIt = arena.break.bind(arena);
    arena.break = (broken) => {
      pushedFirst.push(...physics.log);
      return breakIt(broken);
    };

    rules.blastReached([reach(partyOf(1, weak), 1000), reach(partyOf(2, null), 10)]);

    expect(pushedFirst).toEqual(['impulse 2']);
    expect(physics.body(1 as BodyId).velocity).toEqual({ x: 0, y: 0 });
    // Red set off by a Blast explodes in turn.
    expect(arena.done).toEqual(['break', 'burst', 'blast']);
  });
});

describe('The fuse', () => {
  const TABLE = DEFAULT_MATERIAL_TABLE;

  it('burns: with the default table, a red Piece’s Blast destroys a red Piece 48 px away', () => {
    const { damageThreshold, durability } = TABLE.colours.red.line;
    const at48 = blastStrength(pieceBlastSize(TABLE), 48);

    expect(TABLE.pieceLength).toBe(48);
    expect(fuseBurns('red', TABLE)).toBe(true);
    expect(impactDamage(at48, damageThreshold, TABLE.damagePerImpulse)).toBeGreaterThanOrEqual(
      durability,
    );
  });

  it('destroys a red Piece that close through the Blast rule, in one go', () => {
    const { rules, physics, arena } = fakeRules<Breakable>(TABLE);
    const next: Breakable = { colour: 'red', role: 'line', damage: 0, impacts: 0 };
    arena.breaks.set(next, brokenPiece('red'));
    physics.add(1, { free: false });

    rules.blastReached([
      {
        party: partyOf(1, next),
        centre: { x: 0, y: 0 },
        point: { x: 48, y: 0 },
        strength: blastStrength(pieceBlastSize(TABLE), 48),
      },
    ]);

    expect(arena.done).toEqual(['break', 'burst', 'blast']);
  });

  it('goes out when a tuning change weakens the Piece Blast or toughens red Lines', () => {
    const weak = createMaterialTable();
    weak.blast.pieceStrength /= 2;
    const small = createMaterialTable();
    small.blast.pieceRadius = 60;
    const tough = createMaterialTable();
    tough.colours.red.line.durability *= 4;

    expect(fuseBurns('red', weak)).toBe(false);
    expect(fuseBurns('red', small)).toBe(false);
    expect(fuseBurns('red', tough)).toBe(false);
  });

  it('never burns a Line Colour that doesn’t explode', () => {
    expect(fuseBurns('grey', TABLE)).toBe(false);
    expect(fuseBurns('black', TABLE)).toBe(false);
  });
});

describe('Material rules: sticking', () => {
  const table = createMaterialTable();
  type Box = Sticker & { readonly name: string };
  const pair = (bodyA: number, bodyB: number) => ({
    bodyA: bodyA as BodyId,
    bodyB: bodyB as BodyId,
    shapeA: bodyA as ShapeId,
    shapeB: bodyB as ShapeId,
  });
  const contact = (a: Party<Breakable>, b: Party<Breakable>): NewContact<Breakable> => ({
    a,
    b,
    pair: pair(a.id, b.id),
  });

  /** A green box that has just been let go: free after two steps, it may stick. */
  function letGo(colour: Colour = 'green') {
    const fake = fakeRules<Breakable, Box>(table);
    const box: Box = { name: 'box', colour, body: fake.physics.add(1), sticking: WAITING };
    fake.rules.stick([box], 1 / 60);
    fake.rules.stick([box], 1 / 60);
    return { ...fake, box };
  }

  it('sticks to its first new contact, where the two touched, and only once', () => {
    const { rules, contacts, physics, arena, box } = letGo();
    const host = partyOf(2, null);
    const other = partyOf(3, null);
    contacts.newContacts = [contact(partyOf(1, null), host), contact(other, partyOf(1, null))];
    physics.touchPoints.set(contacts.newContacts[0]!.pair, { x: 5, y: 6 });

    rules.stick([box], 1 / 60);
    contacts.newContacts = [contact(other, partyOf(1, null))];
    rules.stick([box], 1 / 60);

    expect(arena.handed('bond')).toEqual([{ sticker: box, host, point: { x: 5, y: 6 } }]);
    expect(box.sticking).toEqual({ state: 'done' });
  });

  it('never counts a harmless Party, such as a Droplet', () => {
    const { rules, contacts, physics, arena, box } = letGo();
    physics.body(1 as BodyId).transform = { x: 7, y: 8, angle: 0 };
    contacts.newContacts = [contact(partyOf(9, null, true), partyOf(1, null))];

    rules.stick([box], 1 / 60);
    expect(arena.handed('bond')).toEqual([]);

    const host = partyOf(2, null);
    contacts.newContacts = [contact(partyOf(1, null), host)];
    rules.stick([box], 1 / 60);

    // With no touch point, where the box is.
    expect(arena.handed('bond')).toEqual([{ sticker: box, host, point: { x: 7, y: 8, angle: 0 } }]);
  });

  it('never sticks an Object whose Outline doesn’t stick', () => {
    const { rules, contacts, arena, box } = letGo('grey');
    contacts.newContacts = [contact(partyOf(1, null), partyOf(2, null))];

    rules.stick([box], 1 / 60);

    expect(arena.handed('bond')).toEqual([]);
  });
});

describe('Material rules: Droplets landing and Patch wear', () => {
  const table = createMaterialTable();
  const surface = { kind: 'circle', radius: 10 } as const;

  function spill() {
    const fake = fakeRules<Breakable>(table);
    for (const body of [5, 6]) {
      fake.arena.droplets.set(body as BodyId, {
        colour: 'blue',
        length: 12,
        centre: { x: body, y: 0 },
      });
    }
    fake.arena.surfaces.set(2, surface);
    return fake;
  }
  const droplet = (id: number) => partyOf(id, null, true);
  const contact = (a: Party<Breakable>, b: Party<Breakable>): NewContact<Breakable> => ({
    a,
    b,
    pair: {
      bodyA: a.body,
      bodyB: b.body,
      shapeA: a.id as ShapeId,
      shapeB: b.id as ShapeId,
    },
  });

  it('lands a Droplet at its first new contact with something not harmless, and lays its Patch there', () => {
    const { rules, contacts, arena } = spill();
    const host = partyOf(2, null);
    contacts.newContacts = [
      contact(droplet(5), droplet(6)),
      contact(host, droplet(5)),
      contact(droplet(5), partyOf(3, null)),
    ];

    rules.land();

    expect(arena.done).toEqual(['land', 'patch']);
    expect(arena.handed('patch')).toEqual([
      { landing: { colour: 'blue', length: 12, centre: { x: 5, y: 0 }, host }, surface },
    ]);
    expect(arena.isDroplet(6 as BodyId)).toBe(true);
  });

  it('lands every Droplet before laying any Patch, and lays none where there is no surface', () => {
    const { rules, contacts, arena } = spill();
    contacts.newContacts = [
      contact(droplet(5), partyOf(2, null)),
      contact(droplet(6), partyOf(4, null)),
    ];

    rules.land();

    expect(arena.done).toEqual(['land', 'land', 'patch']);
  });

  it('wears a Patch by each hit on it, times its Colour’s patchHitWear, but not by a Droplet’s', () => {
    const { rules, contacts, arena } = spill();
    const blue = fakePatch('blue', 2, 102);
    const green = fakePatch('green', 2, 103);
    arena.patches.set(blue.shape, blue);
    arena.patches.set(green.shape, green);
    const hit = (a: Party<Breakable>, shapeA: number, impulse: number): PartyHit<Breakable> => ({
      a,
      b: partyOf(2, null),
      hit: {
        bodyA: a.body,
        bodyB: 2 as BodyId,
        shapeA: shapeA as ShapeId,
        shapeB: (shapeA === 1 ? 102 : 103) as ShapeId,
        point: { x: 0, y: 0 },
        normal: { x: 0, y: 1 },
        speed: 100,
        impulse,
      },
    });
    contacts.hits = [
      hit(partyOf(1, null), 1, 300),
      hit(droplet(5), 5, 300),
      hit(partyOf(3, null), 3, 50),
    ];

    rules.land();

    expect(blue.used).toBe(300 * table.colours.blue.fill.patchHitWear);
    expect(green.used).toBe(50 * table.colours.green.fill.patchHitWear);
  });
});
