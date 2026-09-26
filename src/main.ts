import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from './sandbox/arena';
import { SandboxScene } from './scenes/sandbox-scene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2027',
  render: {
    // Ask laptops with two GPUs for the faster one.
    powerPreference: 'high-performance',
    // Phaser builds a shader for each number of textures a batch of Images
    // uses, the first time a batch uses it, stalling that frame. One texture
    // per batch means one shader, built at load, at the price of a draw call
    // per Text; baked looks share an atlas, so they still batch together.
    maxTextures: 1,
  },
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  scale: {
    // Keep the 1920 × 1080 layout and scale it to fit the window.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [SandboxScene],
});
