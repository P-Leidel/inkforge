import { afterEach } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { dragAlong } from '../stroke/pointer-paths';
import {
  SandboxWorld,
  STEP_SECONDS,
  type ObjectView,
  type SandboxWorldOptions,
} from './sandbox-world';

/**
 * Helpers for tests that drive the headless Sandbox world. Only test files
 * import this module.
 */

/** A factory for Sandbox worlds that are disposed after each test. */
export function sandboxWorlds(): (options?: SandboxWorldOptions) => SandboxWorld {
  const worlds: SandboxWorld[] = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.dispose();
  });
  return (options = {}) => {
    const world = new SandboxWorld({ seed: 1, ...options });
    worlds.push(world);
    return world;
  };
}

/** Starts physics if it is paused, then steps it for `seconds`. */
export function runFor(world: SandboxWorld, seconds: number): void {
  if (!world.isRunning) world.togglePause();
  for (let t = 0; t < Math.round(seconds / STEP_SECONDS); t++) world.step();
}

export function objectById(world: SandboxWorld, id: number): ObjectView {
  const object = world.objects.find((o) => o.id === id);
  if (!object) throw new Error(`no Object ${id}`);
  return object;
}

/** Submits a closed Stroke that must become an Object; returns its id. */
export function drawObject(world: SandboxWorld, samples: Vec2[], colour: Colour = 'grey'): number {
  const outcome = world.submitStroke(samples, colour);
  if (outcome.kind !== 'object') throw new Error(`expected an Object, got ${outcome.kind}`);
  return outcome.id;
}

/** Submits an open Stroke along `path` that must become a Line; returns its id. */
export function drawLine(world: SandboxWorld, path: Vec2[], colour: Colour = 'grey'): number {
  const outcome = world.submitStroke(dragAlong(path), colour);
  if (outcome.kind !== 'line') throw new Error(`expected a Line, got ${outcome.kind}`);
  return outcome.id;
}
