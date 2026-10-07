/**
 * Clip template: a chessboard with two cells removed, and domino tilings (card 3B-T5): colour the board, count
 * black and white cells, and conclude. TypeScript half only (the Manim scene is task 3B-M5). Deterministic and
 * browser-safe (ADR 0006).
 * Curriculum topic `pigeonhole-invariants` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { n: 4 | 6 | 8; removed: 'opposite-corners' | 'adjacent' };
type Cell = [number, number];
type Domino = [Cell, Cell];

const inputSpec = {
  kind: 'record',
  fields: {
    n: { kind: 'enum', values: [4, 6, 8] },
    removed: { kind: 'enum', values: ['opposite-corners', 'adjacent'] },
  },
} as const;

/** the two removed cells */
export function removedCells(i: In): [Cell, Cell] {
  return i.removed === 'opposite-corners'
    ? [
        [0, 0],
        [i.n - 1, i.n - 1],
      ]
    : [
        [0, 0],
        [0, 1],
      ];
}

/** a cell is black when row + column is even */
const isBlack = (c: Cell): boolean => (c[0] + c[1]) % 2 === 0;

/** Black and white cells left after removing the two cells. */
export function colourCounts(i: In): { black: number; white: number } {
  let black = 0;
  let white = 0;
  const [r1, r2] = removedCells(i);
  for (let r = 0; r < i.n; r++) {
    for (let c = 0; c < i.n; c++) {
      if ((r === r1[0] && c === r1[1]) || (r === r2[0] && c === r2[1])) continue;
      if (isBlack([r, c])) black++;
      else white++;
    }
  }
  return { black, white };
}

/**
 * A domino tiling of the board without the two removed cells, or null when the colours say there is none.
 * For `adjacent` (cells (0,0) and (0,1) removed) every row is cut into horizontal dominoes; the first row starts
 * at column 2. The board side is even, so each row has an even number of cells left.
 */
export function tilingFor(i: In): Domino[] | null {
  const { black, white } = colourCounts(i);
  if (black !== white || i.removed !== 'adjacent') return null;
  const dominoes: Domino[] = [];
  for (let r = 0; r < i.n; r++) {
    for (let c = r === 0 ? 2 : 0; c < i.n; c += 2)
      dominoes.push([
        [r, c],
        [r, c + 1],
      ]);
  }
  return dominoes;
}

