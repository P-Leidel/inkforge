import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../sandbox/arena';

export class SandboxScene extends Phaser.Scene {
  constructor() {
    super('sandbox');
  }

  create(): void {
    this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 'Inkforge', {
        fontFamily: 'sans-serif',
        fontSize: '64px',
        color: '#e8e2d0',
      })
      .setOrigin(0.5);
  }
}
