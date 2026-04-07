import { GunType } from './Gun';

export type PickupType = 'health' | 'gun';

const GUN_COLORS: Record<GunType, string> = {
  rifle:     '#003580',
  smg:       '#27ae60',
  sniper:    '#7f4f24',
  shotgun:   '#c0392b',
  sprinkler: '#e67e22',
};

const GUN_LABELS: Record<GunType, string> = {
  rifle:     'RFL',
  smg:       'SMG',
  sniper:    'SNP',
  shotgun:   'SHG',
  sprinkler: 'SPR',
};

export class Pickup {
  x: number;
  y: number;
  readonly width = 20;
  readonly height = 20;
  readonly type: PickupType;
  readonly gunType?: GunType;
  collected = false;

  private bobOffset = Math.random() * Math.PI * 2;
  private age = 0;

  constructor(x: number, y: number, type: PickupType, gunType?: GunType) {
    this.x = x - 10; // centre on spawn point
    this.y = y - 10;
    this.type = type;
    this.gunType = gunType;
  }

  update() {
    this.age++;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.collected) return;

    const bob = Math.sin(this.age * 0.08 + this.bobOffset) * 3;
    const drawY = this.y + bob;

    ctx.save();

    if (this.type === 'health') {
      // Green cross
      ctx.fillStyle = '#1a6b2f';
      ctx.strokeStyle = '#2ecc71';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(this.x, drawY, this.width, this.height, 4);
      ctx.fill();
      ctx.stroke();

      // Cross symbol
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(this.x + 8, drawY + 3, 4, 14);
      ctx.fillRect(this.x + 3, drawY + 8, 14, 4);
    } else if (this.type === 'gun' && this.gunType) {
      // Gun pickup box
      const col = GUN_COLORS[this.gunType];
      ctx.fillStyle = col + '33'; // transparent bg
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(this.x, drawY, this.width, this.height, 4);
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle = col;
      ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(GUN_LABELS[this.gunType], this.x + this.width / 2, drawY + this.height / 2);
    }

    // Glow pulse
    const glowAlpha = (Math.sin(this.age * 0.1) + 1) / 2 * 0.3;
    ctx.globalAlpha = glowAlpha;
    ctx.fillStyle = this.type === 'health' ? '#2ecc71' : '#ffffff';
    ctx.beginPath();
    ctx.roundRect(this.x - 2, drawY - 2, this.width + 4, this.height + 4, 6);
    ctx.fill();

    ctx.restore();
  }
}
