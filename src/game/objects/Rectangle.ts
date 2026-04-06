export class Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;

  constructor(x: number, y: number, width: number, height: number, color: string) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
  }

  get middle() {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }

  get top() { return this.y; }
  get bottom() { return this.y + this.height; }
  get left() { return this.x; }
  get right() { return this.x + this.width; }

  draw(ctx: CanvasRenderingContext2D, overrideColor?: string) {
    ctx.fillStyle = overrideColor ?? this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}
