/**
 * Clip template: inclusion–exclusion for three sets (card 3D-T3): |A ∪ B ∪ C| = |A| + |B| + |C| − |A ∩ B| −
 * |A ∩ C| − |B ∩ C| + |A ∩ B ∩ C|. The input lists the seven regions of the Venn diagram as "only in" counts, in
 * the order A, B, C, AB, AC, BC, ABC. TypeScript half only (the Manim scene is task 3D-M3). Deterministic and
 * browser-safe (ADR 0006): integers only.
 * Curriculum topic `counting-advanced` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { r: number[] };

const inputSpec = {
  kind: 'record',
  fields: { r: { kind: 'int-array', len: [7, 7], range: [0, 9] } },
} as const;

/** The region counts by name. */
function regions(r: readonly number[]) {
  const [a, b, c, ab, ac, bc, abc] = r;
  return { a, b, c, ab, ac, bc, abc };
}

/** |A|, |B|, |C| and the intersections, built from the "only in" regions. */
export function setSizes(r: readonly number[]) {
  const x = regions(r);
  return {
    A: x.a + x.ab + x.ac + x.abc,
    B: x.b + x.ab + x.bc + x.abc,
    C: x.c + x.ac + x.bc + x.abc,
    AB: x.ab + x.abc,
    AC: x.ac + x.abc,
    BC: x.bc + x.abc,
    ABC: x.abc,
  };
}

/** The union by the inclusion–exclusion formula. */
export function unionByFormula(r: readonly number[]): number {
  const s = setSizes(r);
  return s.A + s.B + s.C - s.AB - s.AC - s.BC + s.ABC;
}

