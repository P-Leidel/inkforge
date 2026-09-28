import { describe, expect, it } from 'vitest';
import type { Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { fillInk, outlineInk } from '../materials/ink';
import { createEnemyTable } from '../materials/enemy-table';
import {
  createMaterialTable,
  DEFAULT_MATERIAL_TABLE,
  type MaterialTable,
} from '../materials/material-table';
import type { BodyId, ShapeId } from '../physics';
import { blastSize, blastStrength, pieceBlastSize, type Reach } from './blasts';
import { TERRAIN_PARTY, type NewContact, type Party, type PartyHit } from './contact-ledger';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { drawDrop, type DropInk } from './drops';
import type { Walker } from './enemies';
import {
  fuseBurns,
  impactDamage,
  isFloor,
  isPressed,
  STEEPEST_FLOOR,
  wakes,
  type Broken,
} from './material-rules';
import { Numbers, type Breakable } from './numbers';
import { Random } from './random';
import { fakePatch, fakeRules } from './rules-test-support';
import { WAITING, type Sticker } from './sticking';

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

/** A step of the Material rules. */
const STEP = 1 / 60;

/** The Material rules, stepped with hand-made hits as the Contact ledger gives them. */
function impactRules(materials: MaterialTable) {
  const { rules, contacts, arena } = fakeRules<Breakable>(materials);
  return {
    /** Steps the rules with `hits`, and says what they broke in that step. */
    impacts(hits: PartyHit<Breakable>[]): Breakable[] {
      contacts.hits = hits;
      const before = arena.handed('break').length;
      rules.step(STEP);
      return arena.handed('break').slice(before) as Breakable[];
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
    kind: 'object',
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
    expect(new Numbers(table).wear(blue)).toBe(1);
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
    const piece: Breakable = { kind: 'piece', colour: 'grey', damage: 0, impacts: 0 };
    const rules = impactRules(lines);
    const { hit } = setup([party(2, piece, 1), TERRAIN]);

    expect(rules.impacts([hit(0, 1, 350)])).toEqual([]);
    expect(piece.damage).toBe(250);
    expect(new Numbers(lines).wear(piece)).toBe(0.5);

    expect(rules.impacts([hit(0, 1, 350)])).toEqual([piece]);
  });

  it('never breaks a blue Piece by counting impacts: only damage wears it', () => {
    const piece: Breakable = { kind: 'piece', colour: 'blue', damage: 0, impacts: 0 };
    const rules = impactRules(table);
    const { hit } = setup([party(2, piece, 1), TERRAIN]);
    const threshold = table.colours.blue.line.damageThreshold;

    for (let k = 0; k < 4; k++) rules.impacts([hit(0, 1, threshold + 10)]);

    expect(piece.damage).toBe(40);
    expect(new Numbers(table).wear(piece)).toBeLessThan(1);
  });

  it("counts one Line's Pieces hit in one step as one impact on what hit them", () => {
    const grey = breakable('grey');
    const left: Breakable = { kind: 'piece', colour: 'grey', damage: 0, impacts: 0 };
    const right: Breakable = { kind: 'piece', colour: 'grey', damage: 0, impacts: 0 };
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
    kind: 'object',
    debris: { outline: SQUARE, velocity: { x: 0, y: 0 }, colours: [outline] },
    outline: { colour: outline, ink: outlineInk(SQUARE), centre },
    fill: fill && {
      colour: fill,
      mass: 2,
      ink: fillInk(SQUARE),
      outline: SQUARE,
      from: {
        transform: { ...centre, angle: 0 },
        velocity: { x: 0, y: 0 },
        angularVelocity: 0,
      },
    },
  };
}

/** What breaking a Piece of `colour` centred at (100, 200) lets out. */
function brokenPiece(colour: Colour): Broken {
  return {
    kind: 'piece',
    debris: { outline: SQUARE, velocity: { x: 0, y: 0 }, colours: [colour] },
    colour,
    centre: { x: 100, y: 200 },
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
    kind: 'object',
    damage: 0,
    impacts: 0,
  });

  /** Breaks `target`, which lets out `broken`, as a hit that broke it would. */
  function breakOne(broken: Broken | null, materials = table) {
    const fake = fakeRules<Breakable>(materials);
    const target = object(broken?.kind === 'object' ? broken.outline.colour : 'grey');
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
    fake.rules.step(STEP);
    return { ...fake, target };
  }

  it('breaks what the hits broke', () => {
    const { target, arena } = breakOne(brokenObject('grey', null));

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

  const target = (colour: Colour, kind: Breakable['kind'] = 'object'): Breakable => ({
    kind,
    colour,
    damage: 0,
    impacts: 0,
  });
  /** The Material rules, stepped with what a spreading Blast reached. */
  function blastRules(materials: MaterialTable) {
    const fake = fakeRules<Breakable>(materials);
    /** Steps the rules, and the Blast reaches `reached` as it spreads. */
    const blastReached = (reached: Reach<Breakable>[]) => {
      fake.arena.reaching = [reached];
      fake.rules.step(STEP);
    };
    return { ...fake, blastReached };
  }
  /** The Blast reaching `party` at `point` with `strength`. */
  const reach = (party: Party<Breakable>, strength: number, point: Vec2 = { x: 30, y: 40 }) =>
    ({ party, centre: CENTRE, point, strength }) satisfies Reach<Breakable>;

  it('damages what it reaches above its own threshold, and never counts an impact', () => {
    const { blastReached, physics } = blastRules(table);
    const blue = target('blue');
    const { damageThreshold } = table.colours.blue.outline;
    physics.add(1, { frozen: true, free: false, mass: 1e6 });

    blastReached([reach(partyOf(1, blue), damageThreshold)]);
    expect(blue.damage).toBe(0);
    for (let k = 0; k < 5; k++) blastReached([reach(partyOf(1, blue), damageThreshold + 100)]);

    expect(blue.damage).toBe(500);
    expect(blue.impacts).toBe(0);
  });

  it('wakes a Frozen Object when its push over its mass beats the wake speed, and pushes it outward', () => {
    const { blastReached, physics } = blastRules(table);
    // A push of 300: 150 px/s for the light one, 60 px/s for the heavy one.
    physics.add(1, { frozen: true, free: false, mass: 2 });
    physics.add(2, { frozen: true, free: false, mass: 5 });

    blastReached([reach(partyOf(1, target('grey')), 300), reach(partyOf(2, target('grey')), 300)]);

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
    const { blastReached, physics } = blastRules(table);
    physics.add(1, { mass: 0.1 });

    blastReached([reach(partyOf(1, null), 1000)]);

    const { velocity } = physics.body(1 as BodyId);
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(500, 9);
  });

  it('pushes a body it started inside away from the body’s centre, or else straight up', () => {
    const { blastReached, physics } = blastRules(table);
    physics.add(1, { transform: { x: 0, y: 20, angle: 0 } });
    physics.add(2);

    blastReached([reach(partyOf(1, null), 10, CENTRE), reach(partyOf(2, null), 10, CENTRE)]);

    expect(physics.body(1 as BodyId).velocity).toEqual({ x: 0, y: 10 });
    expect(physics.body(2 as BodyId).velocity).toEqual({ x: 0, y: -10 });
  });

  it('leaves a Squeezed Object sliding off a Line alone', () => {
    const { blastReached, physics, arena } = blastRules(table);
    const squeezed = target('red');
    physics.add(1, { free: false, slide: { x: 0, y: -12 } });

    blastReached([reach(partyOf(1, squeezed), 1e6)]);

    expect(squeezed.damage).toBe(0);
    expect(physics.log).toEqual([]);
    expect(arena.done).toEqual(['reach']);
  });

  it('only damages a Piece, which is fixed', () => {
    const { blastReached, physics } = blastRules(table);
    const piece = target('grey', 'piece');
    physics.add(1, { free: false });

    blastReached([reach(partyOf(1, piece), 500)]);

    expect(piece.damage).toBe(500 - table.colours.grey.line.damageThreshold);
    expect(physics.log).toEqual([]);
  });

  it('breaks what it broke once it has pushed everything else it reached, without pushing it', () => {
    const { blastReached, physics, arena } = blastRules(table);
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

    blastReached([reach(partyOf(1, weak), 1000), reach(partyOf(2, null), 10)]);

    expect(pushedFirst).toEqual(['impulse 2']);
    expect(physics.body(1 as BodyId).velocity).toEqual({ x: 0, y: 0 });
    // Red set off by a Blast explodes in turn.
    expect(arena.done).toEqual(['reach', 'break', 'burst', 'blast']);
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
    const next: Breakable = { kind: 'piece', colour: 'red', damage: 0, impacts: 0 };
    arena.breaks.set(next, brokenPiece('red'));
    physics.add(1, { free: false });
    arena.reaching = [
      [
        {
          party: partyOf(1, next),
          centre: { x: 0, y: 0 },
          point: { x: 48, y: 0 },
          strength: blastStrength(pieceBlastSize(TABLE), 48),
        },
      ],
    ];

    rules.step(STEP);

    expect(arena.done).toEqual(['reach', 'break', 'burst', 'blast']);
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
    fake.arena.mayStick = [box];
    fake.rules.step(STEP);
    fake.rules.step(STEP);
    return { ...fake, box };
  }

  it('sticks to its first new contact, where the two touched, and only once', () => {
    const { rules, contacts, physics, arena, box } = letGo();
    const host = partyOf(2, null);
    const other = partyOf(3, null);
    contacts.newContacts = [contact(partyOf(1, null), host), contact(other, partyOf(1, null))];
    physics.touchPoints.set(contacts.newContacts[0]!.pair, { x: 5, y: 6 });

    rules.step(STEP);
    contacts.newContacts = [contact(other, partyOf(1, null))];
    rules.step(STEP);

    expect(arena.handed('bond')).toEqual([{ sticker: box, host, point: { x: 5, y: 6 } }]);
    expect(box.sticking).toEqual({ state: 'done' });
  });

  it('never counts a harmless Party, such as a Droplet', () => {
    const { rules, contacts, physics, arena, box } = letGo();
    physics.body(1 as BodyId).transform = { x: 7, y: 8, angle: 0 };
    contacts.newContacts = [contact(partyOf(9, null, true), partyOf(1, null))];

    rules.step(STEP);
    expect(arena.handed('bond')).toEqual([]);

    const host = partyOf(2, null);
    contacts.newContacts = [contact(partyOf(1, null), host)];
    rules.step(STEP);

    // With no touch point, where the box is.
    expect(arena.handed('bond')).toEqual([{ sticker: box, host, point: { x: 7, y: 8, angle: 0 } }]);
  });

  it('never sticks an Object whose Outline doesn’t stick', () => {
    const { rules, contacts, arena } = letGo('grey');
    contacts.newContacts = [contact(partyOf(1, null), partyOf(2, null))];

    rules.step(STEP);

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

    rules.step(STEP);

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

    rules.step(STEP);

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

    rules.step(STEP);

    expect(blue.used).toBe(300 * table.colours.blue.fill.patchHitWear);
    expect(green.used).toBe(50 * table.colours.green.fill.patchHitWear);
  });
});

describe('Material rules: the order of a step', () => {
  const table = createMaterialTable();
  table.colours.green.line.glueDrag = 4;
  const surface = { kind: 'circle', radius: 10 } as const;

  const object = (colour: Colour): Breakable => ({ colour, kind: 'object', damage: 0, impacts: 0 });
  const contact = (a: Party<Breakable>, b: Party<Breakable>): NewContact<Breakable> => ({
    a,
    b,
    pair: { bodyA: a.body, bodyB: b.body, shapeA: a.id as ShapeId, shapeB: b.id as ShapeId },
  });
  /** A hit from the Terrain on `party` hard enough to break anything. */
  const breakingHit = (party: Party<Breakable>): PartyHit<Breakable> => ({
    a: partyOf(TERRAIN_PARTY, null),
    b: party,
    hit: {
      bodyA: TERRAIN_PARTY as BodyId,
      bodyB: party.body,
      shapeA: 1 as ShapeId,
      shapeB: party.id as ShapeId,
      point: { x: 0, y: 0 },
      normal: { x: 0, y: 1 },
      speed: 500,
      impulse: 1e6,
    },
  });

  /** The rules, with a grey Object on body 2 that the step's hit breaks. */
  function breakingHost() {
    const fake = fakeRules<Breakable, Sticker>(table);
    const target = object('grey');
    const host = partyOf(2, target);
    fake.arena.breaks.set(target, brokenObject('grey', null));
    fake.contacts.hits = [breakingHit(host)];
    return { ...fake, target, host };
  }

  it('sticks a green Object to a new contact that breaks in the same step, before it breaks', () => {
    const { rules, contacts, physics, arena, host } = breakingHost();
    const box: Sticker = { colour: 'green', body: physics.add(1), sticking: WAITING };
    arena.mayStick = [box];
    const hits = contacts.hits;
    contacts.hits = [];
    rules.step(STEP);
    rules.step(STEP); // free after two steps: it may stick

    contacts.hits = hits;
    contacts.newContacts = [contact(partyOf(1, null), host)];
    rules.step(STEP);

    expect(arena.done).toEqual(['bond', 'break', 'burst']);
    expect(arena.handed('bond')).toEqual([
      { sticker: box, host, point: physics.getTransform(box.body) },
    ]);
  });

  it('lays a Patch on something the step broke before it breaks, so the Patch goes with it', () => {
    const { rules, contacts, arena, host } = breakingHost();
    arena.droplets.set(5 as BodyId, { colour: 'blue', length: 12, centre: { x: 5, y: 0 } });
    arena.surfaces.set(host.id, surface);
    contacts.newContacts = [contact(partyOf(5, null, true), host)];

    rules.step(STEP);

    expect(arena.done).toEqual(['land', 'patch', 'break', 'burst']);
  });

  it('then drags by glue, spreads the Blasts, and last removes the used-up Patches', () => {
    const { rules, contacts, physics, arena } = breakingHost();
    // A green Patch on body 3 drags body 4, moving, through its shape 103.
    const patch = fakePatch('green', 3, 103);
    physics.add(3, { free: false, mass: 0 });
    physics.add(4, { velocity: { x: 300, y: 0 } });
    contacts.touches.set(3 as BodyId, [
      {
        party: partyOf(4, null),
        pairs: [
          { bodyA: 3 as BodyId, bodyB: 4 as BodyId, shapeA: 103 as ShapeId, shapeB: 4 as ShapeId },
        ],
      },
    ]);
    arena.patches.set(patch.shape, patch);
    arena.glue = [patch];
    arena.patchCapacity = 1;
    // A Blast reaches body 4 as it spreads.
    arena.reaching = [
      [{ party: partyOf(4, null), centre: { x: 0, y: 0 }, point: { x: 1, y: 0 }, strength: 1 }],
    ];

    rules.step(STEP);

    expect(arena.done).toEqual(['break', 'burst', 'use', 'reach', 'used-up']);
    expect(physics.log.at(-1)).toBe('impulse 4');
  });
});

describe('Floor or not', () => {
  /** The normal of a surface `degrees` steep, pointing from it up towards what stands on it. */
  const up = (degrees: number, facing = 1): Vec2 => {
    const turn = (degrees * Math.PI) / 180;
    return { x: -facing * Math.sin(turn), y: -Math.cos(turn) };
  };

  it('stands on a surface no steeper than 45°, either way it slopes, and presses a steeper one', () => {
    expect(STEEPEST_FLOOR).toBeCloseTo(Math.PI / 4, 12);
    for (const facing of [1, -1]) {
      expect(isFloor(up(0, facing))).toBe(true);
      expect(isFloor(up(44, facing))).toBe(true);
      expect(isFloor(up(45, facing))).toBe(true);
      expect(isFloor(up(46, facing))).toBe(false);
      expect(isFloor(up(90, facing))).toBe(false);
    }
    expect(isFloor({ x: 0, y: 1 })).toBe(false); // a ceiling
  });

  it('presses a surface steeper than 45° in its way, and not a ceiling or one behind it', () => {
    for (const heading of [1, -1]) {
      expect(isPressed(up(46, heading), heading)).toBe(true);
      expect(isPressed(up(90, heading), heading)).toBe(true);
      expect(isPressed(up(134, heading), heading)).toBe(true); // an overhang in its way
      expect(isPressed(up(44, heading), heading)).toBe(false); // a floor
      expect(isPressed(up(90, -heading), heading)).toBe(false); // behind it
    }
    expect(isPressed({ x: 0, y: 1 }, 1)).toBe(false); // a ceiling
  });
});

describe('Material rules: Enemies', () => {
  const crawler = (id: number): Walker => ({
    id,
    body: (100 + id) as BodyId,
    type: 'crawler',
    damage: 0,
  });
  const party = (id: number, body = id): Party<Breakable> => ({
    id,
    stroke: id,
    body: body as BodyId,
    target: null,
  });
  const pair = (a: number, b: number) => ({
    bodyA: a as BodyId,
    bodyB: b as BodyId,
    shapeA: a as ShapeId,
    shapeB: b as ShapeId,
  });

  it('walks each Enemy that stands on something, before the step, and not one in the air or on a wall', () => {
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    const [onGround, inAir, onWall] = [crawler(1), crawler(2), crawler(3)];
    arena.walking = [onGround, inAir, onWall];
    const ground = pair(0, 101);
    const wall = pair(0, 103);
    contacts.touches.set(onGround.body, [{ party: party(TERRAIN_PARTY), pairs: [ground] }]);
    contacts.touches.set(onWall.body, [{ party: party(TERRAIN_PARTY), pairs: [wall] }]);
    contacts.normals.set(ground, { x: 0, y: -1 });
    contacts.normals.set(wall, { x: -1, y: 0 });

    rules.walk(STEP);

    expect(arena.handed('walk')).toEqual([onGround]);
  });

  it('lets an Enemy touching the Ink Core deal it its core damage and disappear', () => {
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    const [reaching, walking] = [crawler(1), crawler(2)];
    arena.walking = [reaching, walking];
    arena.inkCore = 50;
    contacts.touches.set(reaching.body, [{ party: party(50), pairs: [pair(50, 101)] }]);

    rules.step(STEP);

    expect(arena.log.slice(-2)).toEqual([
      { what: 'core', with: 1 },
      { what: 'remove', with: { thing: { thing: 'enemy', id: 1 }, why: 'reached' } },
    ]);
  });

  it('kills an Enemy below the screen, and removes anything but an Enemy beyond the Spawn edge', () => {
    const { rules, arena } = fakeRules<Breakable>(createMaterialTable());
    arena.below = [
      { thing: 'object', id: 7 },
      { thing: 'enemy', id: 1 },
    ];
    arena.beyond = [
      { thing: 'enemy', id: 2 },
      { thing: 'object', id: 8 },
      { thing: 'rubble', id: 3, colour: 'grey', radius: 6 },
    ];

    rules.step(STEP);

    expect(arena.handed('kill')).toEqual([1]);
    expect(arena.handed('remove')).toEqual([
      { thing: { thing: 'object', id: 8 }, why: 'left' },
      { thing: { thing: 'rubble', id: 3, colour: 'grey', radius: 6 }, why: 'left' },
    ]);
    expect(arena.handed('break')).toEqual([]);
    expect(arena.handed('blast')).toEqual([]);
  });
});

describe('Material rules: hurting Enemies', () => {
  /** The Crawler's HP and damage threshold. */
  const HP = 3000;
  const THRESHOLD = 300;
  const crawler = (id: number): Walker => ({
    id,
    body: (100 + id) as BodyId,
    type: 'crawler',
    damage: 0,
  });
  const partyOf = (id: number, body: number, target: Breakable | null = null) => ({
    id,
    stroke: id,
    body: body as BodyId,
    target,
  });
  const pieceOf = (): Breakable => ({ kind: 'piece', colour: 'grey', damage: 0, impacts: 0 });
  /** A hit between A and B, its normal pointing from A towards B. */
  const hit = (
    a: Party<Breakable>,
    b: Party<Breakable>,
    impulse: number,
    normal: Vec2 = { x: 0, y: 1 },
    speed = 0,
  ): PartyHit<Breakable> => ({
    a,
    b,
    hit: {
      bodyA: a.body,
      bodyB: b.body,
      shapeA: a.body as number as ShapeId,
      shapeB: b.body as number as ShapeId,
      point: { x: 0, y: 0 },
      normal,
      speed,
      impulse,
    },
  });
  /** The rules with one Crawler, Party 11 on body 101. */
  function oneCrawler() {
    const fake = fakeRules<Breakable>(createMaterialTable());
    const enemy = crawler(1);
    fake.arena.walking = [enemy];
    const party = partyOf(11, 101);
    fake.arena.enemyParties.set(11, enemy);
    fake.physics.add(101, { mass: 1.2 });
    return { ...fake, enemy, party };
  }

  it('damages an Enemy by a hit above its threshold, and what it hit by that one’s own', () => {
    const { rules, contacts, arena, enemy, party } = oneCrawler();
    const line = partyOf(20, 20, pieceOf());
    const soft = partyOf(21, 21, pieceOf());

    contacts.hits = [hit(party, line, 900), hit(soft, party, THRESHOLD, { x: 1, y: 0 })];
    rules.step(STEP);

    expect(enemy.damage).toBe(900 - THRESHOLD);
    expect(line.target!.damage).toBe(900 - 400); // grey's threshold
    expect(soft.target!.damage).toBe(0);
    expect(arena.handed('kill')).toEqual([]);
  });

  it('crushes an Enemy standing on something that is hit from above: all the hitter’s weight counts', () => {
    const { rules, contacts, physics, enemy, party } = oneCrawler();
    const floor = {
      bodyA: 0 as BodyId,
      bodyB: 101 as BodyId,
      shapeA: 0 as ShapeId,
      shapeB: 101 as ShapeId,
    };
    contacts.touches.set(enemy.body, [{ party: partyOf(TERRAIN_PARTY, 0), pairs: [floor] }]);
    contacts.normals.set(floor, { x: 0, y: -1 });
    const boulder = partyOf(30, 30);
    physics.add(30, { mass: 10 });

    // Falling at 500 px/s onto it: between the two free bodies the hit is about its own weight.
    contacts.hits = [hit(boulder, party, 550, { x: 0, y: 1 }, 500)];
    rules.step(STEP);

    expect(enemy.damage).toBe(10 * 500 - THRESHOLD);
  });

  it('does not crush an Enemy hit from the side or in the air', () => {
    const sideways = oneCrawler();
    const floor = {
      bodyA: 0 as BodyId,
      bodyB: 101 as BodyId,
      shapeA: 0 as ShapeId,
      shapeB: 101 as ShapeId,
    };
    sideways.contacts.touches.set(101 as BodyId, [
      { party: partyOf(TERRAIN_PARTY, 0), pairs: [floor] },
    ]);
    sideways.contacts.normals.set(floor, { x: 0, y: -1 });
    sideways.physics.add(30, { mass: 10 });
    sideways.contacts.hits = [hit(partyOf(30, 30), sideways.party, 550, { x: 1, y: 0 }, 500)];
    sideways.rules.step(STEP);

    const inAir = oneCrawler();
    inAir.physics.add(30, { mass: 10 });
    inAir.contacts.hits = [hit(partyOf(30, 30), inAir.party, 550, { x: 0, y: 1 }, 500)];
    inAir.rules.step(STEP);

    expect([sideways.enemy.damage, inAir.enemy.damage]).toEqual([250, 250]);
  });

  it('damages an Enemy a Blast reaches, above its threshold, and pushes it away', () => {
    const { rules, physics, arena, enemy, party } = oneCrawler();
    physics.body(enemy.body).transform = { x: 100, y: 0, angle: 0 };
    arena.reaching = [[{ party, centre: { x: 0, y: 0 }, point: { x: 80, y: 0 }, strength: 1300 }]];

    rules.step(STEP);

    expect(enemy.damage).toBe(1300 - THRESHOLD);
    expect(physics.body(enemy.body).velocity.x).toBeGreaterThan(0);
  });

  it('kills an Enemy at 0 HP in its own phase, after the Ink Core, oldest first; a dead one never reaches it', () => {
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    const [first, second, alive] = [crawler(1), crawler(2), crawler(3)];
    first.damage = HP + 1;
    second.damage = HP;
    alive.damage = HP - 1;
    arena.walking = [first, second, alive];
    arena.inkCore = 50;
    const core = {
      bodyA: 50 as BodyId,
      bodyB: 101 as BodyId,
      shapeA: 50 as ShapeId,
      shapeB: 101 as ShapeId,
    };
    contacts.touches.set(first.body, [{ party: partyOf(50, 50), pairs: [core] }]);

    rules.step(STEP);

    expect(arena.done).toEqual(['kill', 'kill', 'drop', 'drop']);
    expect(arena.handed('kill')).toEqual([1, 2]);
  });
});

describe('Material rules: Drops', () => {
  const crawler = (id: number, damage = 0): Walker => ({
    id,
    body: (100 + id) as BodyId,
    type: 'crawler',
    damage,
  });

  it('lets every Enemy that died out a Drop after the kills, in the order they died', () => {
    const { rules, arena } = fakeRules<Breakable>(createMaterialTable());
    arena.walking = [crawler(1, 5000), crawler(2)];
    arena.below = [{ thing: 'enemy', id: 2 }];
    arena.killed.set(2, { id: 2, type: 'heavy', at: { x: 300, y: 1200 } });
    arena.beyond = [{ thing: 'object', id: 8 }];

    rules.step(STEP);

    expect(arena.done).toEqual(['kill', 'kill', 'drop', 'drop', 'remove']);
    const drops = arena.handed('drop') as { killed: { id: number; type: string } }[];
    expect(drops.map(({ killed }) => [killed.id, killed.type])).toEqual([
      [1, 'crawler'],
      [2, 'heavy'],
    ]);
  });

  it("draws each Drop from the generator, within its type's ranges as they are now", () => {
    const enemies = createEnemyTable();
    enemies.types.crawler.drop.red = { min: 5, max: 6 };
    const { rules, arena, random } = fakeRules<Breakable>(createMaterialTable(), enemies);
    arena.walking = [crawler(1, 5000)];
    const expected = drawDrop(enemies.types.crawler.drop, new Random(random.state));

    rules.step(STEP);

    const drops = arena.handed('drop') as { ink: DropInk }[];
    expect(drops).toHaveLength(1);
    const { ink } = drops[0]!;
    expect(ink).toEqual(expected);
    expect(ink.red / LINE_THICKNESS).toBeGreaterThanOrEqual(5);
    expect(ink.red / LINE_THICKNESS).toBeLessThan(6);
  });

  it('drops nothing for an Enemy that reached the Ink Core, or one already gone', () => {
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    const reaching = crawler(1);
    arena.walking = [reaching];
    arena.inkCore = 50;
    const core = {
      bodyA: 50 as BodyId,
      bodyB: 101 as BodyId,
      shapeA: 50 as ShapeId,
      shapeB: 101 as ShapeId,
    };
    contacts.touches.set(reaching.body, [
      { party: { id: 50, stroke: 50, body: 50 as BodyId, target: null }, pairs: [core] },
    ]);
    arena.below = [{ thing: 'enemy', id: 9 }];
    arena.kill = (id) => (arena.log.push({ what: 'kill', with: id }), null);

    rules.step(STEP);

    expect(arena.handed('drop')).toEqual([]);
  });
});

describe('Material rules: pressing wear', () => {
  /** The Crawler's pressing rate, durability per second. */
  const PRESSING = 300;
  const crawler: Walker = { id: 1, body: 101 as BodyId, type: 'crawler', damage: 0 };
  const pieceOf = (colour: Colour = 'grey'): Breakable => ({
    kind: 'piece',
    colour,
    damage: 0,
    impacts: 0,
  });
  const objectOf = (colour: Colour = 'grey'): Breakable => ({ ...pieceOf(colour), kind: 'object' });
  let nextBody = 1;
  /** What the Crawler touches: each Party, and the normal of their one pair towards the Crawler. */
  function touch(
    contacts: ReturnType<typeof fakeRules<Breakable>>['contacts'],
    touched: readonly { target: Breakable | null; normal: Vec2 }[],
  ): void {
    contacts.touches.set(
      crawler.body,
      touched.map(({ target, normal }) => {
        const body = nextBody++;
        const pair = {
          bodyA: body as BodyId,
          bodyB: crawler.body,
          shapeA: body as ShapeId,
          shapeB: crawler.body as number as ShapeId,
        };
        contacts.normals.set(pair, normal);
        return { party: { id: body, stroke: body, body: body as BodyId, target }, pairs: [pair] };
      }),
    );
  }
  const WALL = { x: -1, y: 0 }; // in the way of a Crawler walking right
  const FLOOR = { x: 0, y: -1 };

  it('wears a Piece in its way at its pressing rate, stalled or not', () => {
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    arena.walking = [crawler];
    const piece = pieceOf();
    touch(contacts, [{ target: piece, normal: WALL }]);

    rules.walk(STEP);
    for (let step = 0; step < 60; step++) rules.step(STEP);

    expect(piece.damage).toBeCloseTo(PRESSING, 6);
    expect(piece.impacts).toBe(0);
  });

  it('wears an Object in its way only while stalled: one it gets past, it pushes', () => {
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    arena.walking = [crawler];
    const object = objectOf();
    touch(contacts, [
      { target: object, normal: WALL },
      { target: null, normal: FLOOR },
    ]);

    rules.walk(STEP);
    rules.step(STEP);
    expect(object.damage).toBe(0);

    arena.stalled.add(crawler);
    rules.walk(STEP);
    rules.step(STEP);
    expect(object.damage).toBeCloseTo(PRESSING * STEP, 9);
  });

  it('never wakes a Frozen Object it presses', () => {
    const { rules, physics, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    arena.walking = [crawler];
    arena.stalled.add(crawler);
    const object = objectOf();
    touch(contacts, [
      { target: object, normal: WALL },
      { target: null, normal: FLOOR },
    ]);
    const { party } = contacts.touches.get(crawler.body)![0]!;
    physics.add(party.body, { frozen: true, free: false });

    rules.walk(STEP);
    for (let step = 0; step < 60; step++) rules.step(STEP);

    expect(object.damage).toBeCloseTo(PRESSING, 6);
    expect(physics.body(party.body).frozen).toBe(true);
    expect(physics.log).toEqual([]);
  });

  it('wears what it stands on at floor wear times its pressing rate', () => {
    const enemies = createEnemyTable();
    enemies.floorWear = 0.5;
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable(), enemies);
    arena.walking = [crawler];
    const [under, sloped] = [pieceOf(), objectOf()];
    touch(contacts, [
      { target: under, normal: FLOOR },
      { target: sloped, normal: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 } }, // 45°: stands on it
    ]);

    rules.walk(STEP);
    for (let step = 0; step < 60; step++) rules.step(STEP);

    expect(under.damage).toBeCloseTo(0.5 * PRESSING, 6);
    expect(sloped.damage).toBeCloseTo(0.5 * PRESSING, 6);
  });

  it('wears nothing it only touches from behind or above, nor the Terrain, Rubble or the Ink Core', () => {
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    arena.walking = [crawler];
    arena.stalled.add(crawler);
    const [behind, above] = [pieceOf(), pieceOf()];
    touch(contacts, [
      { target: behind, normal: { x: 1, y: 0 } },
      { target: above, normal: { x: 0, y: 1 } },
      { target: null, normal: WALL }, // the Terrain, Rubble, the Ink Core: nothing takes damage
    ]);

    rules.walk(STEP);
    rules.step(STEP);

    expect([behind.damage, above.damage]).toEqual([0, 0]);
    expect(arena.done).toEqual([]);
  });

  it('adds up the wear of every Enemy on one Piece', () => {
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    const other: Walker = { id: 2, body: 102 as BodyId, type: 'crawler', damage: 0 };
    arena.walking = [crawler, other];
    const bridge = pieceOf();
    touch(contacts, [{ target: bridge, normal: FLOOR }]);
    contacts.touches.set(other.body, contacts.touches.get(crawler.body)!);

    rules.step(STEP);

    expect(bridge.damage).toBeCloseTo(2 * PRESSING * STEP, 9);
  });

  it('breaks what it wore out as a hit would, before sticking, and red goes off', () => {
    const { rules, contacts, arena } = fakeRules<Breakable>(createMaterialTable());
    arena.walking = [crawler];
    const red = pieceOf('red');
    red.damage = DEFAULT_MATERIAL_TABLE.colours.red.line.durability - 1;
    touch(contacts, [{ target: red, normal: FLOOR }]);
    arena.breaks.set(red, {
      kind: 'piece',
      debris: { outline: [], velocity: { x: 0, y: 0 }, colours: ['red'] },
      colour: 'red',
      centre: { x: 5, y: 6 },
    });

    rules.step(STEP);

    expect(arena.done).toEqual(['break', 'burst', 'blast']);
    expect(arena.handed('break')).toEqual([red]);
  });
});
