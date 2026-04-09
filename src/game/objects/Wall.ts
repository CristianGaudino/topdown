// ── Wall geometry vocabulary ────────────────────────────────────────────────
//
//  Slabs  : long, thin rectangular covers
//  Pillars: small-to-medium square columns
//  Crates : chunky square boxes (thicker than pillars)
//  L-shapes: two connected arms forming an L — drawn as a single polygon
//
//  L-A (┌)  top edge + left edge
//  L-B (┐)  top edge + right edge
//  L-C (└)  left edge + bottom edge
//  L-D (┘)  right edge + bottom edge
//
//  All L-shapes share dimensions HL × VL with arm thickness T.

export type WallKind =
  | 'slab-h'    | 'slab-v'
  | 'slab-h-lg' | 'slab-v-lg'
  | 'pillar'    | 'pillar-lg'
  | 'crate'
  | 'L-A' | 'L-B' | 'L-C' | 'L-D';

export interface WallPalette {
  base:  string; // main face colour
  hi:    string; // top / left highlight
  lo:    string; // bottom / right shadow
  trim:  string; // accent used for gate colour and fine detail
}

export const WALL_PALETTES: Record<string, WallPalette> = {
  stone:   { base: '#302820', hi: '#4a3c2c', lo: '#1c1810', trim: '#5c4c38' },
  slate:   { base: '#222c3a', hi: '#334050', lo: '#131822', trim: '#405268' },
  purple:  { base: '#241628', hi: '#3a2440', lo: '#140c18', trim: '#5c3278' },
  teal:    { base: '#142820', hi: '#204030', lo: '#0a1a14', trim: '#2a6850' },
  crimson: { base: '#300f14', hi: '#4e1c22', lo: '#1c080c', trim: '#7a2028' },
};

// ── Dimension constants ──────────────────────────────────────────────────────

const SH = 22, SHL = 130;         // slab height / horizontal length
const SVW = 22, SVL = 130;        // slab vertical width / length
const SHL_LG = 170, SHH_LG = 28;  // large horizontal slab
const SVW_LG = 28, SVL_LG = 170;  // large vertical slab
const PL = 28;                     // pillar (small)
const PL_LG = 44;                  // pillar (large)
const CR = 42;                     // crate
const HL = 90, VL = 80, T = 22;   // L-shape: horiz-arm-len, vert-arm-len, thickness

// Collision rectangles (relative to wall origin)
type BlockDef = [number, number, number, number]; // x, y, w, h

const BLOCK_DEFS: Record<WallKind, BlockDef[]> = {
  'slab-h':    [[0, 0, SHL, SH]],
  'slab-v':    [[0, 0, SVW, SVL]],
  'slab-h-lg': [[0, 0, SHL_LG, SHH_LG]],
  'slab-v-lg': [[0, 0, SVW_LG, SVL_LG]],
  'pillar':    [[0, 0, PL, PL]],
  'pillar-lg': [[0, 0, PL_LG, PL_LG]],
  'crate':     [[0, 0, CR, CR]],
  // L-shapes: two overlapping rectangles covering the arm area
  'L-A': [[0, 0, HL, T], [0, 0, T, VL]],
  'L-B': [[0, 0, HL, T], [HL - T, 0, T, VL]],
  'L-C': [[0, 0, T, VL], [0, VL - T, HL, T]],
  'L-D': [[HL - T, 0, T, VL], [0, VL - T, HL, T]],
};

// ── Wall class ───────────────────────────────────────────────────────────────

export class Wall {
  /** Collision rectangles used by the physics system. */
  readonly blocks: { x: number; y: number; width: number; height: number }[];

  private readonly ox: number;
  private readonly oy: number;
  private readonly kind: WallKind;
  private readonly palette: WallPalette;