export const inclusionExclusionEntry: ClipEntry<In> = defineClip<In>({
  id: 'inclusion-exclusion',
  curriculumTopics: ['m3-counting-advanced'],
  title: m('Bao hàm – loại trừ cho ba tập', 'Inclusion–exclusion for three sets'),
  inputSpec,
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
  chapters: [
    {
      id: 'venn',
      startSec: 0,
      endSec: 9,
      label: m('Sơ đồ Venn', 'The Venn diagram'),
      before: m(
        'Ta vẽ ba vòng tròn chồng lên nhau, tạo ra bảy miền. Mỗi miền ghi số phần tử chỉ thuộc đúng những tập đó.',
        'We draw three overlapping circles, making seven regions. Each region shows how many elements belong to exactly those sets.',
      ),
      after: m(
        'Ta muốn đếm số phần tử nằm trong ít nhất một tập.',
        'We want to count the elements that lie in at least one set.',
      ),
    },
    {
      id: 'add',
      startSec: 9,
      endSec: 20,
      label: m('Cộng ba tập', 'Adding the three sets'),
      before: m(
        'Cách đơn giản nhất là cộng số phần tử của A, B và C lại với nhau.',
        'The simplest way is to add the sizes of A, B and C.',
      ),
      after: m(
        'Cách này đếm trùng: phần tử thuộc nhiều tập bị đếm nhiều lần.',
        'This over-counts: an element in several sets is counted several times.',
      ),
      caption: m('|A| + |B| + |C|', '|A| + |B| + |C|'),
      ask: m(
        'Phần giao của hai tập được đếm mấy lần khi cộng ba tập?',
        'How many times is the overlap of two sets counted when we add the three sets?',
      ),
    },
    {
      id: 'subtract',
      startSec: 20,
      endSec: 33,
      label: m('Trừ các giao đôi', 'Subtracting the pairwise overlaps'),
      before: m(
        'Ta trừ đi số phần tử của ba phần giao của từng cặp tập.',
        'We subtract the sizes of the three pairwise overlaps.',
      ),
      after: m(
        'Các miền của hai tập giờ được đếm đúng một lần, nhưng miền giữa thì đã bị trừ quá tay.',
        'The regions of two sets are now counted exactly once, but the middle region has been taken away too often.',
      ),
      caption: m('− |A∩B| − |A∩C| − |B∩C|', '− |A∩B| − |A∩C| − |B∩C|'),
      ask: m(
        'Miền giữa bây giờ được đếm mấy lần?',
        'How many times is the middle region counted now?',
      ),
    },
    {
      id: 'add-back',
      startSec: 33,
      endSec: 45,
      label: m('Cộng lại miền giữa', 'Adding the middle back'),
      before: m(
        'Miền giữa được đếm ba lần rồi bị trừ ba lần, tức là đang bằng không. Ta cộng nó lại một lần.',
        'The middle region was counted three times and subtracted three times, so it now counts zero. We add it back once.',
      ),
      after: m(
        'Bây giờ mọi miền đều được đếm đúng một lần.',
        'Now every region is counted exactly once.',
      ),
      caption: m('+ |A∩B∩C|', '+ |A∩B∩C|'),
    },
  ],
  invariants: (i) => {
    const total = i.r.reduce((s, v) => s + v, 0);
    const s = setSizes(i.r);
    // the formula equals the sum of the seven regions, and every intersection really is a sum of regions
    return (
      unionByFormula(i.r) === total &&
      s.AB + s.A + s.B - s.A - s.B === s.AB &&
      s.A >= s.AB &&
      s.AB >= s.ABC
    );
  },
  sheet: {
    chapters: [
      {
        id: 'venn',
        shows: m(
          'ba vòng tròn A, B, C với số phần tử ghi trong bảy miền',
          'three circles A, B, C with a count written in each of the seven regions',
        ),
        formulas: ['\\(|A \\cup B \\cup C|\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng số ghi trong một miền là kích thước cả tập: nó chỉ đếm các phần tử thuộc đúng miền đó.',
            'Thinking the number in a region is the size of the whole set: it counts only the elements in exactly that region.',
          ),
        ],
        hints: hints(
          'Có bao nhiêu miền trong sơ đồ ba tập?',
          'Bảy miền, không kể phần ngoài tất cả các tập.',
          'Kích thước của tập A là tổng của bốn miền nằm trong vòng A.',
          'How many regions does a three-set diagram have?',
          'Seven, not counting the part outside all the sets.',
          'The size of set A is the sum of the four regions inside circle A.',
        ),
      },
      {
        id: 'add',
        shows: m(
          'ba vòng tròn được tô sáng, các miền chồng nhau có màu đậm hơn',
          'the three circles filled in, the overlapping regions darker',
        ),
        formulas: ['\\(|A| + |B| + |C|\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng tổng |A| + |B| + |C| đã là kích thước hợp: nó đếm trùng các phần giao.',
            'Thinking |A| + |B| + |C| is already the size of the union: it counts the overlaps more than once.',
          ),
        ],
        hints: hints(
          'Phần tử nằm trong cả A và B được đếm mấy lần?',
          'Hai lần: một lần trong |A| và một lần trong |B|.',
          'Phần tử nằm trong cả ba tập được đếm ba lần.',
          'How many times is an element of both A and B counted?',
          'Twice: once in |A| and once in |B|.',
          'An element in all three sets is counted three times.',
        ),
      },
      {
        id: 'subtract',
        shows: m(
          'ba phần giao đôi bị gạch đi, miền giữa trở nên trống',
          'the three pairwise overlaps crossed out, the middle region left empty',
        ),
        formulas: ['\\(|A| + |B| + |C| - |A \\cap B| - |A \\cap C| - |B \\cap C|\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng chỉ cần trừ các giao đôi là xong: miền giữa bị trừ ba lần nên mất hẳn và phải cộng lại.',
            'Thinking subtracting the pairwise overlaps is enough: the middle is taken away three times and vanishes, so it must be added back.',
          ),
        ],
        hints: hints(
          'Miền giữa nằm trong bao nhiêu phần giao đôi?',
          'Cả ba: A∩B, A∩C và B∩C.',
          'Nó được cộng 3 lần rồi trừ 3 lần, nên còn 0 lần.',
          'In how many pairwise overlaps does the middle region lie?',
          'All three: A∩B, A∩C and B∩C.',
          'It was added 3 times and subtracted 3 times, so it counts 0 times.',
        ),
      },
      {
        id: 'add-back',
        shows: m(
          'miền giữa được tô sáng trở lại với dấu cộng',
          'the middle region lit up again with a plus sign',
        ),
        formulas: [
          '\\(|A \\cup B \\cup C| = |A| + |B| + |C| - |A \\cap B| - |A \\cap C| - |B \\cap C| + |A \\cap B \\cap C|\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng công thức luôn có đúng hai dấu trừ liên tiếp rồi dừng: với ba tập dấu cuối cùng là cộng.',
            'Thinking the formula stops after the minus signs: with three sets the last sign is a plus.',
          ),
        ],
        hints: hints(
          'Sau khi cộng lại miền giữa, nó được đếm mấy lần?',
          'Đúng một lần: 3 − 3 + 1 = 1.',
          'Mọi miền khác cũng đã được đếm một lần, nên tổng là kích thước hợp.',
          'After adding the middle back, how many times is it counted?',
          'Exactly once: 3 − 3 + 1 = 1.',
          'Every other region is also counted once, so the total is the size of the union.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the size of the union and of the three sets. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  const s = setSizes(i.r);
  return { union: unionByFormula(i.r), A: s.A, B: s.B, C: s.C };
}

const inclusionExclusion: ClipModule<In> = { entry: inclusionExclusionEntry, expectedDisplay };
export default inclusionExclusion;
