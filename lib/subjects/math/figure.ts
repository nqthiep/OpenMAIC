/**
 * Builder for the state of the `geometry` visualizer (ADR 0015): a figure is points, segments, lines, circles, angles, polygons
 * and sampled curves in world coordinates. Pure and deterministic (no trigonometry, no Date, no Intl; coordinates are rounded to
 * three decimals so the frame data stays small and `-0` never appears). Every call to `snapshot` returns a fresh object, so a
 * frame can never be changed by a later one.
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { Messages } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind } from '@/lib/tutor/engine/types';

export type Pt = readonly [number, number];

export interface Bounds {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}
export interface FigPoint {
  id: string;
  x: number;
  y: number;
  label?: string;
  hidden?: boolean;
  at?: 'center';
  r?: number;
}
export interface FigState {
  bounds: Bounds;
  points: FigPoint[];
  segments: { id: string; from: string; to: string; dashed?: boolean; arrow?: boolean }[];
  lines: { id: string; through: [string, string] }[];
  circles: { id: string; center: string; r: number }[];
  angles: { id: string; at: string; from: string; to: string; label?: string }[];
  polygons: { id: string; pts?: string[]; xy?: [number, number][] }[];
  polylines: { id: string; xy: [number, number][]; dashed?: boolean }[];
}

/** The greatest common divisor of two integers (never negative). */
export const gcd = (x: number, y: number): number => (y === 0 ? Math.abs(x) : gcd(y, x % y));

/** The digits of `n` as superscripts: 2 → "²", 12 → "¹²". */
export const sup = (n: number): string =>
  String(n)
    .split('')
    .map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)] ?? d)
    .join('');

/** The fraction p/q in lowest terms as text with a minus sign and no decimal point: "7/4", "−3", "0". */
export function frac(p: number, q: number): string {
  const g = gcd(p, q) || 1;
  const [num, den] = [p / g, q / g];
  const sign = num * den < 0 ? '−' : '';
  return `${sign}${Math.abs(num)}${Math.abs(den) === 1 ? '' : `/${Math.abs(den)}`}`;
}

const round3 = (x: number): number => {
  const v = Math.round(x * 1000) / 1000;
  return v === 0 ? 0 : v;
};

/** cos 1° and sin 1°: the circle at whole degrees comes from rotating by these, so the catalog needs no trigonometry */
const COS1 = 0.9998476951563913;
const SIN1 = 0.01745240643728351;
const UNIT: Pt[] = (() => {
  const out: Pt[] = [[1, 0]];
  for (let i = 1; i < 360; i++) {
    const [x, y] = out[i - 1];
    out.push([x * COS1 - y * SIN1, x * SIN1 + y * COS1]);
  }
  return out;
})();
/** The point of the circle with radius `r` and centre O at `deg` degrees (any real number, counted counter-clockwise from the x axis). */
export function circlePoint(deg: number, r: number): Pt {
  const d = ((deg % 360) + 360) % 360;
  const i = Math.floor(d);
  const f = d - i;
  const [x0, y0] = UNIT[i];
  const [x1, y1] = UNIT[(i + 1) % 360];
  const x = x0 + f * (x1 - x0);
  const y = y0 + f * (y1 - y0);
  const len = Math.sqrt(x * x + y * y);
  return [(r * x) / len, (r * y) / len];
}

/** A box that holds every point, with `pad` world units around it. */
export function boundsOf(points: readonly Pt[], pad = 1): Bounds {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    xmin: round3(Math.min(...xs) - pad),
    xmax: round3(Math.max(...xs) + pad),
    ymin: round3(Math.min(...ys) - pad),
    ymax: round3(Math.max(...ys) + pad),
  };
}

export class Figure {
  private readonly s: FigState;
  constructor(bounds: Bounds) {
    this.s = {
      bounds: { ...bounds },
      points: [],
      segments: [],
      lines: [],
      circles: [],
      angles: [],
      polygons: [],
      polylines: [],
    };
  }

