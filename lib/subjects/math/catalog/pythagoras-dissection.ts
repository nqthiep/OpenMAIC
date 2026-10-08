/**
 * Walkthrough entry: The Pythagorean theorem by dissection (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m1-triangle-geometry`.
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState, type Pt } from '@/lib/subjects/math/figure';

type In = { a: number; b: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { a: { kind: 'int', range: [1, 9] }, b: { kind: 'int', range: [1, 9] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bốn tam giác', 'Four triangles'),
    narration: m(
      'Ta có bốn tam giác vuông giống nhau với hai cạnh góc vuông a và b. Cạnh huyền của chúng là c. Mỗi tam giác có diện tích a nhân b chia hai.',
      'We have four identical right triangles with legs a and b. Their hypotenuse is c. Each triangle has area a times b over two.',
    ),
    hints: [
      m(
        'Diện tích một tam giác vuông tính thế nào?',
        'How is the area of a right triangle computed?',
      ),
      m('Bằng nửa tích hai cạnh góc vuông.', 'Half the product of its two legs.'),
      m('Bốn tam giác có tổng diện tích 2ab.', 'Four triangles have a total area of 2ab.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng định lý chỉ đúng với bộ 3-4-5: nó đúng với mọi tam giác vuông.',
        'Thinking the theorem holds only for 3-4-5: it holds for every right triangle.',
      ),
    ],
  },
  {
    id: 'big-square',
    label: m('Hình vuông lớn', 'The big square'),
    narration: m(
      'Ta xếp bốn tam giác vào trong một hình vuông cạnh a cộng b, sao cho các cạnh huyền ở giữa. Giữa các tam giác còn một khoảng trống.',
      'We place the four triangles inside a square of side a plus b, with the hypotenuses toward the middle. A gap is left between the triangles.',
    ),
    ask: {
      text: m('Hình ở giữa còn lại là hình gì?', 'What shape is the gap in the middle?'),
      predict: {
        kind: 'choice',
        options: [
          m('Hình vuông', 'A square'),
          m('Hình chữ nhật', 'A rectangle'),
          m('Hình thoi không vuông', 'A non-square rhombus'),
        ],
        // four equal sides c and four right angles (the angles of the triangles add up to 90 degrees)
        answer: () => 0,
      },
    },
    hints: [
      m('Phần trống ở giữa có các cạnh là gì?', 'What are the sides of the gap in the middle?'),
      m('Bốn cạnh huyền c của các tam giác.', 'The four hypotenuses c of the triangles.'),
      m('Nên nó là hình vuông cạnh c, diện tích c².', 'So it is a square of side c, with area c².'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hình vuông ở giữa có cạnh a hoặc b: cạnh của nó là cạnh huyền c.',
        'Thinking the middle square has side a or b: its side is the hypotenuse c.',
      ),
    ],
  },
  {
    id: 'rearrange',
    label: m('Xếp lại', 'Rearranging'),
    narration: m(
      'Ta xếp lại bốn tam giác thành hai hình chữ nhật trong cùng hình vuông cạnh a cộng b. Bây giờ phần trống gồm hai hình vuông, một cạnh a và một cạnh b.',
      'We rearrange the four triangles into two rectangles in the same square of side a plus b. Now the gap is made of two squares, one of side a and one of side b.',
    ),
    ask: {
      text: m('Bây giờ phần trống gồm những hình nào?', 'What shapes make up the gap now?'),
      predict: {
        kind: 'choice',
        options: [
          m('Hai hình vuông', 'Two squares'),
          m('Hai hình chữ nhật', 'Two rectangles'),
          m('Một hình vuông', 'One square'),
        ],
        // the squares of side a and of side b
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Sau khi xếp lại, phần trống gồm những hình nào?',
        'After rearranging, what shapes make up the gap?',
      ),
      m(
        'Hai hình vuông, một cạnh a và một cạnh b.',
        'Two squares, one of side a and one of side b.',
      ),
      m('Diện tích phần trống bây giờ là a² + b².', 'The area of the gap is now a² + b².'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng việc xếp lại làm đổi diện tích phần trống: ta chỉ dịch tam giác, nên diện tích không đổi.',
        'Thinking rearranging changes the area of the gap: we only move triangles, so the area is unchanged.',
      ),
    ],
  },
  {
    id: 'conclude',
    label: m('Kết luận', 'The conclusion'),
    narration: m(
      'Bốn tam giác không đổi, hình vuông lớn không đổi, nên phần trống trước và sau có cùng diện tích. Vậy c bình phương bằng a bình phương cộng b bình phương, với mọi tam giác vuông.',
      'The four triangles are unchanged and the big square is unchanged, so the gap has the same area before and after. So c squared equals a squared plus b squared, for every right triangle.',
    ),
    hints: [
      m('Hai phần trống có cùng diện tích vì sao?', 'Why do the two gaps have the same area?'),
      m(
        'Vì cùng hình vuông lớn trừ cùng bốn tam giác.',
        'Because both are the same big square minus the same four triangles.',
      ),
      m('Nên c² = a² + b².', 'So c² = a² + b².'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cắt ghép chỉ là minh hoạ chứ không phải chứng minh: đây là một chứng minh, vì phép tính diện tích đúng với mọi a, b.',
        'Thinking a dissection is only an illustration and not a proof: this is a proof, because the area count holds for all a, b.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Hai cách sắp bốn tam giác trong cùng một hình vuông cạnh a + b cho c² = a² + b². Thử các mẫu khác, kể cả hai cạnh góc vuông bằng nhau.',
      'Two ways to arrange four triangles in the same square of side a + b give c² = a² + b². Try the other presets, including equal legs.',
    ),
    hints: [
      m('Hai cách sắp xếp khác nhau ở chỗ nào?', 'How do the two arrangements differ?'),
      m(
        'Cùng bốn tam giác, cùng hình vuông, chỉ khác phần trống.',
        'Same four triangles, same square, only the gap differs.',
      ),
      m(
        'Phần trống bằng nhau: một hình vuông c² và hai hình vuông a², b².',
        'The gaps are equal: one square c² and two squares a², b².',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chứng minh chỉ đúng cho tam giác 3-4-5: cách ghép hình dùng a, b bất kỳ.',
        'Thinking the proof is only for the 3-4-5 triangle: the cutting works for any a and b.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Bốn tam giác vuông giống hệt nhau: hai cạnh góc vuông a = {a}, b = {b}, cạnh huyền c. Diện tích mỗi tam giác là ab/2 = {ab}/2.',
    'Four identical right triangles: legs a = {a}, b = {b}, hypotenuse c. Each triangle has area ab/2 = {ab}/2.',
  ),
  big: m(
    'Đặt bốn tam giác vào hình vuông cạnh a + b = {s}, cạnh huyền hướng vào trong. Ở giữa còn một hình vuông nghiêng cạnh c.',
    'Place the four triangles in a square of side a + b = {s}, hypotenuses inward. In the middle a tilted square of side c is left.',
  ),
  rearrange: m(
    'Sắp lại cũng bốn tam giác ấy thành hai hình chữ nhật a × b. Phần trống bây giờ là hai hình vuông: a² = {a2} và b² = {b2}.',
    'Rearrange the same four triangles into two a × b rectangles. The gap is now two squares: a² = {a2} and b² = {b2}.',
  ),
  conclude: m(
    'Hai hình vuông lớn có cùng diện tích {s2} và cùng bốn tam giác, nên phần trống bằng nhau: c² = a² + b², tức {c2} = {a2} + {b2}.',
    'The two big squares have the same area {s2} and the same four triangles, so the gaps are equal: c² = a² + b², that is {c2} = {a2} + {b2}.',
  ),
  done: m(
    'Vậy c² = a² + b² với mọi tam giác vuông. Ở đây a = {a}, b = {b}: c² = {c2}.',
    'So c² = a² + b² for every right triangle. Here a = {a}, b = {b}: c² = {c2}.',
  ),
};

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { a, b } = input;
  const s = a + b;
  const g = 1.2;
  const nums = { a, b, ab: a * b, s, a2: a * a, b2: b * b, c2: a * a + b * b, s2: s * s };
  const put = framePut(emit, ctx.locale);
  const bounds = {
    xmin: -1,
    xmax: 2 * s + g + 1,
    ymin: -1,
    ymax: Math.max(s, 2 * b + g) + 1,
  };
  /** a right triangle: the right-angle vertex, then the end of the leg a, then the end of the leg b */
  const tri = (f: Figure, id: string, r: Pt, pa: Pt, pb: Pt): Figure => f.poly(id, [r, pa, pb]);
  const arrangement1 = (f: Figure, dx: number): Figure => {
    const P = (x: number, y: number): Pt => [x + dx, y];
    tri(f, `t1.${dx}`, P(0, 0), P(a, 0), P(0, b));
    tri(f, `t2.${dx}`, P(s, 0), P(s, a), P(a, 0));
    tri(f, `t3.${dx}`, P(s, s), P(b, s), P(s, a));
    tri(f, `t4.${dx}`, P(0, s), P(0, b), P(b, s));
    return f.poly(`mid.${dx}`, [P(a, 0), P(s, a), P(b, s), P(0, b)]);
  };
  const arrangement2 = (f: Figure, dx: number): Figure => {
    const P = (x: number, y: number): Pt => [x + dx, y];
    tri(f, `u1.${dx}`, P(0, a), P(a, a), P(0, s));
    tri(f, `u2.${dx}`, P(a, s), P(0, s), P(a, a));
    tri(f, `u3.${dx}`, P(a, 0), P(s, 0), P(a, a));
    tri(f, `u4.${dx}`, P(s, a), P(s, 0), P(a, a));
    return f.rect(`sqa.${dx}`, dx, 0, dx + a, a).rect(`sqb.${dx}`, dx + a, a, dx + s, s);
  };
  const triMarks = (dx: number, kind: 'a1' | 'a2'): Record<string, 'group-0'> =>
    Object.fromEntries(
      (kind === 'a1' ? ['t1', 't2', 't3', 't4'] : ['u1', 'u2', 'u3', 'u4']).map((k) => [
        `${k}.${dx}`,
        'group-0' as const,
      ]),
    );

  // 1: four loose triangles, 2 x 2, each with its legs along the axes
  const loose = new Figure(bounds);
  const spots: Pt[] = [
    [0, 0],
    [a + g, 0],
    [0, b + g],
    [a + g, b + g],
  ];
  spots.forEach(([x, y], k) =>
    loose.poly(`l${k}`, [
      [x, y],
      [x + a, y],
      [x, y + b],
    ]),
  );
  loose
    .anchor('la', [a / 2, -0.5], 'a', true)
    .anchor('lb', [-0.5, b / 2], 'b', true)
    .anchor('lc', [a / 2 + 0.6, b / 2 + 0.6], 'c', true);
  put(EX.start, 1, loose, nums, 'start', {
    l0: 'group-0',
    l1: 'group-0',
    l2: 'group-0',
    l3: 'group-0',
  });
  put(EX.big, 2, arrangement1(new Figure(bounds), 0), nums, 'big-square', {
    ...triMarks(0, 'a1'),
    'mid.0': 'group-1',
  });
  put(EX.rearrange, 3, arrangement2(new Figure(bounds), 0), nums, 'rearrange', {
    ...triMarks(0, 'a2'),
    'sqa.0': 'group-2',
    'sqb.0': 'group-3',
  });
  const both = arrangement2(arrangement1(new Figure(bounds), 0), s + g);
  put(EX.conclude, 4, both, nums, 'conclude', {
    ...triMarks(0, 'a1'),
    ...triMarks(s + g, 'a2'),
    'mid.0': 'group-1',
    [`sqa.${s + g}`]: 'group-2',
    [`sqb.${s + g}`]: 'group-3',
  });
  put(EX.done, 4, both, nums, 'done', {
    ...triMarks(0, 'a1'),
    ...triMarks(s + g, 'a2'),
    'mid.0': 'group-1',
    [`sqa.${s + g}`]: 'group-2',
    [`sqb.${s + g}`]: 'group-3',
  });
}

