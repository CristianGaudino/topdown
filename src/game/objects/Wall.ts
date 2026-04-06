import { Rectangle } from './Rectangle';

// A wall segment made of one or two rectangular blocks
export class Wall {
  readonly blocks: Rectangle[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;

  constructor(x: number, y: number, type: 0 | 1, color: string) {
    this.x = x;
    this.y = y;

    if (type === 0) {
      // Horizontal: wide and short
      this.width = 120;
      this.height = 20;
    } else {
      // Vertical: narrow and tall
      this.width = 20;
      this.height = 120;
    }

    this.blocks = [new Rectangle(x, y, this.width, this.height, color)];
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const b of this.blocks) b.draw(ctx);
  }
}
