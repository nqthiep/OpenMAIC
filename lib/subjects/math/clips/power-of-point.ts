/**
 * Clip template: the power of a point (card 3B-T12): for every secant through P, PA·PB = |OP² − R²|; from an
 * outside point it equals the square of the tangent length. TypeScript half only (the Manim scene is task 3B-M12).
 * Deterministic and browser-safe (ADR 0006): the sample secants go through points of the circle given by the
 * rational parametrisation, so there is no trigonometry. The circle is centred at the origin O.
 * Curriculum topic `circle-power` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { R: number; px: number; py: number };

const inputSpec = {
  kind: 'record',
  fields: {
    R: { kind: 'int', range: [2, 6] },
    px: { kind: 'int', range: [-9, 9] },
    py: { kind: 'int', range: [-9, 9] },
  },
} as const;

/** the signed power of P: OP² − R² (positive outside, negative inside, 0 on the circle) */
const power = (i: In): number => i.px * i.px + i.py * i.py - i.R * i.R;

/** Six points Q of the circle by the rational parametrisation: R·((1 − s²)/(1 + s²), 2s/(1 + s²)). */
export const SLOPES = [0, 0.5, 1, 2, -0.5, -1] as const;
export function circlePoint(R: number, s: number): [number, number] {
  return [(R * (1 - s * s)) / (1 + s * s), (2 * R * s) / (1 + s * s)];
}

/**
 * The secant through P and Q: the second intersection B with the circle and the two lengths PA and PB.
 * The line P + t·(Q − P) meets the circle at t = 1 (the point Q) and at t = t2 = power / |Q − P|².
 */
export function secantThrough(
  i: In,
  s: number,
): { a: [number, number]; b: [number, number]; pa: number; pb: number } | null {
  const Q = circlePoint(i.R, s);
  const dx = Q[0] - i.px;
  const dy = Q[1] - i.py;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return null; // P is Q: the secant through P and itself is not defined
  const t2 = power(i) / len2;
  const B: [number, number] = [i.px + t2 * dx, i.py + t2 * dy];
  return { a: Q, b: B, pa: Math.sqrt(len2), pb: Math.abs(t2) * Math.sqrt(len2) };
}

