/**
 * Clip template: algebraic identities as areas (card 3B-T1): (a+b)² = a² + 2ab + b² and a² − b² = (a+b)(a−b).
 * TypeScript half only (the Manim scene is task 3B-M1). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `alg-identities` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type Id = 'square-sum' | 'diff-squares';
type In = { id: Id; a: number; b: number };

const inputSpec = {
  kind: 'record',
  fields: {
    id: { kind: 'enum', values: ['square-sum', 'diff-squares'] },
    a: { kind: 'int', range: [1, 9] },
    b: { kind: 'int', range: [1, 9] },
  },
} as const;

export const algIdentityAreaEntry: ClipEntry<In> = defineClip<In>({
  id: 'alg-identity-area',
  curriculumTopics: ['m1-alg-identities'],
  title: m('Hằng đẳng thức bằng diện tích', 'Algebraic identities as areas'),
  inputSpec,
  check: (i) =>
    i.id === 'diff-squares' && i.a <= i.b ? ['diff-squares-needs-a-greater-than-b'] : [],
  presets: [
    { id: 'sum-3-2', label: m('(3 + 2)²', '(3 + 2)²'), input: { id: 'square-sum', a: 3, b: 2 } },
    {
      id: 'sum-1-1',
      label: m('(1 + 1)² (nhỏ nhất)', '(1 + 1)² (smallest)'),
      input: { id: 'square-sum', a: 1, b: 1 },
    },
    { id: 'diff-5-2', label: m('5² − 2²', '5² − 2²'), input: { id: 'diff-squares', a: 5, b: 2 } },
    { id: 'diff-9-1', label: m('9² − 1²', '9² − 1²'), input: { id: 'diff-squares', a: 9, b: 1 } },
  ],
  chapters: [
    {
      id: 'figure',
      startSec: 0,
      endSec: 10,
      label: m('Hình vuông', 'The square'),
      before: m(
        'Ta vẽ một hình vuông: cạnh a cộng b cho bình phương của một tổng, cạnh a cho hiệu hai bình phương.',
        'We draw a square: side a plus b for the square of a sum, side a for the difference of squares.',
      ),
      after: m(
        'Diện tích hình vuông là cạnh nhân cạnh.',
        'The area of a square is its side times its side.',
      ),
    },
    {
      id: 'decompose',
      startSec: 10,
      endSec: 22,
      label: m('Chia nhỏ', 'Cutting it up'),
      before: m(
        'Ta chia hình vuông cạnh a cộng b thành bốn phần: hình vuông a bình phương, hai hình chữ nhật a nhân b, và hình vuông b bình phương. Với hiệu hai bình phương ta cắt bỏ góc b bình phương.',
        'We cut the square of side a plus b into four parts: the square a squared, two rectangles a times b, and the square b squared. For the difference we cut away the corner b squared.',
      ),
      after: m(
        'Mỗi phần có diện tích dễ đọc ngay từ hình.',
        'Each part has an area we can read straight from the picture.',
      ),
      caption: m('a² · ab · ab · b²', 'a² · ab · ab · b²'),
      ask: m(
        'Theo em, trong hình vuông cạnh a cộng b có mấy hình chữ nhật a nhân b?',
        'How many a-by-b rectangles are there in the square of side a plus b?',
      ),
    },
    {
      id: 'rearrange',
      startSec: 22,
      endSec: 36,
      label: m('Ghép lại', 'Rearranging'),
      before: m(
        'Ta di chuyển các phần còn lại và ghép chúng thành một hình mới, không bỏ sót và không chồng lên nhau.',
        'We move the remaining parts and fit them into a new shape, leaving nothing out and overlapping nothing.',
      ),
      after: m(
        'Diện tích không đổi vì ta chỉ dịch chuyển các phần, không thêm bớt.',
        'The area does not change because we only moved the parts, adding and removing nothing.',
      ),
      ask: m(
        'Theo em, phần còn lại sau khi ghép thành hình gì?',
        'What shape do the remaining parts make once fitted together?',
      ),
    },
    {
      id: 'formula',
      startSec: 36,
      endSec: 46,
      label: m('Công thức', 'The formula'),
      before: m(
        'Bây giờ ta đọc diện tích hai cách: một cách từ hình ban đầu, một cách từ hình đã ghép.',
        'Now we read the area two ways: once from the original figure, once from the rearranged one.',
      ),
      after: m(
        'Hai cách phải cho cùng một số, và đó chính là hằng đẳng thức.',
        'The two ways must give the same number, and that is exactly the identity.',
      ),
      caption: m('(a+b)² = a²+2ab+b²', '(a+b)² = a²+2ab+b²'),
    },
  ],
  invariants: (i) => {
    const a2 = i.a * i.a;
    const b2 = i.b * i.b;
    const ab = i.a * i.b;
    if (i.id === 'square-sum')
      return (i.a + i.b) ** 2 === a2 + 2 * ab + b2 && a2 > 0 && ab > 0 && b2 > 0;
    return a2 - b2 === (i.a + i.b) * (i.a - i.b) && a2 - b2 > 0 && b2 > 0;
  },
  sheet: {
    chapters: [
      {
        id: 'figure',
        shows: m('hình vuông cạnh a + b (hoặc cạnh a)', 'a square of side a + b (or of side a)'),
        formulas: ['\\((a + b)^2\\)', '\\(a^2 - b^2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng (a + b)² chỉ là diện tích hai hình vuông a² và b²: còn thiếu hai hình chữ nhật.',
            'Thinking (a + b)² is just the area of the two squares a² and b²: two rectangles are missing.',
          ),
        ],
        hints: hints(
          'Diện tích hình vuông cạnh a + b tính thế nào?',
          'Cạnh nhân cạnh: (a + b)·(a + b).',
          'Đó là (a + b)², ta sẽ chia nó thành các phần nhỏ.',
          'How is the area of a square of side a + b computed?',
          'Side times side: (a + b)·(a + b).',
          'That is (a + b)², and we will cut it into smaller parts.',
        ),
      },
      {
        id: 'decompose',
        shows: m(
          'hình vuông chia thành a², ab, ab, b² (hoặc cắt bỏ góc b²)',
          'the square cut into a², ab, ab, b² (or with the b² corner cut away)',
        ),
        formulas: ['\\(a^2 + ab + ab + b^2\\)', '\\(a^2 - b^2\\)'],
        misconceptions: [
          m(
            'Quên rằng có hai hình chữ nhật ab, nên viết a² + ab + b².',
            'Forgetting that there are two rectangles ab, and writing a² + ab + b².',
          ),
        ],
        hints: hints(
          'Một đường dọc và một đường ngang chia hình vuông thành mấy phần?',
          'Bốn phần: hai hình vuông và hai hình chữ nhật.',
          'Hai hình vuông là a² và b², hai hình chữ nhật đều là a·b.',
          'How many parts do one vertical and one horizontal line make?',
          'Four parts: two squares and two rectangles.',
          'The squares are a² and b², and both rectangles are a·b.',
        ),
      },
      {
        id: 'rearrange',
        shows: m(
          'các phần được di chuyển và ghép thành hình chữ nhật (a + b) × (a − b) cho hiệu hai bình phương',
          'the parts moved to form a rectangle (a + b) × (a − b) for the difference of squares',
        ),
        formulas: ['\\((a + b)(a - b)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng ghép lại làm diện tích thay đổi: ta chỉ dịch chuyển, nên diện tích giữ nguyên.',
            'Thinking rearranging changes the area: we only move parts, so the area is preserved.',
          ),
        ],
        hints: hints(
          'Sau khi cắt góc b², phần còn lại có hình gì?',
          'Hình chữ L; cắt đôi rồi ghép lại thì ra hình chữ nhật.',
          'Chiều dài a + b, chiều rộng a − b, nên diện tích (a + b)(a − b).',
          'After cutting the b² corner, what shape is left?',
          'An L; cut it in two and move a piece to get a rectangle.',
          'Length a + b, width a − b, so the area is (a + b)(a − b).',
        ),
      },
      {
        id: 'formula',
        shows: m(
          'hai cách đọc diện tích cạnh nhau và dấu bằng',
          'the two ways of reading the area side by side with an equals sign',
        ),
        formulas: ['\\((a + b)^2 = a^2 + 2ab + b^2\\)', '\\(a^2 - b^2 = (a + b)(a - b)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng hằng đẳng thức chỉ đúng với số nguyên dương nhỏ: nó đúng với mọi số, hình vẽ chỉ minh hoạ.',
            'Thinking the identity holds only for small positive integers: it holds for all numbers; the picture only illustrates it.',
          ),
        ],
        hints: hints(
          'Hai cách đọc diện tích cho cùng kết quả vì sao?',
          'Vì ta chỉ sắp xếp lại các phần, không thêm bớt.',
          'Nên hai biểu thức bằng nhau với mọi a, b: đó là hằng đẳng thức.',
          'Why do the two readings give the same result?',
          'Because we only rearranged the parts, adding and removing nothing.',
          'So the two expressions are equal for all a, b: that is an identity.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the areas of the pieces, from the formulas. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  const a2 = i.a * i.a;
  const b2 = i.b * i.b;
  if (i.id === 'square-sum') return { total: (i.a + i.b) * (i.a + i.b), a2, ab: i.a * i.b, b2 };
  return { a2, b2, diff: a2 - b2, prod: (i.a + i.b) * (i.a - i.b) };
}

const algIdentityArea: ClipModule<In> = { entry: algIdentityAreaEntry, expectedDisplay };
export default algIdentityArea;
