import type { FigState } from '@/lib/subjects/math/figure';
import type { Frame } from '@/lib/tutor/engine/types';

/** Helpers shared by the figure walkthrough tests (ADR 0015). */
export const pointOf = (f: Frame<FigState>, id: string): [number, number] => {
  const p = f.state.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return [p.x, p.y];
};

/** The vertices of the polygon `id`: its own coordinates, or the points it names. */
export function verticesOf(f: Frame<FigState>, id: string): [number, number][] | null {
  const g = f.state.polygons.find((q) => q.id === id);
  if (!g) return null;
  return g.xy ?? (g.pts ?? []).map((p) => pointOf(f, p));
}

/** The area of the polygon `id` of the frame (shoelace formula on its vertices), or null when it is not drawn. */
export function polygonArea(f: Frame<FigState>, id: string): number | null {
  const g = f.state.polygons.find((q) => q.id === id);
  if (!g) return null;
  const v = verticesOf(f, id)!;
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    const [x1, y1] = v[i];
    const [x2, y2] = v[(i + 1) % v.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** The bounding box [x0, y0, x1, y1] of the polygon `id`. */
export function polygonBox(f: Frame<FigState>, id: string): [number, number, number, number] {
  const v = verticesOf(f, id)!;
  return [
    Math.min(...v.map((p) => p[0])),
    Math.min(...v.map((p) => p[1])),
    Math.max(...v.map((p) => p[0])),
    Math.max(...v.map((p) => p[1])),
  ];
}

/** Do two axis-aligned boxes share area (touching edges do not count)? */
export const boxesOverlap = (
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean => a[0] < b[2] - 1e-9 && b[0] < a[2] - 1e-9 && a[1] < b[3] - 1e-9 && b[1] < a[3] - 1e-9;
