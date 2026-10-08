/**
 * Clip template: the Pythagorean theorem by dissection (card 3B-T11): four right triangles in a square of side
 * a + b leave a tilted square c²; rearranged they leave a² and b². TypeScript half only (the Manim scene is task
 * 3B-M11). Deterministic and browser-safe (ADR 0006): all identities are checked in integers.
 * Curriculum topic `triangle-geometry` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { a: number; b: number };

const inputSpec = {
  kind: 'record',
  fields: { a: { kind: 'int', range: [1, 9] }, b: { kind: 'int', range: [1, 9] } },
} as const;

const c2 = (i: In): number => i.a * i.a + i.b * i.b;

export const pythagorasDissectionEntry: ClipEntry<In> = defineClip<In>({
  id: 'pythagoras-dissection',
  curriculumTopics: ['m1-triangle-geometry'],
  title: m('Định lý Pythagore bằng cắt ghép', 'The Pythagorean theorem by dissection'),
  inputSpec,
  presets: [
    { id: 'three-four', label: m('3 và 4', '3 and 4'), input: { a: 3, b: 4 } },
    { id: 'equal', label: m('hai cạnh bằng nhau 2, 2', 'equal legs 2, 2'), input: { a: 2, b: 2 } },
    {
      id: 'thin',
      label: m('tam giác mỏng 1 và 9', 'a thin triangle 1 and 9'),
      input: { a: 1, b: 9 },
    },
    { id: 'six-eight', label: m('6 và 8', '6 and 8'), input: { a: 6, b: 8 } },
  ],
  chapters: [
    {
      id: 'triangles',
      startSec: 0,
      endSec: 9,
      label: m('Bốn tam giác', 'Four triangles'),
      before: m(
        'Ta có bốn tam giác vuông giống nhau với hai cạnh góc vuông a và b. Cạnh huyền của chúng là c.',
        'We have four identical right triangles with legs a and b. Their hypotenuse is c.',
      ),
      after: m(
        'Mỗi tam giác có diện tích a nhân b chia hai.',
        'Each triangle has area a times b over two.',
      ),
    },
    {
      id: 'big-square',
      startSec: 9,
      endSec: 20,
      label: m('Hình vuông lớn', 'The big square'),
      before: m(
        'Ta xếp bốn tam giác vào trong một hình vuông cạnh a cộng b, sao cho các cạnh huyền ở giữa.',
        'We place the four triangles inside a square of side a plus b, with the hypotenuses toward the middle.',
      ),
      after: m('Giữa các tam giác còn một khoảng trống.', 'A gap is left between the triangles.'),
      caption: m('(a + b)²', '(a + b)²'),
      ask: m('Theo em, phần trống ở giữa là hình gì?', 'What shape is the gap in the middle?'),
    },
    {
      id: 'rearrange',
      startSec: 20,
      endSec: 34,
      label: m('Xếp lại', 'Rearranging'),
      before: m(
        'Ta xếp lại bốn tam giác thành hai hình chữ nhật trong cùng hình vuông cạnh a cộng b.',
        'We rearrange the four triangles into two rectangles in the same square of side a plus b.',
      ),
      after: m(
        'Bây giờ phần trống gồm hai hình vuông, một cạnh a và một cạnh b.',
        'Now the gap is made of two squares, one of side a and one of side b.',
      ),
      caption: m('a² + b²', 'a² + b²'),
      ask: m('Phần trống bây giờ là những hình gì?', 'What shapes make up the gap now?'),
    },
    {
      id: 'conclude',
      startSec: 34,
      endSec: 45,
      label: m('Kết luận', 'The conclusion'),
      before: m(
        'Bốn tam giác không đổi, hình vuông lớn không đổi, nên phần trống trước và sau có cùng diện tích.',
        'The four triangles are unchanged and the big square is unchanged, so the gap has the same area before and after.',
      ),
      after: m(
        'Vậy c bình phương bằng a bình phương cộng b bình phương, với mọi tam giác vuông.',
        'So c squared equals a squared plus b squared, for every right triangle.',
      ),
      caption: m('c² = a² + b²', 'c² = a² + b²'),
    },
  ],
  invariants: (i) => {
    const gap = c2(i);
    // the big square holds four triangles of area ab/2 (twice ab in all) and the gap: (a + b)² = 2ab + c²
    return (i.a + i.b) * (i.a + i.b) === 2 * i.a * i.b + gap && gap === i.a * i.a + i.b * i.b;
  },
  sheet: {
    chapters: [
      {
        id: 'triangles',
        shows: m(
          'bốn tam giác vuông bằng nhau với cạnh a, b, c',
          'four equal right triangles with sides a, b, c',
        ),
        formulas: ['\\(\\text{diện tích mỗi tam giác} = \\frac{ab}{2}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng định lý chỉ đúng với bộ 3-4-5: nó đúng với mọi tam giác vuông.',
            'Thinking the theorem holds only for 3-4-5: it holds for every right triangle.',
          ),
        ],
        hints: hints(
          'Diện tích một tam giác vuông tính thế nào?',
          'Bằng nửa tích hai cạnh góc vuông.',
          'Bốn tam giác có tổng diện tích 2ab.',
          'How is the area of a right triangle computed?',
          'Half the product of its two legs.',
          'Four triangles have a total area of 2ab.',
        ),
      },
      {
        id: 'big-square',
        shows: m(
          'hình vuông cạnh a + b chứa bốn tam giác và một hình vuông nghiêng ở giữa',
          'a square of side a + b holding four triangles and a tilted square in the middle',
        ),
        formulas: ['\\((a + b)^2 = 4 \\cdot \\frac{ab}{2} + c^2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng hình vuông ở giữa có cạnh a hoặc b: cạnh của nó là cạnh huyền c.',
            'Thinking the middle square has side a or b: its side is the hypotenuse c.',
          ),
        ],
        hints: hints(
          'Phần trống ở giữa có các cạnh là gì?',
          'Bốn cạnh huyền c của các tam giác.',
          'Nên nó là hình vuông cạnh c, diện tích c².',
          'What are the sides of the gap in the middle?',
          'The four hypotenuses c of the triangles.',
          'So it is a square of side c, with area c².',
        ),
      },
      {
        id: 'rearrange',
        shows: m(
          'bốn tam giác xếp thành hai hình chữ nhật, phần trống là hai hình vuông a² và b²',
          'the four triangles forming two rectangles, the gap being two squares a² and b²',
        ),
        formulas: ['\\((a + b)^2 = 4 \\cdot \\frac{ab}{2} + a^2 + b^2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng việc xếp lại làm đổi diện tích phần trống: ta chỉ dịch tam giác, nên diện tích không đổi.',
            'Thinking rearranging changes the area of the gap: we only move triangles, so the area is unchanged.',
          ),
        ],
        hints: hints(
          'Sau khi xếp lại, phần trống gồm những hình nào?',
          'Hai hình vuông, một cạnh a và một cạnh b.',
          'Diện tích phần trống bây giờ là a² + b².',
          'After rearranging, what shapes make up the gap?',
          'Two squares, one of side a and one of side b.',
          'The area of the gap is now a² + b².',
        ),
      },
      {
        id: 'conclude',
        shows: m(
          'hai cách xếp cạnh nhau, phần trống được tô màu',
          'the two arrangements side by side with the gap coloured',
        ),
        formulas: ['\\(c^2 = a^2 + b^2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng cắt ghép chỉ là minh hoạ chứ không phải chứng minh: đây là một chứng minh, vì phép tính diện tích đúng với mọi a, b.',
            'Thinking a dissection is only an illustration and not a proof: this is a proof, because the area count holds for all a, b.',
          ),
        ],
        hints: hints(
          'Hai phần trống có cùng diện tích vì sao?',
          'Vì cùng hình vuông lớn trừ cùng bốn tam giác.',
          'Nên c² = a² + b².',
          'Why do the two gaps have the same area?',
          'Because both are the same big square minus the same four triangles.',
          'So c² = a² + b².',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: c² and c (rounded to 3 decimals). */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { c2: c2(i), c: Math.round(Math.sqrt(c2(i)) * 1000) / 1000 };
}

const pythagorasDissection: ClipModule<In> = { entry: pythagorasDissectionEntry, expectedDisplay };
export default pythagorasDissection;
