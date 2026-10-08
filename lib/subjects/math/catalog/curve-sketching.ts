/**
 * Walkthrough entry: sketching a polynomial of degree at most 3 with its derivative (card 3B-W3).
 * Deterministic and browser-safe: no Intl/Date/Math.random and no Math.pow (ADR 0006); points are computed
 * with Horner's rule and the plotter only joins them. Roots of f' use the quadratic formula (Math.sqrt is allowed).
 * Curriculum topic `m3-derivative-graphs` follows the Phase 3 SCHEMA §7 outline [Inference];
 * see docs/tutor/curriculum/curriculum-math-vn.json (its sources are [Unverified]).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { c: number[] };
type S = {
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
  curves: { id: string; points: [number, number][] }[];
  marks: { id: string; x: number; y: number; label: string }[];
  vlines: { id: string; x: number; label?: string }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
/** no `-0` in the data (it hashes as 0 but compares unequal to it) */
const z = (x: number): number => (x === 0 ? 0 : x);
const r2 = (x: number): number => z(Math.round(x * 100) / 100);
const SUP = ['', '', '²', '³'];

/** Horner's rule: coefficients in increasing degree. */
export const horner = (c: readonly number[], x: number): number =>
  c.reduceRight((acc, k) => acc * x + k, 0);

/** The polynomial as text, highest degree first: `x³ − 3x`; `0` when every coefficient is 0. */
export function polyText(c: readonly number[]): string {
  let out = '';
  for (let i = c.length - 1; i >= 0; i--) {
    const k = c[i];
    if (k === 0) continue;
    const abs = Math.abs(k);
    const body = i === 0 ? String(abs) : `${abs === 1 ? '' : abs}x${SUP[i] ?? ''}`;
    out += out === '' ? `${k < 0 ? '−' : ''}${body}` : ` ${k < 0 ? '−' : '+'} ${body}`;
  }
  return out === '' ? '0' : out;
}

const derive = (c: readonly number[]): number[] => c.slice(1).map((k, i) => (i + 1) * k);

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars; no decimals. */
const EX = {
  start: m(
    'Vẽ đồ thị đa thức bậc {deg}: f(x) = {f}. Các bước: đạo hàm, nghiệm của f′, xét dấu, cực trị, điểm uốn, vẽ.',
    'Sketch the degree-{deg} polynomial f(x) = {f}: derivative, roots of f′, sign, extrema, inflection, sketch.',
  ),
  derivative: m(
    'Đạo hàm của f là f′(x) = {fp}. Dấu của f′ cho biết f đang tăng hay giảm.',
    'The derivative of f is f′(x) = {fp}. The sign of f′ tells whether f is increasing or decreasing.',
  ),
  rootsTwo: m(
    'f′(x) = 0 có hai nghiệm, ta gọi là x₁ < x₂: đây là hai điểm tới hạn. Đường thẳng đứng đánh dấu chúng.',
    'f′(x) = 0 has two roots, call them x₁ < x₂: the two critical points. The vertical lines mark them.',
  ),
  rootsOne: m(
    'f′(x) = 0 có một nghiệm, ta gọi là x₁: đây là điểm tới hạn duy nhất. Đường thẳng đứng đánh dấu nó.',
    'f′(x) = 0 has one root, call it x₁: the only critical point. The vertical line marks it.',
  ),
  rootsNone: m(
    'f′(x) = 0 vô nghiệm hoặc f′ là hằng khác 0, nên f không có điểm tới hạn: đồ thị luôn tăng hoặc luôn giảm.',
    'f′(x) = 0 has no root, or f′ is a non-zero constant, so f has no critical point: the graph only rises or only falls.',
  ),
  signChange: m(
    'Xét điểm tới hạn x{ci}: bên trái nó f′ mang dấu {sl}, bên phải mang dấu {sr}, nên f′ đổi dấu tại x{ci}.',
    'Look at the critical point x{ci}: to its left f′ has the sign {sl}, to its right {sr}, so f′ changes sign at x{ci}.',
  ),
  signNone: m(
    'Qua nghiệm kép x{ci}, f′ không đổi dấu: f vẫn tăng (hoặc vẫn giảm) hai bên, nên đây không phải cực trị.',
    'Across the double root x{ci} f′ does not change sign: f keeps rising (or keeps falling), so this is not an extremum.',
  ),
  extremaSome: m(
    'Điểm tới hạn mà f′ đổi dấu là cực trị. Đổi từ dương sang âm là cực đại, từ âm sang dương là cực tiểu. Có {ne} cực trị.',
    'A critical point where f′ changes sign is an extremum. Positive to negative is a maximum, negative to positive a minimum. There are {ne}.',
  ),
  extremaNone: m(
    'Không có điểm nào mà f′ đổi dấu, nên f không có cực trị.',
    'There is no point where f′ changes sign, so f has no extremum.',
  ),
  inflection: m(
    'f″(x) = {fpp} đổi dấu tại điểm uốn: đồ thị đổi chiều cong. Điểm uốn không phải cực trị.',
    'f″(x) = {fpp} changes sign at the inflection point: the graph changes its bending. An inflection point is not an extremum.',
  ),
  sketch: m(
    'Nối các điểm đặc biệt bằng một đường cong trơn, đúng hướng tăng giảm đã xét ở trên.',
    'Join the special points with a smooth curve that rises and falls as found above.',
  ),
  done: m(
    'Đồ thị bậc {deg} này có {ne} cực trị và {ni} điểm uốn. Đạo hàm cho biết hướng, đạo hàm cấp hai cho biết độ cong.',
    'This degree-{deg} graph has {ne} extrema and {ni} inflection points. The derivative gives the direction, the second derivative the bending.',
  ),
};