export const pythagorasDissectionEntry: WalkthroughEntry<In, S> = {
  id: 'pythagoras-dissection',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m1-triangle-geometry'],
  title: m('Định lý Pythagore bằng cắt ghép', 'The Pythagorean theorem by dissection'),
  code: {
    pseudo: [
      'bốn tam giác vuông bằng nhau với cạnh a, b, c',
      'hình vuông cạnh a + b chứa bốn tam giác và một hình vuông nghiêng ở giữa',
      'bốn tam giác xếp thành hai hình chữ nhật, phần trống là hai hình vuông a² và b²',
      'hai cách xếp cạnh nhau, phần trống được tô màu',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
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
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng định lý chỉ đúng với bộ 3-4-5: nó đúng với mọi tam giác vuông.',
        'Thinking the theorem holds only for 3-4-5: it holds for every right triangle.',
      ),
    },
    {
      beat: 'big-square',
      text: m(
        'Nghĩ rằng hình vuông ở giữa có cạnh a hoặc b: cạnh của nó là cạnh huyền c.',
        'Thinking the middle square has side a or b: its side is the hypotenuse c.',
      ),
    },
    {
      beat: 'rearrange',
      text: m(
        'Nghĩ rằng việc xếp lại làm đổi diện tích phần trống: ta chỉ dịch tam giác, nên diện tích không đổi.',
        'Thinking rearranging changes the area of the gap: we only move triangles, so the area is unchanged.',
      ),
    },
    {
      beat: 'conclude',
      text: m(
        'Nghĩ rằng cắt ghép chỉ là minh hoạ chứ không phải chứng minh: đây là một chứng minh, vì phép tính diện tích đúng với mọi a, b.',
        'Thinking a dissection is only an illustration and not a proof: this is a proof, because the area count holds for all a, b.',
      ),
    },
  ],
  maxFrames: 6,
  maxBytes: 200_000,
  run,
};