  constructor(x: number, y: number, kind: WallKind, palette: WallPalette) {
    this.ox      = x;
    this.oy      = y;
    this.kind    = kind;
    this.palette = palette;
    this.blocks  = BLOCK_DEFS[kind].map(([bx, by, bw, bh]) => ({
      x: x + bx, y: y + by, width: bw, height: bh,
    }));
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.kind.startsWith('L-')) {
      this.drawL(ctx);
    } else {
      const [bx, by, bw, bh] = BLOCK_DEFS[this.kind][0];
      this.drawRect(ctx, this.ox + bx, this.oy + by, bw, bh);
    }
  }

  // ── Rectangle rendering ─────────────────────────────────────────────────────

  private drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const { base, hi, lo } = this.palette;
    const bev = Math.min(5, Math.min(w, h) * 0.18 | 0);

    // Main body
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);

    // Highlights (top + left faces)
    ctx.fillStyle = hi;
    ctx.fillRect(x,       y,       w,   bev); // top
    ctx.fillRect(x,       y + bev, bev, h - bev); // left

    // Shadows (bottom + right faces)
    ctx.fillStyle = lo;
    ctx.fillRect(x,           y + h - bev, w,   bev); // bottom
    ctx.fillRect(x + w - bev, y,           bev, h - bev); // right

    // Deterministic texture mark(s)
    this.drawMarks(ctx, x, y, w, h);
  }

  // ── L-shape rendering ───────────────────────────────────────────────────────

  private drawL(ctx: CanvasRenderingContext2D) {
    const ox = this.ox;
    const oy = this.oy;
    const { base, hi, lo } = this.palette;

    // 1. Clip to polygon and fill body
    ctx.save();
    ctx.beginPath();
    this.traceLPath(ctx, ox, oy);
    ctx.closePath();
    ctx.fillStyle = base;
    ctx.fill();
    ctx.clip(); // restrict bevel strokes to inside the polygon

    // 2. Bevel highlights and shadows via thick strokes along polygon edges
    ctx.lineWidth = 6;
    ctx.lineCap   = 'square';

    // Draw highlight on "lit" edges (top + left facing)
    ctx.strokeStyle = hi;
    ctx.beginPath();
    this.traceLHighlight(ctx, ox, oy);
    ctx.stroke();

    // Draw shadow on "dark" edges (bottom + right facing)
    ctx.strokeStyle = lo;
    ctx.beginPath();
    this.traceLShadow(ctx, ox, oy);
    ctx.stroke();

    ctx.restore();

    // 3. Deterministic marks (drawn after clip restore)
    this.drawMarks(ctx, ox, oy, HL, VL);
  }

  // Build the full outline path for each L variant
  private traceLPath(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
    const p = (x: number, y: number) => { ctx.lineTo(ox + x, oy + y); };
    ctx.moveTo(ox, oy); // start at top-left in all cases

    switch (this.kind) {
      case 'L-A': // ┌
        p(HL, 0); p(HL, T); p(T, T); p(T, VL); p(0, VL);
        break;
      case 'L-B': // ┐
        p(HL, 0); p(HL, VL); p(HL - T, VL); p(HL - T, T); p(0, T);
        break;
      case 'L-C': // └
        p(T, 0); p(T, VL - T); p(HL, VL - T); p(HL, VL); p(0, VL);
        break;
      case 'L-D': // ┘
        ctx.moveTo(ox + HL - T, oy); // top-left of vertical arm
        p(HL, 0); p(HL, VL); p(0, VL); p(0, VL - T); p(HL - T, VL - T);
        break;
    }
  }

  // top/left "lit" edge segments (drawn with hi colour inside the clip)
  private traceLHighlight(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
    const mv = (x: number, y: number) => ctx.moveTo(ox + x, oy + y);
    const ln = (x: number, y: number) => ctx.lineTo(ox + x, oy + y);

    switch (this.kind) {
      case 'L-A': // top edge + left edge
        mv(0, 0);  ln(HL, 0);  // top of H arm
        mv(0, 0);  ln(0, VL);  // left of V arm
        break;
      case 'L-B': // top edge + left end
        mv(0, 0);      ln(HL, 0);       // top
        mv(0, 0);      ln(0, T);        // left end of H arm
        mv(HL - T, T); ln(HL - T, VL);  // inside face (lit)
        break;
      case 'L-C': // top of V arm + left of V arm
        mv(0, 0);    ln(T, 0);          // top of V arm
        mv(0, 0);    ln(0, VL);         // left
        mv(T, VL-T); ln(HL, VL-T);      // top of H arm (inner face)
        break;
      case 'L-D': // top of V arm + inside left face
        mv(HL - T, 0);  ln(HL, 0);      // top of V arm
        mv(0, VL - T);  ln(HL - T, VL - T); // top of H arm
        mv(HL - T, 0);  ln(HL - T, VL - T); // inner left face of V arm
        break;
    }
  }

  // bottom/right "dark" edge segments (drawn with lo colour)
  private traceLShadow(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
    const mv = (x: number, y: number) => ctx.moveTo(ox + x, oy + y);
    const ln = (x: number, y: number) => ctx.lineTo(ox + x, oy + y);

    switch (this.kind) {
      case 'L-A':
        mv(HL, 0);   ln(HL, T);          // right end of H arm
        mv(T, T);    ln(T, VL);          // right of V arm (inner corner down)
        mv(0, VL);   ln(T, VL);          // bottom of V arm
        break;
      case 'L-B':
        mv(HL, 0);   ln(HL, VL);         // right of V arm
        mv(0, VL);   ln(HL, VL);         // bottom
        mv(0, T);    ln(HL - T, T);      // bottom of H arm (inner)
        break;
      case 'L-C':
        mv(T, 0);    ln(T, VL - T);      // right of V arm
        mv(0, VL);   ln(HL, VL);         // bottom
        mv(HL, VL - T); ln(HL, VL);      // right of H arm
        break;
      case 'L-D':
        mv(HL, 0);   ln(HL, VL);         // right of V arm
        mv(0, VL);   ln(HL, VL);         // bottom
        mv(0, VL - T); ln(0, VL);        // left of H arm
        break;
    }
  }

  // Deterministic texture scratches based on wall position (never random — stable across frames)
  private drawMarks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const seed = (x * 17 + y * 11) | 0;
    const { lo } = this.palette;
    ctx.save();
    ctx.strokeStyle = lo;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.28;

    if (w >= h) {
      // horizontal dominant — horizontal grain lines
      const count = 1 + (seed % 2);
      for (let i = 0; i < count; i++) {
        const ly = y + 5 + ((seed * (i + 3)) % Math.max(1, h - 10));
        ctx.beginPath();
        ctx.moveTo(x + 4, ly);
        ctx.lineTo(x + w - 4, ly);
        ctx.stroke();
      }
    } else {
      // vertical dominant — vertical grain
      const count = 1 + (seed % 2);
      for (let i = 0; i < count; i++) {
        const lx = x + 5 + ((seed * (i + 5)) % Math.max(1, w - 10));
        ctx.beginPath();
        ctx.moveTo(lx, y + 4);
        ctx.lineTo(lx, y + h - 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
