import { describe, expect, it } from 'vitest';
import { SANDBOX_ARENA } from '../sandbox/arena';
import type { Polygon } from './polygon';
import { bandPolygon, capsulePolygon, shortestWayOut } from './separation';

/**
 * These pin down today's results exactly: the Squeeze moves Objects by
 * `shortestWayOut`, and replays depend on every move coming out the same.
 */

const box = (x: number, y: number, width: number, height: number): Polygon => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

/** A 60 px box resting on the ground, as the gallery and the Eraser tests draw it. */
const onGround = box(470, 818, 60, 60);

/** A Line's capsule (8 px thick) across the box, 10 px above its bottom. */
const lowLine = capsulePolygon({ a: { x: 400, y: 868 }, b: { x: 600, y: 868 } }, 4);

/** An Object of two convex parts: an L. */
const ell = [box(300, 400, 40, 100), box(340, 460, 60, 40)];

/** A Line's capsule running up and right through the L. */
const diagonal = capsulePolygon({ a: { x: 280, y: 520 }, b: { x: 420, y: 430 } }, 4);

describe('shortestWayOut', () => {
  it('moves a box straight up off a Line across it, by exactly the same amount', () => {
    // The Squeeze's margin: 0.5 px.
    expect(shortestWayOut([onGround], [lowLine], [], 0.5)).toEqual({
      x: -2.689527305000702e-15,
      y: -14.641104721640318,
    });
  });

  it('ignores what blocks the way only elsewhere', () => {
    expect(shortestWayOut([onGround], [lowLine], SANDBOX_ARENA.terrain, 0.5)).toEqual({
      x: -2.689527305000702e-15,
      y: -14.641104721640318,
    });
  });

  it('takes the shortest way for a body of several parts', () => {
    expect(shortestWayOut(ell, [diagonal], [])).toEqual({
      x: -26.633996909580286,
      y: -46.13143585602547,
    });
  });

  it('takes the next shortest way when the shortest one is blocked', () => {
    expect(shortestWayOut(ell, [diagonal], [box(300, 330, 140, 60)])).toEqual({
      x: -44.8059299108219,
      y: -34.380799242067354,
    });
  });

  it('tries only as many directions as it is given', () => {
    expect(shortestWayOut([onGround], [lowLine], [], 1, 4)).toEqual({
      x: -2.7813758149367537e-15,
      y: -15.141104721640318,
    });
  });

  it('gives no way out when every way is blocked', () => {
    const tunnel = capsulePolygon({ a: { x: 100, y: 100 }, b: { x: 300, y: 100 } }, 4);
    const walls = [
      box(0, 0, 400, 90),
      box(0, 110, 400, 300),
      box(0, 0, 95, 400),
      box(305, 0, 100, 400),
    ];
    expect(shortestWayOut([box(150, 95, 20, 10)], [tunnel], walls)).toBeNull();
  });
});

describe('capsulePolygon', () => {
  it('encloses a Piece’s capsule with round caps of six edges', () => {
    expect(capsulePolygon({ a: { x: 200, y: 700 }, b: { x: 248, y: 700 } }, 4)).toEqual([
      { x: 248, y: 695.8588952783597 },
      { x: 250.07055236082016, y: 696.4136981113278 },
      { x: 251.5863018886722, y: 697.9294476391798 },
      { x: 252.14110472164032, y: 700 },
      { x: 251.5863018886722, y: 702.0705523608202 },
      { x: 250.07055236082016, y: 703.5863018886722 },
      { x: 248, y: 704.1411047216403 },
      { x: 200, y: 704.1411047216403 },
      { x: 197.92944763917984, y: 703.5863018886722 },
      { x: 196.4136981113278, y: 702.0705523608202 },
      { x: 195.85889527835968, y: 700 },
      { x: 196.4136981113278, y: 697.9294476391798 },
      { x: 197.92944763917984, y: 696.4136981113278 },
      { x: 200, y: 695.8588952783597 },
    ]);
  });

  it('takes the number of edges per cap, and a slanted segment', () => {
    expect(capsulePolygon({ a: { x: 0, y: 0 }, b: { x: 30, y: 40 } }, 10, 3)).toEqual([
      { x: 39.23760430703401, y: 33.07179676972449 },
      { x: 40.61880215351701, y: 44.53589838486224 },
      { x: 31.381197846482994, y: 51.46410161513775 },
      { x: 20.76239569296599, y: 46.92820323027551 },
      { x: -9.237604307034012, y: 6.928203230275509 },
      { x: -10.618802153517006, y: -4.535898384862241 },
      { x: -1.3811978464830015, y: -11.464101615137753 },
      { x: 9.237604307034012, y: -6.92820323027551 },
    ]);
  });
});

describe('bandPolygon', () => {
  it('outlines a bent Piece: one side forward, the other back', () => {
    const piece = [
      { a: { x: 200, y: 700 }, b: { x: 224, y: 700 } },
      { a: { x: 224, y: 700 }, b: { x: 248, y: 690 } },
    ];
    expect(bandPolygon(piece, 4)).toEqual([
      { x: 200, y: 704 },
      { x: 224.78446454055273, y: 703.9223227027637 },
      { x: 249.53846153846155, y: 693.6923076923077 },
      { x: 246.46153846153845, y: 686.3076923076923 },
      { x: 223.21553545944727, y: 696.0776772972363 },
      { x: 200, y: 696 },
    ]);
  });

  it('is the capsule for a Piece of one segment', () => {
    const segment = { a: { x: 200, y: 700 }, b: { x: 248, y: 700 } };
    expect(bandPolygon([segment], 4)).toEqual(capsulePolygon(segment, 4));
  });
});