/** True when `tiling` covers every cell except the two removed ones exactly once with adjacent cells. */
export function isValidTiling(i: In, tiling: readonly Domino[]): boolean {
  const seen = new Set<string>();
  const [r1, r2] = removedCells(i);
  seen.add(`${r1[0]},${r1[1]}`);
  seen.add(`${r2[0]},${r2[1]}`);
  for (const [a, b] of tiling) {
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return false;
    for (const [r, c] of [a, b]) {
      if (r < 0 || c < 0 || r >= i.n || c >= i.n) return false;
      const key = `${r},${c}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return seen.size === i.n * i.n;
}

export const tilingColoringEntry: ClipEntry<In> = defineClip<In>({
  id: 'tiling-coloring',
  curriculumTopics: ['pigeonhole-invariants'],
  title: m('Bàn cờ bỏ hai ô và lát domino', 'A chessboard with two cells removed, and dominoes'),
  inputSpec,
  presets: [
    {
      id: 'n8-opposite',
      label: m('Bàn 8 × 8, bỏ hai góc đối', '8 × 8, opposite corners removed'),
      input: { n: 8, removed: 'opposite-corners' },
    },
    {
      id: 'n4-opposite',
      label: m('Bàn 4 × 4, bỏ hai góc đối', '4 × 4, opposite corners removed'),
      input: { n: 4, removed: 'opposite-corners' },
    },
    {
      id: 'n6-adjacent',
      label: m('Bàn 6 × 6, bỏ hai ô kề', '6 × 6, two adjacent cells removed'),
      input: { n: 6, removed: 'adjacent' },
    },
    {
      id: 'n8-adjacent',
      label: m('Bàn 8 × 8, bỏ hai ô kề', '8 × 8, two adjacent cells removed'),
      input: { n: 8, removed: 'adjacent' },
    },
  ],
  chapters: [
    {
      id: 'board',
      startSec: 0,
      endSec: 9,
      label: m('Bàn cờ', 'The board'),
      before: m(
        'Ta có một bàn cờ vuông và bỏ đi hai ô. Câu hỏi là có lát kín phần còn lại bằng các domino hai ô không.',
        'We have a square board with two cells removed. The question is whether dominoes of two cells can cover the rest exactly.',
      ),
      after: m(
        'Mỗi domino phủ đúng hai ô kề nhau.',
        'Each domino covers exactly two cells that touch.',
      ),
    },
    {
      id: 'color',
      startSec: 9,
      endSec: 20,
      label: m('Tô màu', 'Colouring'),
      before: m(
        'Ta tô các ô đen trắng xen kẽ như bàn cờ vua.',
        'We colour the cells black and white in turns, like a chess board.',
      ),
      after: m(
        'Bây giờ mỗi ô có một màu, và hai ô kề nhau luôn khác màu.',
        'Now every cell has a colour, and two touching cells always have different colours.',
      ),
      ask: m(
        'Theo em, hai ô kề nhau có cùng màu hay khác màu?',
        'Do two touching cells have the same colour or different ones?',
      ),
    },
    {
      id: 'count',
      startSec: 20,
      endSec: 34,
      label: m('Đếm màu', 'Counting colours'),
      before: m(
        'Ta đếm số ô đen và số ô trắng còn lại trên bàn sau khi bỏ hai ô.',
        'We count the black and the white cells left on the board after the two removals.',
      ),
      after: m(
        'Hai số này cho ta một điều kiện cần để lát được.',
        'The two numbers give a necessary condition for a tiling.',
      ),
      caption: m('đen so với trắng', 'black vs white'),
      ask: m('Một domino luôn phủ mấy ô đen?', 'How many black cells does a domino always cover?'),
    },
    {
      id: 'conclude',
      startSec: 34,
      endSec: 46,
      label: m('Kết luận', 'The conclusion'),
      before: m(
        'Mỗi domino phủ một ô đen và một ô trắng. Nếu lát được thì hai số đếm phải bằng nhau.',
        'Each domino covers one black and one white cell. If a tiling exists the two counts must be equal.',
      ),
      after: m(
        'Nếu hai số khác nhau thì không thể lát được; nếu bằng nhau, ta tìm được một cách lát cụ thể.',
        'If the two counts differ no tiling is possible; if they match, we can show an explicit tiling.',
      ),
    },
  ],
  invariants: (i) => {
    const { black, white } = colourCounts(i);
    const tiling = tilingFor(i);
    const [r1, r2] = removedCells(i);
    // the removed cells decide: same colour leaves unequal counts and no tiling, different colours leave equal counts and a tiling
    const sameColour = isBlack(r1) === isBlack(r2);
    if ((black === white) === sameColour) return false;
    if (tiling === null) return black !== white || i.removed !== 'adjacent';
    return black === white && isValidTiling(i, tiling);
  },
  sheet: {
    chapters: [
      {
        id: 'board',
        shows: m(
          'bàn cờ n × n với hai ô bị bỏ và một domino',
          'an n × n board with two cells removed and a domino',
        ),
        formulas: ['\\(n \\times n\\)', '\\(n^2 - 2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng thử vài cách không được nghĩa là không thể: cần một lý lẽ cho mọi cách.',
            'Thinking that a few failed attempts mean it is impossible: an argument for every attempt is needed.',
          ),
        ],
        hints: hints(
          'Bàn còn lại bao nhiêu ô?',
          'n² − 2 ô, và mỗi domino phủ 2 ô.',
          'Số ô phải chẵn thì mới có thể lát, và ở đây nó chẵn, nên ta cần một điều kiện khác.',
          'How many cells are left?',
          'n² − 2 cells, and each domino covers 2.',
          'The count must be even for a tiling to be possible, and it is, so another condition is needed.',
        ),
      },
      {
        id: 'color',
        shows: m(
          'các ô tô đen trắng xen kẽ, hai ô bị bỏ được đánh dấu',
          'cells coloured black and white in turns, the two removed cells marked',
        ),
        formulas: ['\\((r + c) \\bmod 2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng việc tô màu chỉ để cho đẹp: nó tạo ra một bất biến dùng được trong chứng minh.',
            'Thinking the colouring is only decoration: it creates an invariant that can be used in a proof.',
          ),
        ],
        hints: hints(
          'Hai ô kề nhau có màu thế nào?',
          'Khác màu, vì cộng hàng và cột lệch nhau 1.',
          'Nên mỗi domino phủ đúng một ô đen và một ô trắng.',
          'What colours do two touching cells have?',
          'Different, because row plus column differs by 1.',
          'So each domino covers exactly one black and one white cell.',
        ),
      },
      {
        id: 'count',
        shows: m(
          'số ô đen và ô trắng còn lại ghi bên cạnh bàn cờ',
          'the numbers of black and white cells left, written beside the board',
        ),
        formulas: ['\\(\\text{đen} = \\text{trắng}\\)', '\\(\\frac{n^2}{2} - 2\\)'],
        misconceptions: [
          m(
            'Quên rằng hai góc đối cùng màu: bỏ chúng làm mất hai ô cùng màu, nên hai số đếm lệch nhau.',
            'Forgetting that opposite corners have the same colour: removing them takes away two cells of one colour, so the counts differ.',
          ),
        ],
        hints: hints(
          'Hai góc đối có cùng màu hay khác màu?',
          'Cùng màu, vì (0 + 0) và (n − 1 + n − 1) cùng tính chẵn lẻ.',
          'Bỏ hai ô cùng màu thì số đen và trắng lệch nhau 2.',
          'Do opposite corners have the same colour or different ones?',
          'The same, since 0 + 0 and (n − 1) + (n − 1) have the same parity.',
          'Removing two cells of one colour makes the black and white counts differ by 2.',
        ),
      },
      {
        id: 'conclude',
        shows: m(
          'hai số đếm khác nhau và dấu gạch, hoặc một cách lát hoàn chỉnh',
          'two unequal counts with a cross, or a complete tiling',
        ),
        formulas: ['\\(\\text{đen} \\ne \\text{trắng} \\Rightarrow \\text{không lát được}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng hai số đếm bằng nhau thì chắc chắn lát được: đó mới là điều kiện cần, ta phải chỉ ra một cách lát.',
            'Thinking equal counts guarantee a tiling: that is only a necessary condition, an explicit tiling must be shown.',
          ),
        ],
        hints: hints(
          'Nếu lát được thì hai số đếm thế nào?',
          'Bằng nhau, vì mỗi domino phủ một ô mỗi màu.',
          'Hai số khác nhau thì không lát được; bằng nhau thì phải chỉ ra một cách lát.',
          'If a tiling exists, how do the two counts compare?',
          'Equal, because each domino covers one cell of each colour.',
          'Different counts mean no tiling; equal counts mean an explicit tiling must be shown.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the black and white cells left. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return colourCounts(i);
}

const tilingColoring: ClipModule<In> = { entry: tilingColoringEntry, expectedDisplay };
export default tilingColoring;
