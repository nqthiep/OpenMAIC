/**
 * Walkthrough entry: Inclusion–exclusion for three sets (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m3-counting-advanced`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState, type Pt } from '@/lib/subjects/math/figure';

type In = { r: number[] };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { r: { kind: 'int-array', len: [7, 7], range: [0, 9] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Sơ đồ Venn', 'The Venn diagram'),
    narration: m(
      'Ta vẽ ba vòng tròn chồng lên nhau, tạo ra bảy miền. Mỗi miền ghi số phần tử chỉ thuộc đúng những tập đó. Ta muốn đếm số phần tử nằm trong ít nhất một tập.',
      'We draw three overlapping circles, making seven regions. Each region shows how many elements belong to exactly those sets. We want to count the elements that lie in at least one set.',
    ),
    hints: [
      m('Có bao nhiêu miền trong sơ đồ ba tập?', 'How many regions does a three-set diagram have?'),
      m(
        'Bảy miền, không kể phần ngoài tất cả các tập.',
        'Seven, not counting the part outside all the sets.',
      ),
      m(
        'Kích thước của tập A là tổng của bốn miền nằm trong vòng A.',
        'The size of set A is the sum of the four regions inside circle A.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng số ghi trong một miền là kích thước cả tập: nó chỉ đếm các phần tử thuộc đúng miền đó.',
        'Thinking the number in a region is the size of the whole set: it counts only the elements in exactly that region.',
      ),
    ],
  },
  {
    id: 'add',
    label: m('Cộng ba tập', 'Adding the three sets'),
    narration: m(
      'Cách đơn giản nhất là cộng số phần tử của A, B và C lại với nhau. Cách này đếm trùng: phần tử thuộc nhiều tập bị đếm nhiều lần.',
      'The simplest way is to add the sizes of A, B and C. This over-counts: an element in several sets is counted several times.',
    ),
    ask: {
      text: m(
        'Theo em, một miền chỉ thuộc đúng hai tập được đếm mấy lần khi cộng kích thước ba tập?',
        'How many times is a region that belongs to exactly two sets counted when we add the sizes of the three sets?',
      ),
      predict: {
        kind: 'choice',
        options: [m('1 lần', 'Once'), m('2 lần', 'Twice'), m('3 lần', 'Three times')],
        answer: () => 1,
      },
    },
    hints: [
      m(
        'Phần tử nằm trong cả A và B được đếm mấy lần?',
        'How many times is an element of both A and B counted?',
      ),
      m('Hai lần: một lần trong |A| và một lần trong |B|.', 'Twice: once in |A| and once in |B|.'),
      m(
        'Phần tử nằm trong cả ba tập được đếm ba lần.',
        'An element in all three sets is counted three times.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tổng |A| + |B| + |C| đã là kích thước hợp: nó đếm trùng các phần giao.',
        'Thinking |A| + |B| + |C| is already the size of the union: it counts the overlaps more than once.',
      ),
    ],
  },
  {
    id: 'subtract',
    label: m('Trừ các giao đôi', 'Subtracting the pairwise overlaps'),
    narration: m(
      'Ta trừ đi số phần tử của ba phần giao của từng cặp tập. Các miền của hai tập giờ được đếm đúng một lần, nhưng miền giữa thì đã bị trừ quá tay.',
      'We subtract the sizes of the three pairwise overlaps. The regions of two sets are now counted exactly once, but the middle region has been taken away too often.',
    ),
    ask: {
      text: m(
        'Sau khi trừ cả ba phần giao đôi, miền giữa (thuộc cả ba tập) được đếm mấy lần?',
        'After subtracting all three pairwise overlaps, how many times is the middle region (in all three sets) counted?',
      ),
      predict: {
        kind: 'choice',
        options: [m('0 lần', 'Zero times'), m('1 lần', 'Once'), m('2 lần', 'Twice')],
        // counted 3 times when adding, then taken away once in each of the 3 overlaps
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Miền giữa nằm trong bao nhiêu phần giao đôi?',
        'In how many pairwise overlaps does the middle region lie?',
      ),
      m('Cả ba: A∩B, A∩C và B∩C.', 'All three: A∩B, A∩C and B∩C.'),
      m(
        'Nó được cộng 3 lần rồi trừ 3 lần, nên còn 0 lần.',
        'It was added 3 times and subtracted 3 times, so it counts 0 times.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ cần trừ các giao đôi là xong: miền giữa bị trừ ba lần nên mất hẳn và phải cộng lại.',
        'Thinking subtracting the pairwise overlaps is enough: the middle is taken away three times and vanishes, so it must be added back.',
      ),
    ],
  },
  {
    id: 'add-back',
    label: m('Cộng lại miền giữa', 'Adding the middle back'),
    narration: m(
      'Miền giữa được đếm ba lần rồi bị trừ ba lần, tức là đang bằng không. Ta cộng nó lại một lần. Bây giờ mọi miền đều được đếm đúng một lần.',
      'The middle region was counted three times and subtracted three times, so it now counts zero. We add it back once. Now every region is counted exactly once.',
    ),
    hints: [
      m(
        'Sau khi cộng lại miền giữa, nó được đếm mấy lần?',
        'After adding the middle back, how many times is it counted?',
      ),
      m('Đúng một lần: 3 − 3 + 1 = 1.', 'Exactly once: 3 − 3 + 1 = 1.'),
      m(
        'Mọi miền khác cũng đã được đếm một lần, nên tổng là kích thước hợp.',
        'Every other region is also counted once, so the total is the size of the union.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng công thức luôn có đúng hai dấu trừ liên tiếp rồi dừng: với ba tập dấu cuối cùng là cộng.',
        'Thinking the formula stops after the minus signs: with three sets the last sign is a plus.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Bao hàm – loại trừ: cộng các tập, trừ các giao đôi, cộng lại giao ba thì mỗi miền được đếm đúng một lần. Kết quả bằng tổng bảy miền. Đổi mẫu để thử miền giữa rỗng hay các tập rời nhau.',
      'Inclusion–exclusion: add the sets, subtract the pairwise overlaps, add back the triple overlap, and every region is counted exactly once. The result equals the sum of the seven regions. Change the preset to try an empty middle or disjoint sets.',
    ),
    hints: [
      m(
        'Mỗi miền được đếm mấy lần sau ba bước?',
        'How many times is each region counted after the three steps?',
      ),
      m(
        'Đúng một lần: 1, 2 − 1 và 3 − 3 + 1 đều bằng 1.',
        'Exactly once: 1, 2 − 1 and 3 − 3 + 1 all equal 1.',
      ),
      m(
        'Công thức: |A ∪ B ∪ C| = |A| + |B| + |C| − |A ∩ B| − |A ∩ C| − |B ∩ C| + |A ∩ B ∩ C|.',
        'The formula: |A ∪ B ∪ C| = |A| + |B| + |C| − |A ∩ B| − |A ∩ C| − |B ∩ C| + |A ∩ B ∩ C|.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng với ba tập chỉ cần trừ giao đôi: phải cộng lại giao ba, nếu không miền giữa bị đếm 0 lần.',
        'Thinking subtracting the pairwise overlaps is enough for three sets: the triple overlap must be added back, otherwise the middle is counted zero times.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Ba tập A, B, C chia mặt phẳng thành bảy miền; mỗi số là số phần tử thuộc đúng miền đó. Ta cần đếm các phần tử thuộc ít nhất một tập.',
    'Three sets A, B, C make seven regions; each number counts the elements of exactly that region. We count the elements in at least one set.',
  ),
  addA: m(
    'Cộng |A| = {s}, tức bốn miền của vòng A. Tổng đang là {sum}. Dấu × cho biết mỗi miền đã được đếm mấy lần.',
    'Add |A| = {s}, the four regions of the circle A. The sum is {sum}. The × shows how many times each region has been counted.',
  ),
  addB: m(
    'Cộng |B| = {s}. Tổng đang là {sum}. Miền chung của A và B đã bị đếm 2 lần.',
    'Add |B| = {s}. The sum is {sum}. The region common to A and B has been counted 2 times.',
  ),
  addC: m(
    'Cộng |C| = {s}. Tổng đang là {sum}: miền thuộc hai tập bị đếm 2 lần, miền giữa bị đếm 3 lần.',
    'Add |C| = {s}. The sum is {sum}: a region in two sets is counted 2 times, the middle 3 times.',
  ),
  subAB: m(
    'Trừ |A ∩ B| = {s}. Tổng đang là {sum}: miền chỉ thuộc A và B giờ được đếm 1 lần.',
    'Subtract |A ∩ B| = {s}. The sum is {sum}: the region only in A and B is now counted once.',
  ),
  subAC: m(
    'Trừ |A ∩ C| = {s}. Tổng đang là {sum}: miền chỉ thuộc A và C giờ được đếm 1 lần.',
    'Subtract |A ∩ C| = {s}. The sum is {sum}: the region only in A and C is now counted once.',
  ),
  subBC: m(
    'Trừ |B ∩ C| = {s}. Tổng đang là {sum}: các miền hai tập đều đếm 1 lần, nhưng miền giữa bị trừ ba lần nên về 0.',
    'Subtract |B ∩ C| = {s}. The sum is {sum}: the two-set regions are counted once, but the middle was taken away three times and is down to 0.',
  ),
  addBack: m(
    'Cộng lại |A ∩ B ∩ C| = {s}. Tổng bằng {sum}: mọi miền đều được đếm đúng 1 lần.',
    'Add back |A ∩ B ∩ C| = {s}. The sum is {sum}: every region is counted exactly once.',
  ),
  done: m(
    '|A ∪ B ∪ C| = {sa} + {sb} + {sc} − {sab} − {sac} − {sbc} + {sabc} = {u}, đúng bằng tổng bảy miền.',
    '|A ∪ B ∪ C| = {sa} + {sb} + {sc} − {sab} − {sac} − {sbc} + {sabc} = {u}, exactly the sum of the seven regions.',
  ),
};

/** the seven regions: a mask of the sets (A = 1, B = 2, C = 4) and where the number is written */
const REGIONS: readonly { id: string; mask: number; at: Pt }[] = [
  { id: 'a', mask: 1, at: [-2, -0.4] },
  { id: 'b', mask: 2, at: [2, -0.4] },
  { id: 'c', mask: 4, at: [0, 2.8] },
  { id: 'ab', mask: 3, at: [0, -1] },
  { id: 'ac', mask: 5, at: [-1.1, 1.2] },
  { id: 'bc', mask: 6, at: [1.1, 1.2] },
  { id: 'abc', mask: 7, at: [0, 0.55] },
];
const bits = (x: number): number => (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1);

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const [a, b, c, ab, ac, bc, abc] = input.r;
  /** |A|, |B|, |C|, the pairwise overlaps and the triple overlap, from the regions that are "only in" */
  const sa = a + ab + ac + abc;
  const sb = b + ab + bc + abc;
  const sc = c + ac + bc + abc;
  const sab = ab + abc;
  const sac = ac + abc;
  const sbc = bc + abc;
  const sabc = abc;
  const u = sa + sb + sc - sab - sac - sbc + sabc;
  const count: Record<string, number> = { a, b, c, ab, ac, bc, abc };
  const bounds = { xmin: -3.6, xmax: 3.6, ymin: -2.6, ymax: 4.6 };
  /**
   * The diagram with each region labelled `count×times`: `added` is the mask of the sets whose size was added, `pairs` the
   * masks of the overlaps subtracted, `triple` whether the triple overlap was added back. `times === undefined` writes the bare counts.
   */
  const venn = (state?: {
    added: number;
    pairs: readonly number[];
    triple: boolean;
  }): { fig: Figure; times: Record<string, number> } => {
    const fig = new Figure(bounds)
      .anchor('pa', [-1, 0])
      .anchor('pb', [1, 0])
      .anchor('pc', [0, 1.7])
      .circle('cA', 'pa', 2)
      .circle('cB', 'pb', 2)
      .circle('cC', 'pc', 2)
      .anchor('tA', [-2.7, -1.5], 'A', true)
      .anchor('tB', [2.7, -1.5], 'B', true)
      .anchor('tC', [0, 4.1], 'C', true);
    const times: Record<string, number> = {};
    for (const r of REGIONS) {
      let t = 0;
      if (state) {
        t = bits(r.mask & state.added) - state.pairs.filter((p) => (r.mask & p) === p).length;
        if (state.triple && r.mask === 7) t += 1;
      }
      times[r.id] = t;
      fig.anchor(`r${r.id}`, r.at, state ? `${count[r.id]}×${t}` : `${count[r.id]}`, true);
    }
    return { fig, times };
  };
  const put = framePut(emit, ctx.locale);
  const at = (
    text: Messages,
    codeLine: number,
    pic: { fig: Figure; times: Record<string, number> },
    vars: Record<string, number>,
    beat: string | undefined,
    marks: Record<string, HighlightKind>,
  ): void => {
    // the regions counted once are the result; counted more than once are the problem; not at all, muted
    const regionMarks: Record<string, HighlightKind> = {};
    for (const r of REGIONS) {
      const t = pic.times[r.id];
      regionMarks[`r${r.id}`] = t === 1 ? 'result' : t === 0 ? 'muted' : 'compare';
    }
    put(text, codeLine, pic.fig, vars, beat, { ...regionMarks, ...marks });
  };

  put(EX.start, 1, venn().fig, { a, b, c, ab, ac, bc, abc }, 'start', {});
  const sizes = [sa, sb, sc];
  const circle = ['cA', 'cB', 'cC'];
  let running = 0;
  [1, 3, 7].forEach((added, i) => {
    running += sizes[i];
    at(
      [EX.addA, EX.addB, EX.addC][i],
      2,
      venn({ added, pairs: [], triple: false }),
      { s: sizes[i], sum: running },
      i === 0 ? 'add' : undefined,
      { [circle[i]]: 'active' },
    );
  });
  const pairSizes = [sab, sac, sbc];
  const pairMask = [3, 5, 6];
  const subtracted: number[] = [];
  [EX.subAB, EX.subAC, EX.subBC].forEach((text, i) => {
    subtracted.push(pairMask[i]);
    running -= pairSizes[i];
    at(
      text,
      3,
      venn({ added: 7, pairs: subtracted, triple: false }),
      { s: pairSizes[i], sum: running },
      i === 0 ? 'subtract' : undefined,
      {},
    );
  });
  at(
    EX.addBack,
    4,
    venn({ added: 7, pairs: pairMask, triple: true }),
    { s: sabc, sum: u },
    'add-back',
    {
      rabc: 'active',
    },
  );
  at(
    EX.done,
    4,
    venn({ added: 7, pairs: pairMask, triple: true }),
    { sa, sb, sc, sab, sac, sbc, sabc, u },
    'done',
    {},
  );
}

