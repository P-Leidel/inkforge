import type { Piece } from './lines';
import type { ObjectStroke } from './objects';

/** A Stroke's id: a Line's or an Object's, never reused. */
export type StrokeId = number;

/** What takes damage: an Object or a Piece. */
export type StrokeTarget = ObjectStroke | Piece;
