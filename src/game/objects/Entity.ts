import { Rectangle } from './Rectangle';
import { testAABB, Rect } from '../systems/Collision';

export abstract class Entity extends Rectangle {
  health: number;
  hostile: boolean;
  damageFlashTimer = 0;

  constructor(x: number, y: number, width: number, height: number, color: string, health: number) {
    super(x, y, width, height, color);
    this.health = health;
    this.hostile = false;
  }

  takeDamage(amount: number) {
    this.health -= amount;
    this.damageFlashTimer = 8;
  }

  collidesWithAny(statics: Rect[]): boolean {
    return statics.some(s => testAABB(this.x, this.y, this.width, this.height, s));
  }

  collidesWithRect(r: Rect): boolean {
    return testAABB(this.x, this.y, this.width, this.height, r);
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer--;
      super.draw(ctx, '#e74c3c');
    } else {
      super.draw(ctx);
    }
  }
}
