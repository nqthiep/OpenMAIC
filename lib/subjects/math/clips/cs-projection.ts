/**
 * Clip template: Cauchy–Schwarz by projection (card 3A-T2, SCHEMA Phase 3 §3). TypeScript half only: the entry,
 * the pure invariant and the numbers the scene writes to manifest.json (the Manim scene is task 3A-M2).
 * Deterministic and browser-safe (ADR 0006). Curriculum topic `inequality-classic` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { ux: number; uy: number; vx: number; vy: number };

const inputSpec = {
  kind: 'record',
  fields: {
    ux: { kind: 'int', range: [-9, 9] },
    uy: { kind: 'int', range: [-9, 9] },
    vx: { kind: 'int', range: [-9, 9] },
    vy: { kind: 'int', range: [-9, 9] },
  },
} as const;

const dot = (i: In): number => i.ux * i.vx + i.uy * i.vy;
const cross = (i: In): number => i.ux * i.vy - i.uy * i.vx;
const normU = (i: In): number => Math.sqrt(i.ux * i.ux + i.uy * i.uy);
const normV = (i: In): number => Math.sqrt(i.vx * i.vx + i.vy * i.vy);
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export const csProjectionEntry: ClipEntry<In> = defineClip<In>({
  id: 'cs-projection',
  curriculumTopics: ['m2-inequality-classic'],
  title: m('Cauchy–Schwarz bằng hình chiếu', 'Cauchy–Schwarz by projection'),
  inputSpec,
  check: (i) => [
    ...(i.ux === 0 && i.uy === 0 ? ['u-is-zero'] : []),
    ...(i.vx === 0 && i.vy === 0 ? ['v-is-zero'] : []),
  ],
  presets: [
    { id: 'generic', label: m('Tổng quát', 'Generic'), input: { ux: 3, uy: 1, vx: 1, vy: 2 } },
    { id: 'parallel', label: m('Cùng phương', 'Parallel'), input: { ux: 2, uy: 1, vx: 4, vy: 2 } },
    {
      id: 'perpendicular',
      label: m('Vuông góc', 'Perpendicular'),
      input: { ux: 1, uy: 0, vx: 0, vy: 1 },
    },
    {
      id: 'opposite',
      label: m('Ngược hướng', 'Opposite'),
      input: { ux: 1, uy: 1, vx: -2, vy: -2 },
    },
  ],
  chapters: [
    {
      id: 'vectors',
      startSec: 0,
      endSec: 10,
      label: m('Hai vectơ', 'Two vectors'),
      before: m(
        'Ta vẽ hai vectơ u và v xuất phát từ gốc toạ độ. Ta muốn so tích vô hướng của chúng với tích hai độ dài.',
        'We draw two vectors u and v from the origin. We want to compare their dot product with the product of the two lengths.',
      ),
      after: m(
        'Nhớ rằng độ dài của u là căn của ux bình phương cộng uy bình phương.',
        'Remember the length of u is the root of ux squared plus uy squared.',
      ),
    },
    {
      id: 'projection',
      startSec: 10,
      endSec: 24,
      label: m('Hình chiếu', 'The projection'),
      before: m(
        'Ta hạ từ đầu mút của v một đường vuông góc xuống đường thẳng chứa u. Đoạn từ gốc tới chân đường vuông góc là hình chiếu của v lên u.',
        'From the tip of v we drop a perpendicular onto the line of u. The piece from the origin to the foot is the projection of v onto u.',
      ),
      after: m(
        'Độ dài hình chiếu bằng giá trị tuyệt đối của u chấm v chia cho độ dài u.',
        'The length of the projection is the absolute value of u dot v divided by the length of u.',
      ),
      caption: m('proj = |u·v| / |u|', 'proj = |u·v| / |u|'),
      ask: m(
        'Theo em, hình chiếu của v lên u có thể dài hơn chính v không?',
        'Can the projection of v onto u be longer than v itself?',
      ),
    },
    {
      id: 'inequality',
      startSec: 24,
      endSec: 37,
      label: m('Bất đẳng thức', 'The inequality'),
      before: m(
        'Hình chiếu là một cạnh góc vuông của tam giác có v làm cạnh huyền. Cạnh góc vuông không dài hơn cạnh huyền.',
        'The projection is a leg of a right triangle whose hypotenuse is v. A leg is never longer than the hypotenuse.',
      ),
      after: m(
        'Vậy giá trị tuyệt đối của u chấm v chia cho độ dài u nhỏ hơn hoặc bằng độ dài v. Nhân hai vế với độ dài u ta được bất đẳng thức.',
        'So the absolute value of u dot v over the length of u is at most the length of v. Multiplying by the length of u gives the inequality.',
      ),
      caption: m('|u·v| ≤ |u||v|', '|u·v| ≤ |u||v|'),
      ask: m(
        'Khi nào thì hình chiếu dài đúng bằng v?',
        'When is the projection exactly as long as v?',
      ),
    },
    {
      id: 'equality',
      startSec: 37,
      endSec: 48,
      label: m('Dấu bằng', 'Equality'),
      before: m(
        'Ta quay v dần về phía đường thẳng của u và xem hình chiếu so với v.',
        'We turn v gradually toward the line of u and watch the projection against v.',
      ),
      after: m(
        'Khi v song song với u, hình chiếu dài bằng v và dấu bằng xảy ra. Điều kiện là tích chéo ux nhân vy trừ uy nhân vx bằng 0.',
        'When v is parallel to u the projection is as long as v and equality holds. The condition is the cross product ux times vy minus uy times vx equals 0.',
      ),
      caption: m('u ∥ v ⇔ dấu =', 'u ∥ v ⇔ equality'),
    },
  ],
  invariants: (i) => {
    const bound = normU(i) * normV(i);
    const lhs = Math.abs(dot(i));
    // equality exactly when the vectors are parallel (cross product 0); otherwise the gap is cross² / (bound + lhs)
    return lhs <= bound + 1e-9 && Math.abs(lhs - bound) < 1e-9 === (cross(i) === 0);
  },
  sheet: {
    chapters: [
      {
        id: 'vectors',
        shows: m(
          'hai vectơ u và v vẽ từ gốc toạ độ',
          'the two vectors u and v drawn from the origin',
        ),
        formulas: [
          '\\(|\\vec{u}| = \\sqrt{u_x^2 + u_y^2}\\)',
          '\\(\\vec{u}\\cdot\\vec{v} = u_xv_x + u_yv_y\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng bất đẳng thức chỉ đúng với vectơ có toạ độ dương: nó đúng với mọi vectơ.',
            'Thinking the inequality holds only for vectors with positive coordinates: it holds for all vectors.',
          ),
        ],
        hints: hints(
          'Tích vô hướng tính từ toạ độ thế nào?',
          'Nhân hai toạ độ x với nhau, hai toạ độ y với nhau, rồi cộng.',
          'u·v = ux·vx + uy·vy, và độ dài là căn của tổng bình phương.',
          'How is the dot product computed from coordinates?',
          'Multiply the two x coordinates, the two y coordinates, then add.',
          'u·v = ux·vx + uy·vy, and a length is the root of a sum of squares.',
        ),
      },
      {
        id: 'projection',
        shows: m(
          'hình chiếu của v lên đường thẳng chứa u, chân đường vuông góc',
          'the projection of v onto the line of u, with the foot of the perpendicular',
        ),
        formulas: ['\\(\\text{proj} = \\frac{|\\vec{u}\\cdot\\vec{v}|}{|\\vec{u}|}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng hình chiếu có thể âm: độ dài thì không âm; dấu của u·v chỉ cho biết hướng.',
            'Thinking the projection can be negative: a length is not; the sign of u·v only gives the direction.',
          ),
        ],
        hints: hints(
          'Hình chiếu của v lên u được dựng thế nào?',
          'Hạ đường vuông góc từ đầu mút v xuống đường thẳng của u.',
          'Độ dài hình chiếu là |v| nhân giá trị tuyệt đối của cosin góc, tức |u·v| / |u|.',
          'How is the projection of v onto u drawn?',
          'Drop the perpendicular from the tip of v onto the line of u.',
          'Its length is |v| times the absolute cosine of the angle, that is |u·v| / |u|.',
        ),
      },
      {
        id: 'inequality',
        shows: m(
          'tam giác vuông có v làm cạnh huyền và hình chiếu làm cạnh góc vuông',
          'the right triangle with v as hypotenuse and the projection as a leg',
        ),
        formulas: [
          '\\(\\text{proj} \\le |\\vec{v}|\\)',
          '\\(|\\vec{u}\\cdot\\vec{v}| \\le |\\vec{u}||\\vec{v}|\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng dấu bằng chỉ khi u = v: chỉ cần hai vectơ cùng phương (kể cả ngược hướng hoặc khác độ dài).',
            'Thinking equality needs u = v: parallel vectors suffice (even opposite or of different length).',
          ),
        ],
        hints: hints(
          'Trong một tam giác vuông, cạnh nào dài nhất?',
          'Cạnh huyền, nên hình chiếu không dài hơn v.',
          'proj ≤ |v|, nhân hai vế với |u| thì được |u·v| ≤ |u||v|.',
          'In a right triangle, which side is the longest?',
          'The hypotenuse, so the projection is no longer than v.',
          'proj ≤ |v|, multiply both sides by |u| to get |u·v| ≤ |u||v|.',
        ),
      },
      {
        id: 'equality',
        shows: m(
          'v quay tới song song với u; hình chiếu dài dần tới độ dài v',
          'v turning until parallel to u; the projection grows to the length of v',
        ),
        formulas: [
          '\\(u_xv_y - u_yv_x = 0\\)',
          '\\(|\\vec{u}\\cdot\\vec{v}| = |\\vec{u}||\\vec{v}|\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng vuông góc cũng cho dấu bằng: khi vuông góc u·v = 0, hình chiếu bằng 0, xa dấu bằng nhất.',
            'Thinking perpendicular also gives equality: when perpendicular u·v = 0 and the projection is 0, the farthest from equality.',
          ),
        ],
        hints: hints(
          'Hình chiếu dài bằng v khi v nằm ở đâu so với u?',
          'Khi v nằm trên đường thẳng chứa u, tức hai vectơ cùng phương.',
          'Cùng phương nghĩa là tích chéo ux·vy − uy·vx = 0.',
          'Where must v lie for the projection to be as long as v?',
          'On the line holding u, that is the vectors are parallel.',
          'Parallel means the cross product ux·vy − uy·vx = 0.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json (lengths and projection rounded to 3 decimals). */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return {
    dot: dot(i),
    normU: round3(normU(i)),
    normV: round3(normV(i)),
    proj: round3(Math.abs(dot(i)) / normU(i)),
  };
}

const csProjection: ClipModule<In> = { entry: csProjectionEntry, expectedDisplay };
export default csProjection;