const hints = (
  a: string,
  b: string,
  c: string,
  ea: string,
  eb: string,
  ec: string,
): readonly [Messages, Messages, Messages] => [m(a, ea), m(b, eb), m(c, ec)];

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Để vẽ đồ thị đa thức bậc {deg}, f(x) = {f}, ta không tính thật nhiều điểm. Ta tìm vài điểm đặc biệt rồi nối chúng đúng hướng.',
      'To sketch the degree-{deg} polynomial f(x) = {f}, we do not compute many points. We find a few special points and join them in the right directions.',
    ),
    hints: hints(
      'Một đồ thị gồm vô số điểm. Ta cần biết những gì để vẽ nhanh?',
      'Chỗ đồ thị đổi từ tăng sang giảm, và chỗ nó đổi chiều cong.',
      'Dùng đạo hàm: f′ cho hướng, f″ cho độ cong.',
      'A graph has infinitely many points. What do we need to know to sketch it fast?',
      'Where the graph turns from rising to falling, and where its bending changes.',
      'Use the derivative: f′ gives the direction, f″ the bending.',
    ),
    misconceptions: [
      m(
        'Nghĩ rằng cần tính thật nhiều điểm rồi nối lại: các điểm đặc biệt và hướng tăng giảm cho đồ thị đúng hơn.',
        'Thinking we must compute many points and join them: special points and directions give a more faithful graph.',
      ),
    ],
  },
  {
    id: 'derivative',
    label: m('Đạo hàm', 'The derivative'),
    narration: m(
      'Ta lấy đạo hàm: f′(x) = {fp}. Nó cho biết độ dốc của đồ thị tại mỗi điểm: dương thì đồ thị đi lên, âm thì đi xuống.',
      'We take the derivative: f′(x) = {fp}. It gives the slope of the graph at each point: positive means rising, negative means falling.',
    ),
    hints: hints(
      'Đạo hàm của một số hạng axⁿ là gì?',
      'Là n·a·xⁿ⁻¹, và hằng số có đạo hàm 0.',
      'Áp dụng cho từng số hạng của f rồi cộng lại.',
      'What is the derivative of a term axⁿ?',
      'It is n·a·xⁿ⁻¹, and a constant has derivative 0.',
      'Apply it to each term of f and add the results.',
    ),
    misconceptions: [
      m(
        'Quên bỏ số hạng hằng khi lấy đạo hàm, hoặc không nhân số mũ xuống.',
        'Keeping the constant term when differentiating, or forgetting to bring the exponent down.',
      ),
    ],
  },
  {
    id: 'roots',
    label: m('Nghiệm của f′', 'Roots of f′'),
    narration: m(
      'Điểm tới hạn là nơi f′ bằng 0. Giải f′(x) = 0 bằng công thức nghiệm bậc hai hoặc bậc nhất. Ở đây có {nr} điểm tới hạn.',
      'A critical point is where f′ is 0. Solve f′(x) = 0 with the quadratic or linear formula. Here there are {nr} critical points.',
    ),
    hints: hints(
      'Tại điểm cao nhất hay thấp nhất cục bộ, độ dốc là bao nhiêu?',
      'Bằng 0, vì tiếp tuyến nằm ngang.',
      'Giải f′(x) = 0; với f′ bậc hai dùng Δ = b² − 4ac.',
      'At a local highest or lowest point, what is the slope?',
      'It is 0, because the tangent is horizontal.',
      'Solve f′(x) = 0; for a quadratic f′ use Δ = b² − 4ac.',
    ),
    misconceptions: [
      m(
        'Nghĩ rằng mọi nghiệm của f′ đều là cực trị: nghiệm kép của f′ không cho cực trị.',
        'Thinking every root of f′ is an extremum: a double root of f′ gives none.',
      ),
    ],
  },
  {
    id: 'sign',
    label: m('Xét dấu f′', 'Sign of f′'),
    narration: m(
      'Tại điểm tới hạn x₀ ≈ {x0}, f′ đổi dấu từ {sl} sang {sr}. Dấu của f′ ở hai bên cho ta biết đó là đỉnh hay đáy của đồ thị.',
      'At the critical point x₀ ≈ {x0}, f′ changes sign from {sl} to {sr}. The signs on both sides tell us whether it is a peak or a valley of the graph.',
    ),
    ask: {
      text: m(
        'Theo em, nếu f′ đổi dấu từ dương sang âm thì đó là cực đại hay cực tiểu?',
        'If f′ changes sign from positive to negative, is that a maximum or a minimum?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Cực đại', 'Maximum'), m('Cực tiểu', 'Minimum')],
        answer: (frame) =>
          (frame.meta.vars as Record<string, number | string>).sl === '+' ? 0 : 1,
      },
    },
    hints: hints(
      'f′ dương nghĩa là f đang làm gì?',
      'f tăng; f′ âm thì f giảm. Tăng rồi giảm thì đồ thị có hình gì?',
      'Tăng rồi giảm tạo một đỉnh: cực đại. Giảm rồi tăng tạo một đáy: cực tiểu.',
      'What is f doing when f′ is positive?',
      'It rises; when f′ is negative it falls. What shape does rising then falling make?',
      'Rising then falling makes a peak: a maximum. Falling then rising makes a valley: a minimum.',
    ),
    misconceptions: [
      m(
        'Nhầm chiều: f′ đổi từ dương sang âm là cực đại (tăng rồi giảm), không phải cực tiểu.',
        'Mixing up the direction: f′ from positive to negative is a maximum (rises then falls), not a minimum.',
      ),
    ],
  },
  {
    id: 'extrema',
    label: m('Cực trị', 'Extrema'),
    narration: m(
      'Ta đánh dấu các cực trị lên đồ thị, mỗi điểm có hoành độ là điểm tới hạn và tung độ tính bằng f. Tổng cộng có {ne} cực trị.',
      'We mark the extrema on the graph; each has the critical point as its x and the value of f as its y. In all there are {ne} extrema.',
    ),
    hints: hints(
      'Tung độ của cực trị tính thế nào?',
      'Thay hoành độ điểm tới hạn vào f.',
      'Điểm có f′ đổi dấu từ dương sang âm là cực đại; ngược lại là cực tiểu.',
      'How do we get the y of an extremum?',
      'Put the x of the critical point into f.',
      'A point where f′ goes from positive to negative is a maximum; the reverse is a minimum.',
    ),
    misconceptions: [
      m(
        'Đưa hoành độ vào f′ thay vì f để tính tung độ: f′ tại điểm tới hạn luôn bằng 0.',
        'Putting the x into f′ instead of f to get the y: f′ at a critical point is always 0.',
      ),
    ],
  },
  {
    id: 'inflection',
    label: m('Điểm uốn', 'Inflection'),
    narration: m(
      'Đạo hàm cấp hai f″(x) = {fpp} bằng 0 tại x ≈ {xi}, và đổi dấu ở đó. Đồ thị đổi từ cong xuống sang cong lên (hoặc ngược lại): điểm uốn.',
      'The second derivative f″(x) = {fpp} is 0 at x ≈ {xi} and changes sign there. The graph turns from bending down to bending up (or the reverse): an inflection point.',
    ),
    hints: hints(
      'Đạo hàm cấp hai cho biết điều gì?',
      'Độ cong: f″ dương thì đồ thị cong lên, âm thì cong xuống.',
      'Điểm uốn là nơi f″ đổi dấu; với bậc ba đó là nghiệm của f″(x) = 0.',
      'What does the second derivative tell us?',
      'The bending: f″ positive means bending up, negative means bending down.',
      'An inflection point is where f″ changes sign; for a cubic it is the root of f″(x) = 0.',
    ),
    misconceptions: [
      m(
        'Nhầm điểm uốn với cực trị: tại điểm uốn tiếp tuyến thường không nằm ngang.',
        'Mixing up an inflection point with an extremum: at an inflection point the tangent is usually not horizontal.',
      ),
    ],
  },
  {
    id: 'sketch',
    label: m('Vẽ đồ thị', 'Sketch'),
    narration: m(
      'Giờ ta có đủ điểm đặc biệt. Ta vẽ một đường cong trơn qua chúng, tăng hay giảm đúng như dấu của f′ đã cho.',
      'Now we have all the special points. We draw a smooth curve through them, rising or falling as the sign of f′ says.',
    ),
    hints: hints(
      'Bắt đầu vẽ từ đâu?',
      'Từ các điểm đặc biệt đã đánh dấu: cực trị và điểm uốn.',
      'Nối chúng bằng đường trơn, nhớ hướng tăng giảm giữa hai điểm liên tiếp.',
      'Where do we start drawing?',
      'From the special points already marked: the extrema and the inflection point.',
      'Join them with a smooth curve, keeping the direction between two consecutive points.',
    ),
    misconceptions: [
      m(
        'Nối các điểm bằng đoạn thẳng: đồ thị đa thức luôn trơn, không có góc nhọn.',
        'Joining the points with straight segments: a polynomial graph is smooth, with no corners.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tóm lại: đạo hàm cho ta các điểm tới hạn và dấu của f′ phân loại chúng; đạo hàm cấp hai cho điểm uốn. Với đa thức này có {ne} cực trị và {ni} điểm uốn.',
      'In short: the derivative gives the critical points and the sign of f′ classifies them; the second derivative gives the inflection. This polynomial has {ne} extrema and {ni} inflection points.',
    ),
    hints: hints(
      'Hai công cụ chính của khảo sát hàm số là gì?',
      'Đạo hàm cấp một (hướng) và cấp hai (độ cong).',
      'Cực trị là nơi f′ đổi dấu, điểm uốn là nơi f″ đổi dấu.',
      'What are the two main tools of curve sketching?',
      'The first derivative (direction) and the second (bending).',
      'An extremum is where f′ changes sign, an inflection where f″ changes sign.',
    ),
    misconceptions: [
      m(
        'Nghĩ rằng đa thức bậc ba luôn có hai cực trị: bậc ba có thể không có cực trị nào, như x³.',
        'Thinking a cubic always has two extrema: a cubic may have none, like x³.',
      ),
    ],
  },
];

