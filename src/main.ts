import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from './sandbox/arena';
import { SandboxScene } from './scenes/sandbox-scene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2027',
  // Ask laptops with two GPUs for the faster one.
  render: { powerPreference: 'high-performance' },
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  scale: {
    // Keep the 1920 × 1080 layout and scale it to fit the window.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [SandboxScene],
});
