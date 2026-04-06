import { Rectangle } from './Rectangle';

export type GateStatus = 'closed' | 'locked' | 'open';

/**
 * A border wall with an optional gate in the middle.
 * firstBlock and thirdBlock are the solid flanking sections.
 * secondBlock is the gate — it may be solid (locked/closed) or removed (open).
 */
export class Border {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;

  firstBlock: Rectangle;
  secondBlock: Rectangle;
  thirdBlock: Rectangle;
  gateStatus: GateStatus;

  private readonly isHorizontal: boolean;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    gateStatus: GateStatus,
  ) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.gateStatus = gateStatus;
    this.isHorizontal = width > height;

    const gateSize = 120; // opening width

    if (this.isHorizontal) {
      // Top or bottom wall — split horizontally
      const third = (width - gateSize) / 2;
      this.firstBlock  = new Rectangle(x, y, third, height, color);
      this.secondBlock = new Rectangle(x + third, y, gateSize, height, color);
      this.thirdBlock  = new Rectangle(x + third + gateSize, y, third, height, color);
    } else {
      // Left or right wall — split vertically
      const third = (height - gateSize) / 2;
      this.firstBlock  = new Rectangle(x, y, width, third, color);
      this.secondBlock = new Rectangle(x, y + third, width, gateSize, color);
      this.thirdBlock  = new Rectangle(x, y + third + gateSize, width, third, color);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.firstBlock.draw(ctx);
    this.thirdBlock.draw(ctx);
    if (this.gateStatus !== 'open') {
      this.secondBlock.draw(ctx, this.gateStatus === 'locked' ? '#c0392b' : this.secondBlock.color);
    }
  }
}