export const inclusionExclusionEntry: WalkthroughEntry<In, S> = {
  id: 'inclusion-exclusion',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m3-counting-advanced'],
  title: m('Bao hàm – loại trừ cho ba tập', 'Inclusion–exclusion for three sets'),
  code: {
    pseudo: [
      'ba vòng tròn A, B, C với số phần tử ghi trong bảy miền',
      'cộng lần lượt |A|, |B|, |C|: mỗi miền ghi số lần đã được đếm (dấu ×)',
      'trừ lần lượt ba giao đôi: miền giữa về 0 lần',
      'cộng lại giao ba: mọi miền đều 1 lần',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    { id: 'generic', label: m('Tổng quát', 'Generic'), input: { r: [3, 2, 4, 1, 2, 1, 1] } },
    {
      id: 'empty-center',
      label: m('Miền giữa rỗng', 'Empty centre'),
      input: { r: [3, 2, 4, 1, 2, 1, 0] },
    },
    {
      id: 'disjoint',
      label: m('Ba tập rời nhau', 'Three disjoint sets'),
      input: { r: [3, 2, 4, 0, 0, 0, 0] },
    },
    {
      id: 'nested',
      label: m('C nằm trong A ∩ B', 'C inside A ∩ B'),
      input: { r: [2, 3, 0, 1, 0, 0, 4] },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng số ghi trong một miền là kích thước cả tập: nó chỉ đếm các phần tử thuộc đúng miền đó.',
        'Thinking the number in a region is the size of the whole set: it counts only the elements in exactly that region.',
      ),
    },
    {
      beat: 'add',
      text: m(
        'Nghĩ rằng tổng |A| + |B| + |C| đã là kích thước hợp: nó đếm trùng các phần giao.',
        'Thinking |A| + |B| + |C| is already the size of the union: it counts the overlaps more than once.',
      ),
    },
    {
      beat: 'subtract',
      text: m(
        'Nghĩ rằng chỉ cần trừ các giao đôi là xong: miền giữa bị trừ ba lần nên mất hẳn và phải cộng lại.',
        'Thinking subtracting the pairwise overlaps is enough: the middle is taken away three times and vanishes, so it must be added back.',
      ),
    },
    {
      beat: 'add-back',
      text: m(
        'Nghĩ rằng công thức luôn có đúng hai dấu trừ liên tiếp rồi dừng: với ba tập dấu cuối cùng là cộng.',
        'Thinking the formula stops after the minus signs: with three sets the last sign is a plus.',
      ),
    },
  ],
  maxFrames: 10,
  maxBytes: 200_000,
  run,
};
