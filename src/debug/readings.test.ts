import { describe, expect, it } from 'vitest';
import { FrameTimes, RecentFrames } from './frame-times';
import { readingLines } from './readings';

describe('Readings', () => {
  const bodies = {
    total: 83,
    pieces: 24,
    contents: [
      { name: 'lines', count: 5 },
      { name: 'objects', count: 7 },
      { name: 'rubble', count: 62 },
      { name: 'bonds', count: 2 },
      { name: 'droplets', count: 3 },
      { name: 'patches', count: 23 },
      { name: 'blasts', count: 1 },
    ],
    debris: 40,
  };
  const tank = (spendable: number, maximum: number) => ({
    spendable,
    maximum,
    units: Math.floor(spendable / 8),
  });
  const ink = {
    tanks: {
      grey: tank(32000, 32000),
      blue: tank(23999.6, 24000),
      green: tank(0, 24000),
      black: tank(12000, 12000),
      red: tank(8000, 8000),
    },
    costs: true,
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

  it('shows the last second, the time since the start, the bodies, the render load and the Tanks', () => {
    const recent = new RecentFrames(240);
    for (let k = 0; k < 60; k++) {
      recent.push({ ms: 1000 / 60, physicsMs: 0.4, steps: 1, drawMs: 0.3, renderMs: 4.8 });
    }
    const sinceStart = new FrameTimes();
    sinceStart.restart();
    for (const ms of [200, 16, 24.1, 16]) sinceStart.frame(ms);

    const lines = readingLines({ recent: recent.summary(), sinceStart, bodies, render, ink });

    expect(lines).toEqual([
      'last 1 s     60 fps   longest 16.7 ms',
      'since start  53.5 fps   longest 24.1 ms   1% low 41 fps',
      '             3 frames   >20 ms: 1   >33 ms: 0',
      'ms, last 1 s physics 0.4 (max 0.4)   draw 0.3 (max 0.3)',
      '             render 4.8 (max 4.8)   steps 60 · 0.4 ms each',
      'bodies       83: Pieces 24   Lines 5   Objects 7   Rubble 62',
      '             Bonds 2   Droplets 3   Patches 23   Blasts 1   Debris 40',
      'render       Graphics 31 · 6,212 commands   Text 29   objects 150',
      '             Images 88   baked 12 textures · 7.5 MB',
      'ink, px²     grey 32,000   blue 24,000   green 0',
      '             black 12,000   red 8,000   costs on',
    ]);
  });

  it('shows dashes before the first frame', () => {
    const sinceStart = new FrameTimes();
    sinceStart.restart();

    const lines = readingLines({
      recent: null,
      sinceStart,
      bodies,
      render,
      ink: { ...ink, costs: false },
    });

    expect(lines[0]).toBe('last 1 s     -');
    expect(lines[1]).toBe('since start  -   longest -   1% low -');
    expect(lines.at(-1)).toBe('             black 12,000   red 8,000   costs off');
  });
});
