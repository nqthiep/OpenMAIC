/**
 * Clip template: lattice paths and Pascal's triangle (card 3D-T2): the number of monotone paths from one corner
 * of an m × n grid to the opposite one is C(m + n, n), found by adding the counts of the cell to the left and the
 * cell below. TypeScript half only (the Manim scene is task 3D-M2). Deterministic and browser-safe (ADR 0006):
 * integers only.
 * Curriculum topic `counting-advanced` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { m: number; n: number };

const inputSpec = {
  kind: 'record',
  fields: { m: { kind: 'int', range: [1, 6] }, n: { kind: 'int', range: [1, 6] } },
} as const;

/** The path counts of every grid point: counts[r][c] = counts[r − 1][c] + counts[r][c − 1], the first row and column all 1. */
export function pathGrid(i: In): number[][] {
  const g: number[][] = [];
  for (let r = 0; r <= i.n; r++) {
    const row: number[] = [];
    for (let c = 0; c <= i.m; c++) row.push(r === 0 || c === 0 ? 1 : g[r - 1][c] + row[c - 1]);
    g.push(row);
  }
  return g;
}

/** C(m + n, n) from the product formula, in integers: after each step the running value is an exact binomial. */
export function binomial(total: number, k: number): number {
  let r = 1;
  for (let j = 1; j <= k; j++) r = (r * (total - k + j)) / j;
  return r;
}

