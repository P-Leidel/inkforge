import { describe, expect, it } from 'vitest';
import { FrameTimes, RecentFrames } from './frame-times';
import { readingLines } from './readings';

describe('Readings', () => {
  const bodies = {
    total: 83,
    pieces: 24,
    objects: 7,
    rubble: 62,
    droplets: 3,
    patches: 23,
    blasts: 1,
    debris: 40,
  };
  const render = {
    graphics: 31,
    commands: 6212,
    texts: 29,
    images: 88,
    bakedTextures: 12,
    bakedBytes: 7.5 * 2 ** 20,
    objects: 150,
  };

  it('shows the last second, the time since the start, the bodies and the render load', () => {
    const recent = new RecentFrames(240);
    for (let k = 0; k < 60; k++) {
      recent.push({ ms: 1000 / 60, physicsMs: 0.4, steps: 1, drawMs: 0.3, renderMs: 4.8 });
    }
    const sinceStart = new FrameTimes();
    sinceStart.restart();
    for (const ms of [200, 16, 24.1, 16]) sinceStart.frame(ms);

    const lines = readingLines({ recent: recent.summary(), sinceStart, bodies, render });

    expect(lines).toEqual([
      'last 1 s     60 fps   longest 16.7 ms',
      'since start  53.5 fps   longest 24.1 ms   1% low 41 fps',
      '             3 frames   >20 ms: 1   >33 ms: 0',
      'ms, last 1 s physics 0.4 (max 0.4)   draw 0.3 (max 0.3)',
      '             render 4.8 (max 4.8)   steps 60 · 0.4 ms each',
      'bodies       83: Pieces 24   Objects 7   Rubble 62',
      '             Droplets 3   Patches 23   Blasts 1   Debris 40',
      'render       Graphics 31 · 6,212 commands   Text 29   objects 150',
      '             Images 88   baked 12 textures · 7.5 MB',
    ]);
  });

  it('shows dashes before the first frame', () => {
    const sinceStart = new FrameTimes();
    sinceStart.restart();

    const lines = readingLines({ recent: null, sinceStart, bodies, render });

    expect(lines[0]).toBe('last 1 s     -');
    expect(lines[1]).toBe('since start  -   longest -   1% low -');
  });
});
