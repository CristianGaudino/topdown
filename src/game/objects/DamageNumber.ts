export class DamageNumber {
  x: number;
  y: number;
  readonly value: number;
  readonly isHeal: boolean;
  private lifetime = 45; // frames
  private readonly maxLifetime = 45;
  stopped = false;

  constructor(x: number, y: number, value: number, isHeal = false) {
    this.x = x;
    this.y = y;
    this.value = value;
    this.isHeal = isHeal;
  }

  update() {
    this.y -= 0.8;
    this.lifetime--;
    if (this.lifetime <= 0) this.stopped = true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.stopped) return;
    const alpha = this.lifetime / this.maxLifetime;
    const scale = this.lifetime > this.maxLifetime * 0.7
      ? 1 + (1 - this.lifetime / this.maxLifetime) * 2  // pop-in scale
      : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.round(14 * scale)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.isHeal ? '#2ecc71' : '#e74c3c';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    const text = this.isHeal ? `+${this.value}` : `-${this.value}`;
    ctx.strokeText(text, this.x, this.y);
    ctx.fillText(text, this.x, this.y);
    ctx.restore();
  }
}
