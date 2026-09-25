import { describe, expect, it } from 'vitest';
import { ARENA_HEIGHT, ARENA_WIDTH } from './arena';

describe('Arena', () => {
  it('has a 1920 × 1080 logical size', () => {
    expect({ width: ARENA_WIDTH, height: ARENA_HEIGHT }).toEqual({ width: 1920, height: 1080 });
  });
});
