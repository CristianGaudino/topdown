export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function testAABB(ax: number, ay: number, aw: number, ah: number, b: Rect): boolean {
  return ax < b.x + b.width && ax + aw > b.x && ay < b.y + b.height && ay + ah > b.y;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return testAABB(a.x, a.y, a.width, a.height, b);
}