export const powerOfPointEntry: ClipEntry<In> = defineClip<In>({
  id: 'power-of-point',
  curriculumTopics: ['circle-power'],
  title: m('Phương tích của một điểm', 'The power of a point'),
  inputSpec,
  presets: [
    {
      id: 'outside',
      label: m('P ở ngoài đường tròn', 'P outside the circle'),
      input: { R: 5, px: 8, py: 0 },
    },
    {
      id: 'inside',
      label: m('P ở trong đường tròn', 'P inside the circle'),
      input: { R: 5, px: 1, py: 2 },
    },
    {
      id: 'on-circle',
      label: m('P nằm trên đường tròn (phương tích 0)', 'P on the circle (power 0)'),
      input: { R: 5, px: 3, py: 4 },
    },
    {
      id: 'far',
      label: m('P rất xa, đường tròn nhỏ', 'P far away, a small circle'),
      input: { R: 2, px: 9, py: 9 },
    },
  ],
  chapters: [
    {
      id: 'circle',
      startSec: 0,
      endSec: 9,
      label: m('Đường tròn và điểm P', 'The circle and the point P'),
      before: m(
        'Ta có một đường tròn tâm O bán kính R và một điểm P, ở ngoài, ở trong hoặc ngay trên đường tròn.',
        'We have a circle with centre O and radius R and a point P, outside, inside or right on the circle.',
      ),
      after: m(
        'Ta sẽ vẽ các đường thẳng đi qua P và cắt đường tròn.',
        'We will draw lines through P that cut the circle.',
      ),
    },
    {
      id: 'secant-1',
      startSec: 9,
      endSec: 20,
      label: m('Cát tuyến thứ nhất', 'The first secant'),
      before: m(
        'Một đường thẳng qua P cắt đường tròn tại hai điểm A và B. Ta đo PA và PB.',
        'A line through P meets the circle at two points A and B. We measure PA and PB.',
      ),
      after: m('Ta nhân hai độ dài lại với nhau.', 'We multiply the two lengths together.'),
      caption: m('PA · PB', 'PA · PB'),
      ask: m(
        'Theo em, tích PA nhân PB bằng bao nhiêu?',
        'What do you think the product PA times PB is?',
      ),
    },
    {
      id: 'secant-2',
      startSec: 20,
      endSec: 33,
      label: m('Cát tuyến khác', 'Another secant'),
      before: m(
        'Ta quay đường thẳng quanh P và đo lại tích PA nhân PB ở nhiều vị trí.',
        'We turn the line about P and measure the product PA times PB again in many positions.',
      ),
      after: m(
        'Các độ dài PA và PB thay đổi, nhưng tích của chúng thì không.',
        'The lengths PA and PB change, but their product does not.',
      ),
      caption: m('tích không đổi', 'product constant'),
      ask: m(
        'Khi quay cát tuyến, tích PA nhân PB có đổi không?',
        'As the secant turns, does the product PA times PB change?',
      ),
    },
    {
      id: 'tangent',
      startSec: 33,
      endSec: 45,
      label: m('Tiếp tuyến', 'The tangent'),
      before: m(
        'Nếu P ở ngoài, một cát tuyến quay tới vị trí tiếp xúc tại T. Lúc đó A và B trùng nhau.',
        'If P is outside, one secant turns to the position that touches the circle at T. Then A and B coincide.',
      ),
      after: m(
        'Vậy tích bằng PT bình phương, và cũng bằng OP bình phương trừ R bình phương. Nếu P không ở ngoài thì không có tiếp tuyến.',
        'So the product equals PT squared, and also OP squared minus R squared. If P is not outside there is no tangent.',
      ),
      caption: m('PA·PB = PT²', 'PA·PB = PT²'),
    },
  ],
  invariants: (i) => {
    const want = Math.abs(power(i));
    let seen = 0;
    for (const s of SLOPES) {
      const sec = secantThrough(i, s);
      if (sec === null) continue;
      // the second point lies on the circle, and the two lengths multiply to |OP² − R²|
      if (Math.abs(sec.b[0] * sec.b[0] + sec.b[1] * sec.b[1] - i.R * i.R) > 1e-9) return false;
      if (Math.abs(sec.pa * sec.pb - want) > 1e-9) return false;
      seen++;
    }
    return seen >= 4; // at most the secants through P itself are skipped
  },
  sheet: {
    chapters: [
      {
        id: 'circle',
        shows: m(
          'đường tròn tâm O, điểm P ở một trong ba vị trí',
          'a circle with centre O and the point P in one of the three positions',
        ),
        formulas: ['\\(OP^2 - R^2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng phương tích luôn dương: nó âm khi P ở trong, bằng 0 khi P trên đường tròn.',
            'Thinking the power is always positive: it is negative when P is inside and 0 when P is on the circle.',
          ),
        ],
        hints: hints(
          'Điểm P có thể ở những vị trí nào so với đường tròn?',
          'Ngoài, trong hoặc trên đường tròn.',
          'So OP với R: OP > R là ngoài, OP < R là trong, OP = R là trên đường tròn.',
          'Where can P lie relative to the circle?',
          'Outside, inside or on it.',
          'Compare OP with R: OP > R outside, OP < R inside, OP = R on the circle.',
        ),
      },
      {
        id: 'secant-1',
        shows: m(
          'đường thẳng qua P cắt đường tròn tại A và B, các đoạn PA, PB được đo',
          'a line through P meeting the circle at A and B, with PA and PB measured',
        ),
        formulas: ['\\(PA \\cdot PB\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng tích PA·PB phụ thuộc vào hướng của đường thẳng: nó không phụ thuộc.',
            'Thinking the product PA·PB depends on the direction of the line: it does not.',
          ),
        ],
        hints: hints(
          'PA và PB đo từ đâu?',
          'Từ P tới hai giao điểm A và B.',
          'Nếu P ở trong, A và B ở hai phía của P; nếu P ở ngoài, cùng một phía.',
          'From where are PA and PB measured?',
          'From P to the two intersection points A and B.',
          'If P is inside, A and B lie on opposite sides of P; if outside, on the same side.',
        ),
      },
      {
        id: 'secant-2',
        shows: m(
          'đường thẳng quay quanh P; tích hiển thị cạnh đó không đổi',
          'the line turning about P; the product shown beside it stays the same',
        ),
        formulas: ['\\(PA \\cdot PB = |OP^2 - R^2|\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng quay cát tuyến làm tích tăng hoặc giảm: PA tăng thì PB giảm vừa đủ để tích giữ nguyên.',
            'Thinking turning the secant raises or lowers the product: when PA grows PB shrinks just enough to keep it.',
          ),
        ],
        hints: hints(
          'Khi PA dài ra, PB sẽ ra sao?',
          'PB ngắn lại, vì tích không đổi.',
          'Tích luôn bằng |OP² − R²|, một số chỉ phụ thuộc vị trí của P.',
          'When PA gets longer, what happens to PB?',
          'PB gets shorter, because the product is constant.',
          'The product always equals |OP² − R²|, a number that depends only on the position of P.',
        ),
      },
      {
        id: 'tangent',
        shows: m(
          'cát tuyến thành tiếp tuyến PT; hoặc dòng "không có tiếp tuyến" khi P không ở ngoài',
          'the secant becoming the tangent PT; or the words "no tangent" when P is not outside',
        ),
        formulas: ['\\(PT^2 = OP^2 - R^2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng từ điểm ở trong cũng kẻ được tiếp tuyến: chỉ từ điểm ở ngoài hoặc trên đường tròn.',
            'Thinking a tangent can be drawn from an inside point: only from an outside point or one on the circle.',
          ),
        ],
        hints: hints(
          'Khi A và B trùng nhau, PA·PB bằng gì?',
          'Bằng PT², vì PA = PB = PT.',
          'Nên PT² = OP² − R², cũng là định lý Pythagore trong tam giác vuông OTP.',
          'When A and B coincide, what is PA·PB?',
          'PT², since PA = PB = PT.',
          'So PT² = OP² − R², which is also Pythagoras in the right triangle OTP.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the signed power OP² − R². */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { power: power(i) };
}

const powerOfPoint: ClipModule<In> = { entry: powerOfPointEntry, expectedDisplay };
export default powerOfPoint;