  /** A visible point with a label (default: its id). */
  point(id: string, p: Pt, label?: string, opts: { r?: number } = {}): this {
    this.s.points.push({ id, x: round3(p[0]), y: round3(p[1]), label: label ?? id, ...opts });
    return this;
  }
  /** A point that draws no dot: a vertex of a polygon, or an anchor for a text. */
  anchor(id: string, p: Pt, label?: string, center = false): this {
    this.s.points.push({
      id,
      x: round3(p[0]),
      y: round3(p[1]),
      hidden: true,
      ...(label !== undefined ? { label } : {}),
      ...(center ? { at: 'center' as const } : {}),
    });
    return this;
  }
  seg(
    id: string,
    from: string,
    to: string,
    opts: { dashed?: boolean; arrow?: boolean } = {},
  ): this {
    this.s.segments.push({ id, from, to, ...opts });
    return this;
  }
  line(id: string, a: string, b: string): this {
    this.s.lines.push({ id, through: [a, b] });
    return this;
  }
  circle(id: string, center: string, r: number): this {
    this.s.circles.push({ id, center, r: round3(r) });
    return this;
  }
  angle(id: string, at: string, from: string, to: string, label?: string): this {
    this.s.angles.push({ id, at, from, to, ...(label !== undefined ? { label } : {}) });
    return this;
  }
  /** A filled polygon through points that are already in the figure (usually anchors). */
  polygon(id: string, pts: readonly string[]): this {
    this.s.polygons.push({ id, pts: [...pts] });
    return this;
  }
  /** A polyline through world coordinates (a sampled curve); pieces split where the curve leaves the picture. */
  polyline(id: string, xy: readonly Pt[], dashed = false): this {
    this.s.polylines.push({
      id,
      xy: xy.map((p) => [round3(p[0]), round3(p[1])] as [number, number]),
      ...(dashed ? { dashed: true } : {}),
    });
    return this;
  }
  /** A filled polygon with its own vertices (no points are added to the figure). */
  poly(id: string, xy: readonly Pt[]): this {
    this.s.polygons.push({
      id,
      xy: xy.map((p) => [round3(p[0]), round3(p[1])] as [number, number]),
    });
    return this;
  }
  /** An axis-aligned rectangle as one polygon. */
  rect(id: string, x0: number, y0: number, x1: number, y1: number): this {
    return this.poly(id, [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ]);
  }
  snapshot(): FigState {
    return structuredClone(this.s);
  }
}

/**
 * The graph of `f` on [x0, x1] as polylines: `n` equal steps, cut into pieces where the value leaves [ymin, ymax], so a steep
 * branch never runs off the picture.
 */
export function curvePieces(
  f: (x: number) => number,
  x0: number,
  x1: number,
  ymin: number,
  ymax: number,
  n = 120,
): Pt[][] {
  const pieces: Pt[][] = [];
  let cur: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = f(x);
    if (y >= ymin && y <= ymax) cur.push([x, y]);
    else if (cur.length > 0) {
      pieces.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces.filter((p) => p.length > 1);
}

/** The upper half of the circle with centre `c` and radius `r`, from the right end to the left end, as `2n + 1` points. */
export function upperSemicircle(c: Pt, r: number, n = 16): Pt[] {
  // rotation by pi/(2n) is applied n times per quarter; constants for n = 16: cos(pi/32), sin(pi/32)
  const COS = 0.9951847266721969;
  const SIN = 0.0980171403295606;
  const pts: Pt[] = [];
  let x = 1;
  let y = 0;
  for (let i = 0; i <= 2 * n; i++) {
    pts.push([c[0] + r * x, c[1] + r * y]);
    const nx = x * COS - y * SIN;
    y = x * SIN + y * COS;
    x = nx;
  }
  pts[2 * n] = [c[0] - r, c[1]]; // the end is exact
  return pts;
}

/**
 * `put(text, codeLine, figure, vars, beat?, marks?)`: one frame of a figure walkthrough. The explanation is `text` in the frame's
 * locale with the `{vars}` filled; `base` highlights apply to every frame, `marks` to this one; `beat` becomes the frame's tag.
 */
export function framePut(
  emit: Emit<FigState>,
  locale: string,
  base: Readonly<Record<string, HighlightKind>> = {},
) {
  return (
    text: Messages,
    codeLine: number,
    fig: Figure,
    vars: Record<string, number | string>,
    beat?: string,
    marks: Readonly<Record<string, HighlightKind>> = {},
  ): void =>
    emit(fig.snapshot(), {
      explanation: fill(msg(text, locale), vars),
      codeLine,
      highlights: { ...base, ...marks },
      vars,
      ...(beat ? { tags: [`beat:${beat}`] } : {}),
    });
}