export const latticePathsEntry: ClipEntry<In> = defineClip<In>({
  id: 'lattice-paths',
  curriculumTopics: ['counting-advanced'],
  title: m('Đường đi trên lưới và tam giác Pascal', 'Lattice paths and Pascal’s triangle'),
  inputSpec,
  presets: [
    { id: '2-2', label: m('Lưới 2 × 2', 'A 2 × 2 grid'), input: { m: 2, n: 2 } },
    { id: '3-2', label: m('Lưới 3 × 2', 'A 3 × 2 grid'), input: { m: 3, n: 2 } },
    { id: '1-6', label: m('Lưới 1 × 6 (hẹp)', 'A 1 × 6 grid (narrow)'), input: { m: 1, n: 6 } },
    { id: '4-4', label: m('Lưới 4 × 4', 'A 4 × 4 grid'), input: { m: 4, n: 4 } },
  ],
  chapters: [
    {
      id: 'grid',
      startSec: 0,
      endSec: 9,
      label: m('Lưới', 'The grid'),
      before: m(
        'Ta có một lưới m nhân n ô. Ta đi từ góc dưới trái tới góc trên phải, mỗi bước chỉ sang phải hoặc đi lên.',
        'We have a grid of m by n cells. We walk from the bottom-left corner to the top-right one, each step only right or up.',
      ),
      after: m(
        'Câu hỏi là có bao nhiêu đường đi như vậy.',
        'The question is how many such paths there are.',
      ),
    },
    {
      id: 'paths',
      startSec: 9,
      endSec: 21,
      label: m('Vài đường đi', 'A few paths'),
      before: m(
        'Ta vẽ vài đường đi khác nhau. Mỗi đường là một dãy các bước sang phải và đi lên.',
        'We draw a few different paths. Each is a sequence of steps to the right and steps up.',
      ),
      after: m(
        'Mọi đường đi đều có cùng số bước phải và cùng số bước lên, chỉ khác thứ tự.',
        'Every path has the same number of right steps and the same number of up steps, only in a different order.',
      ),
      ask: m(
        'Một đường đi gồm mấy bước sang phải và mấy bước đi lên?',
        'How many steps right and how many steps up does a path have?',
      ),
    },
    {
      id: 'pascal',
      startSec: 21,
      endSec: 35,
      label: m('Đếm bằng cộng', 'Counting by adding'),
      before: m(
        'Ta ghi vào mỗi điểm số đường đi từ góc xuất phát tới đó. Một điểm chỉ đến được từ điểm bên trái hoặc điểm bên dưới.',
        'At each point we write the number of paths from the start to it. A point can only be reached from the point to its left or the point below.',
      ),
      after: m(
        'Vậy số ở mỗi điểm là tổng hai số kề nó, đúng như tam giác Pascal.',
        'So the number at each point is the sum of its two neighbours, just like Pascal’s triangle.',
      ),
      caption: m('= trái + dưới', '= left + below'),
      ask: m(
        'Số ở ô này bằng tổng của những ô nào?',
        'Which cells do the number in this cell add up from?',
      ),
    },
    {
      id: 'binomial',
      startSec: 35,
      endSec: 46,
      label: m('Công thức tổ hợp', 'The binomial formula'),
      before: m(
        'Một đường đi là một cách chọn n bước đi lên trong tổng m cộng n bước.',
        'A path is a way of choosing which n of the m plus n steps go up.',
      ),
      after: m(
        'Số cách chọn đó là tổ hợp chập n của m cộng n, và nó trùng với số ở góc đối diện.',
        'The number of ways to choose is m plus n choose n, and it matches the number in the opposite corner.',
      ),
      caption: m('C(m+n, n)', 'C(m+n, n)'),
    },
  ],
  invariants: (i) => {
    const g = pathGrid(i);
    // the corner count by addition equals the binomial coefficient, and the grid is symmetric in m and n
    return g[i.n][i.m] === binomial(i.m + i.n, i.n) && g[i.n][i.m] === binomial(i.m + i.n, i.m);
  },
  sheet: {
    chapters: [
      {
        id: 'grid',
        shows: m(
          'lưới m × n với điểm xuất phát và điểm đích ở hai góc đối',
          'an m × n grid with the start and the finish at opposite corners',
        ),
        formulas: ['\\(m \\times n\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng số đường đi bằng m·n: đó là số ô, không phải số đường đi.',
            'Thinking the number of paths is m·n: that is the number of cells, not of paths.',
          ),
        ],
        hints: hints(
          'Mỗi bước được phép đi theo những hướng nào?',
          'Chỉ sang phải hoặc đi lên, không đi lùi.',
          'Nên mọi đường đi có đúng m bước phải và n bước lên.',
          'Which directions is each step allowed to take?',
          'Only right or up, never backwards.',
          'So every path has exactly m steps right and n steps up.',
        ),
      },
      {
        id: 'paths',
        shows: m(
          'vài đường đi tô màu khác nhau từ góc xuất phát tới góc đích',
          'a few paths in different colours from the start to the finish',
        ),
        formulas: ['\\(m + n\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng các đường đi có độ dài khác nhau: mọi đường đi đều có m + n bước.',
            'Thinking the paths have different lengths: every path has m + n steps.',
          ),
        ],
        hints: hints(
          'Một đường đi có tất cả bao nhiêu bước?',
          'm + n bước, vì m bước phải và n bước lên.',
          'Hai đường khác nhau ở chỗ các bước lên đứng ở vị trí nào trong dãy.',
          'How many steps does a path have in all?',
          'm + n steps, since m go right and n go up.',
          'Two paths differ in which positions of the sequence the up steps take.',
        ),
      },
      {
        id: 'pascal',
        shows: m(
          'số ở mỗi điểm lưới, mỗi số là tổng của số bên trái và số bên dưới',
          'the number at each grid point, each the sum of the number on its left and the one below',
        ),
        formulas: ['\\(N(r, c) = N(r - 1, c) + N(r, c - 1)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng số ở một điểm là tích của hai số kề: nó là tổng, vì đường đi đến từ hai hướng rời nhau.',
            'Thinking the number at a point is the product of its neighbours: it is the sum, since paths arrive from two disjoint directions.',
          ),
        ],
        hints: hints(
          'Từ điểm nào có thể bước tới điểm này?',
          'Từ điểm bên trái (bước phải) hoặc điểm bên dưới (bước lên).',
          'Hai nhóm đường này không trùng nhau, nên số đường là tổng hai số.',
          'From which points can we step to this point?',
          'From the point on its left (a right step) or the point below (an up step).',
          'The two groups of paths do not overlap, so the count is the sum of the two numbers.',
        ),
      },
      {
        id: 'binomial',
        shows: m(
          'số ở góc đích và công thức tổ hợp cạnh đó',
          'the number at the finish corner with the binomial formula beside it',
        ),
        formulas: ['\\(\\binom{m + n}{n}\\)', '\\(\\binom{m + n}{n} = \\binom{m + n}{m}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng chọn m bước phải và chọn n bước lên cho hai kết quả khác nhau: hai cách chọn cho cùng một số.',
            'Thinking choosing the m right steps and choosing the n up steps give different results: both give the same number.',
          ),
        ],
        hints: hints(
          'Một đường đi hoàn toàn được xác định bởi điều gì?',
          'Bởi vị trí của n bước lên trong m + n bước.',
          'Số cách chọn n vị trí trong m + n vị trí là C(m + n, n).',
          'What determines a path completely?',
          'The positions of the n up steps among the m + n steps.',
          'The number of ways to choose n positions out of m + n is C(m + n, n).',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the number of paths. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { count: pathGrid(i)[i.n][i.m] };
}

const latticePaths: ClipModule<In> = { entry: latticePathsEntry, expectedDisplay };
export default latticePaths;