type Critical = { x: number; y: number; kind: 'max' | 'min' | 'none'; sl: string; sr: string };

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const c = input.c;
  const deg = c.length - 1;
  const d1 = derive(c);
  const d2 = derive(d1);
  const f = (x: number): number => horner(c, x);
  const fp = (x: number): number => horner(d1, x);
  const sign = (v: number): string => (v > 0 ? '+' : '−');

  // roots of f' (sorted): quadratic formula for degree 3, linear for degree 2
  let roots: number[] = [];
  if (deg === 3) {
    const [c0, b, a] = d1;
    const disc = b * b - 4 * a * c0;
    if (disc > 0)
      roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].sort(
        (p, q) => p - q,
      );
    else if (disc === 0) roots = [-b / (2 * a)];
  } else if (deg === 2) {
    roots = [-d1[0] / d1[1]];
  }
  // test points that are strictly between or outside the roots, so f' is never 0 there
  const tests =
    roots.length === 2
      ? [roots[0] - 1, (roots[0] + roots[1]) / 2, roots[1] + 1]
      : roots.length === 1
        ? [roots[0] - 1, roots[0] + 1]
        : [];
  const critical: Critical[] = roots.map((x, i) => {
    const sl = fp(tests[i]);
    const sr = fp(tests[i + 1]);
    const changes = sl * sr < 0;
    return {
      x,
      y: f(x),
      kind: !changes ? 'none' : sl > 0 ? 'max' : 'min',
      sl: sign(sl),
      sr: sign(sr),
    };
  });
  const extrema = critical.filter((k) => k.kind !== 'none');
  const inflectionX = deg === 3 ? -c[2] / (3 * c[3]) : null;

  const XS = Array.from({ length: 33 }, (_, i) => -4 + i * 0.25);
  const curve = (id: string, g: (x: number) => number) => ({
    id,
    points: XS.map((x) => [x, z(g(x))] as [number, number]),
  });
  const ys = [
    ...XS.map(f),
    ...critical.map((k) => k.y),
    ...(inflectionX === null ? [] : [f(inflectionX)]),
    0,
  ];
  const bounds = {
    xmin: -4,
    xmax: 4,
    ymin: Math.max(Math.floor(Math.min(...ys) - 1), -20),
    ymax: Math.min(Math.ceil(Math.max(...ys) + 1), 20),
  };

  const lab = (vi: string, en: string): string => msg(m(vi, en), ctx.locale);
  const fText = polyText(c);
  const fpText = polyText(d1);
  const fppText = polyText(d2);

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    tag: string | undefined,
    curves: S['curves'],
    marks: S['marks'],
    vlines: S['vlines'],
    highlights: Record<string, HighlightKind>,
  ): void => {
    emit(
      { bounds, curves, marks, vlines },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights,
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  const fCurve = curve('f', f);
  const dfCurve = curve('df', fp);
  const base = { deg, f: fText };
  const vline = (k: Critical, i: number) => ({ id: `x${i + 1}`, x: z(k.x), label: `x${i + 1}` });
  const mark = (id: string, x: number, y: number, label: string) => ({
    id,
    x: z(x),
    y: z(y),
    label,
  });
  const extremaMarks = (list: Critical[]) =>
    list.map((k, i) =>
      mark(
        `${k.kind}${i + 1}`,
        k.x,
        k.y,
        k.kind === 'max' ? lab('Cực đại', 'max') : lab('Cực tiểu', 'min'),
      ),
    );

  put(EX.start, 1, base, 'start', [fCurve], [], [], { f: 'active' });
  put(EX.derivative, 2, { f: fText, fp: fpText }, 'derivative', [fCurve, dfCurve], [], [], {
    df: 'compare',
  });

  const vlines = critical.map(vline);
  put(
    critical.length === 2 ? EX.rootsTwo : critical.length === 1 ? EX.rootsOne : EX.rootsNone,
    3,
    {
      nr: critical.length,
      ...(critical[0] ? { r1: r2(critical[0].x) } : {}),
      ...(critical[1] ? { r2: r2(critical[1].x) } : {}),
    },
    'roots',
    [fCurve, dfCurve],
    [],
    vlines,
    { df: 'compare', ...Object.fromEntries(vlines.map((v) => [v.id, 'visited' as const])) },
  );

  critical.forEach((k, i) => {
    const ci = '₁₂'[i] ?? '';
    const vars = { x0: r2(k.x), sl: k.sl, sr: k.sr, ci };
    const marks: Record<string, HighlightKind> = { df: 'compare', [`x${i + 1}`]: 'active' };
    if (k.kind === 'none') {
      put(EX.signNone, 4, { x0: r2(k.x), ci }, undefined, [fCurve, dfCurve], [], vlines, marks);
    } else {
      put(EX.signChange, 4, vars, 'sign', [fCurve, dfCurve], [], vlines, marks);
    }
  });

  const shownExtrema = extremaMarks(extrema);
  put(
    extrema.length > 0 ? EX.extremaSome : EX.extremaNone,
    5,
    { ne: extrema.length },
    'extrema',
    [fCurve],
    shownExtrema,
    [],
    Object.fromEntries(shownExtrema.map((k) => [k.id, 'result' as const])),
  );

  let inflection: S['marks'] = [];
  if (inflectionX !== null) {
    inflection = [mark('infl', inflectionX, f(inflectionX), lab('Uốn', 'infl'))];
    put(
      EX.inflection,
      6,
      { fpp: fppText, xi: r2(inflectionX), yi: r2(f(inflectionX)) },
      'inflection',
      [fCurve],
      [...shownExtrema, ...inflection],
      [],
      {
        infl: 'active',
        ...Object.fromEntries(shownExtrema.map((k) => [k.id, 'visited' as const])),
      },
    );
  }

  const specials = [...shownExtrema, ...inflection];
  put(EX.sketch, 7, {}, 'sketch', [fCurve], specials, [], {
    f: 'result',
    ...Object.fromEntries(specials.map((k) => [k.id, 'result' as const])),
  });
  put(
    EX.done,
    6,
    { deg, ne: extrema.length, ni: inflection.length },
    'done',
    [fCurve],
    specials,
    [],
    { f: 'result' },
  );
}

export const curveSketchingEntry: WalkthroughEntry<In, S> = {
  id: 'curve-sketching',
  entryRev: 2,
  subject: 'math',
  visualizer: 'functionPlotter',
  curriculumTopics: ['m3-derivative-graphs'],
  title: m(
    'Khảo sát và vẽ đồ thị đa thức (bậc không quá 3)',
    'Sketching a polynomial graph (degree at most 3)',
  ),
  code: {
    pseudo: [
      'Cho đa thức f(x) = c₀ + c₁x + c₂x² + c₃x³, hệ số bậc cao nhất khác 0',
      'Đạo hàm f′(x): với mỗi số hạng cₖxᵏ lấy k·cₖxᵏ⁻¹',
      'Giải f′(x) = 0: các nghiệm là điểm tới hạn',
      'Xét dấu f′ ở hai bên mỗi điểm tới hạn; f′ đổi dấu thì là cực trị',
      'Cực đại nếu f′ đổi từ dương sang âm, cực tiểu nếu từ âm sang dương; tung độ = f(điểm tới hạn)',
      'Điểm uốn (bậc ba): nghiệm của f″(x) = 0, nơi f″ đổi dấu',
      'Vẽ đường cong trơn qua các điểm đặc biệt, tăng giảm theo dấu của f′',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec: { kind: 'record', fields: { c: { kind: 'int-array', len: [2, 4], range: [-3, 3] } } },
  check: (input) => (input.c[input.c.length - 1] === 0 ? ['leading-coefficient-zero'] : []),
  customInput: false,
  presets: [
    { id: 'cubic', label: m('x³ − 3x', 'x³ − 3x'), input: { c: [0, -3, 0, 1] } },
    { id: 'square', label: m('x²', 'x²'), input: { c: [0, 0, 1] } },
    {
      id: 'pure-cubic',
      label: m('x³ (có điểm uốn, không cực trị)', 'x³ (inflection, no extremum)'),
      input: { c: [0, 0, 0, 1] },
    },
    { id: 'neg-cubic', label: m('3x² − x³', '3x² − x³'), input: { c: [0, 0, 3, -1] } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'roots',
      text: m(
        'Nghiệm của f′ chưa chắc là cực trị: phải xét f′ có đổi dấu không. Với f(x) = x³, f′(0) = 0 nhưng f′ không đổi dấu nên không có cực trị.',
        'A root of f′ is not necessarily an extremum: check that f′ changes sign. For f(x) = x³, f′(0) = 0 but f′ does not change sign, so there is no extremum.',
      ),
    },
    {
      beat: 'sign',
      text: m(
        'Đừng nhầm chiều: f′ từ dương sang âm là cực đại, từ âm sang dương là cực tiểu.',
        'Do not mix up the direction: f′ from positive to negative is a maximum, from negative to positive a minimum.',
      ),
    },
  ],
  maxFrames: 20,
  maxBytes: 150_000,
  run,
};
