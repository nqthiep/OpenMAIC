/**
 * Walkthrough entry: Winning and losing positions in a subtraction game (ADR 0015). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m4-games-invariants`.
 *
 * A pile of n sticks; the players take turns removing 1 to k sticks and whoever takes the last stick wins. The positions are
 * laid out in a table of k + 1 columns, so that the losing positions (the multiples of k + 1) fall in the first column.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState } from '@/lib/subjects/math/figure';

type In = { n: number; k: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { n: { kind: 'int', range: [4, 21] }, k: { kind: 'int', range: [2, 5] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Trò chơi lấy que', 'The stick game'),
    narration: m(
      'Có một đống n que. Hai người lần lượt lấy từ một đến k que, ai lấy que cuối cùng thì thắng. Ta ghi các vị trí, tức số que còn lại, vào một bảng có k cộng một cột.',
      'There is a pile of n sticks. Two players take turns removing from one to k sticks, and whoever takes the last stick wins. We write the positions, the number of sticks left, in a table with k plus one columns.',
    ),
    hints: [
      m('Một vị trí là gì?', 'What is a position?'),
      m('Số que còn lại trong đống.', 'The number of sticks left in the pile.'),
      m('Ván chơi là một đường đi từ n xuống 0.', 'A game is a walk from n down to 0.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng ai lấy nhiều que hơn thì thắng: thắng là lấy que cuối cùng.',
        'Thinking whoever takes more sticks wins: winning means taking the last stick.',
      ),
    ],
  },
  {
    id: 'rule',
    label: m('Các nước đi', 'The moves'),
    narration: m(
      'Từ vị trí n, người đến lượt có thể lấy một, hai, …, đến k que, tức đi tới một trong k vị trí nhỏ hơn. Ta vẽ các nước đi như những mũi tên.',
      'From the position n the player to move can take one, two, up to k sticks, that is move to one of the k smaller positions. We draw the moves as arrows.',
    ),
    hints: [
      m('Từ vị trí n có bao nhiêu nước đi?', 'How many moves are there from the position n?'),
      m('k nước đi nếu còn ít nhất k que.', 'k moves if at least k sticks are left.'),
      m('Nước đi luôn đưa tới một vị trí nhỏ hơn.', 'A move always leads to a smaller position.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng được lấy 0 que: mỗi lượt phải lấy ít nhất một que.',
        'Thinking taking 0 sticks is allowed: each turn takes at least one stick.',
      ),
    ],
  },
  {
    id: 'label',
    label: m('Vị trí thắng và thua', 'Winning and losing positions'),
    narration: m(
      'Ta gán nhãn từng vị trí, từ 0 trở lên. Vị trí 0 là thua cho người đến lượt vì không còn que để lấy. Một vị trí là thắng nếu có nước đi tới một vị trí thua; là thua nếu mọi nước đi đều tới vị trí thắng.',
      'We label each position from 0 up. The position 0 is lost for the player to move since there is no stick to take. A position is winning if some move leads to a losing position; it is losing if every move leads to a winning one.',
    ),
    ask: {
      text: m(
        'Theo em, vị trí 0 (hết que) là thắng hay thua với người đến lượt?',
        'Is the position 0 (no sticks) winning or losing for the player to move?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Thua', 'Losing'), m('Thắng', 'Winning')],
        // the player to move cannot move: the previous player took the last stick
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Ở vị trí 0 người đến lượt đi được không?',
        'At the position 0, can the player to move move?',
      ),
      m('Không: người trước đã lấy que cuối cùng.', 'No: the previous player took the last stick.'),
      m(
        'Vì thế vị trí 0 là vị trí thua; từ đó suy ngược lên các vị trí khác.',
        'So 0 is a losing position; work back up from there.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng vị trí thua là vị trí không có nước đi tốt: thua nghĩa là mọi nước đi đều dẫn tới vị trí thắng của đối phương.',
        'Thinking a losing position is one with no good move: losing means every move leads to a winning position for the opponent.',
      ),
    ],
  },
  {
    id: 'pattern',
    label: m('Quy luật', 'The pattern'),
    narration: m(
      'Các vị trí thua nằm đúng ở cột đầu tiên của bảng: đó là các bội của k cộng một. Các vị trí còn lại đều là vị trí thắng.',
      'The losing positions sit exactly in the first column of the table: they are the multiples of k plus one. All the other positions are winning.',
    ),
    ask: {
      text: m(
        'Theo em, vị trí thua đầu tiên sau 0 là số nào?',
        'Which number do you think is the first losing position after 0?',
      ),
      predict: {
        kind: 'choice',
        options: [m('k', 'k'), m('k + 1', 'k + 1'), m('2k', '2k')],
        // from 1..k one can take everything and win; from k + 1 every move leaves 1..k for the opponent
        answer: () => 1,
      },
    },
    hints: [
      m(
        'Từ các vị trí 1 tới k, người đến lượt làm gì để thắng?',
        'From the positions 1 to k, what does the player to move do to win?',
      ),
      m('Lấy hết que.', 'Take all the sticks.'),
      m(
        'Từ k + 1, mọi nước đi để lại 1 tới k que cho đối phương, nên k + 1 là vị trí thua.',
        'From k + 1, every move leaves 1 to k sticks for the opponent, so k + 1 is losing.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng quy luật chỉ đúng với n nhỏ: bằng quy nạp, bội của k + 1 luôn là vị trí thua.',
        'Thinking the pattern holds only for small n: by induction a multiple of k + 1 is always losing.',
      ),
    ],
  },
  {
    id: 'strategy',
    label: m('Chiến lược đối xứng', 'The mirror strategy'),
    narration: m(
      'Người thắng giữ cho đối phương luôn đứng ở bội của k cộng một: nếu đối phương lấy x que thì mình lấy k cộng một trừ x que. Mỗi vòng hai người lấy tổng cộng k cộng một que.',
      'The winner keeps the opponent always standing on a multiple of k plus one: if the opponent takes x sticks, take k plus one minus x. In each round the two players take k plus one sticks together.',
    ),
    ask: {
      text: m(
        'Theo em, người đi trước có chiến lược thắng khi nào?',
        'When does the first player have a winning strategy?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Khi n chia hết cho k + 1', 'When n is divisible by k + 1'),
          m('Khi n không chia hết cho k + 1', 'When n is not divisible by k + 1'),
          m('Luôn luôn', 'Always'),
        ],
        answer: () => 1,
      },
    },
    hints: [
      m(
        'Người đi trước muốn đưa đống que về vị trí nào?',
        'To which position does the first player want to bring the pile?',
      ),
      m(
        'Về một bội của k + 1: một vị trí thua cho đối phương.',
        'To a multiple of k + 1: a losing position for the opponent.',
      ),
      m(
        'Làm được khi n không phải là bội: lấy n mod (k + 1) que.',
        'Possible when n is not a multiple: take n mod (k + 1) sticks.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng người đi sau không bao giờ thắng: nếu n là bội của k + 1 thì người đi sau thắng.',
        'Thinking the second player never wins: if n is a multiple of k + 1 the second player wins.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Vị trí thua của trò chơi là các bội của k cộng một, và chiến lược thắng là luôn trả về một bội. Cách nghĩ này, chỉ ra một đại lượng giữ nguyên (số que dư khi chia cho k cộng một), dùng được cho nhiều trò chơi khác. Đổi mẫu để thử n và k khác.',
      'The losing positions of the game are the multiples of k plus one, and the winning strategy is to always return to a multiple. This way of thinking, finding a quantity that is kept (the remainder of the sticks modulo k plus one), works for many other games. Change the preset to try other n and k.',
    ),
    hints: [
      m(
        'Đại lượng nào được giữ nguyên qua mỗi vòng?',
        'Which quantity is kept through each round?',
      ),
      m(
        'Số que dư khi chia cho k + 1: mỗi vòng giảm đúng k + 1.',
        'The remainder modulo k + 1: each round lowers the pile by exactly k + 1.',
      ),
      m(
        'Người thắng đưa số dư đó về 0 và giữ nó bằng 0.',
        'The winner brings that remainder to 0 and keeps it at 0.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chiến lược cần tính cả cây trò chơi: một bất biến đơn giản thay cho cả cây.',
        'Thinking the strategy needs the whole game tree: a simple invariant replaces the tree.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Đống n = {n} que; mỗi lượt lấy 1 tới {k} que, ai lấy que cuối cùng thì thắng. Bảng có {w} cột, số ghi là số que còn lại.',
    'A pile of n = {n|stick|sticks}; each turn takes 1 to {k|stick|sticks}, whoever takes the last stick wins. The table has {w|column|columns}, each number is the sticks left.',
  ),
  rule: m(
    'Từ {n} que có thể lấy 1 tới {k} que, đi tới một trong các vị trí {lo}, …, {hi} (các mũi tên).',
    'From {n|stick|sticks} one can take 1 to {k}, moving to one of the positions {lo}, …, {hi} (the arrows).',
  ),
  lab0: m(
    'Vị trí 0: hết que, người đến lượt không đi được nên THUA.',
    'Position 0: no sticks, the player to move cannot move and LOSES.',
  ),
  labWin: m(
    'Vị trí {p}: lấy {j} que tới vị trí thua {tt}, nên {p} là vị trí THẮNG.',
    'Position {p}: taking {j|stick|sticks} reaches the losing position {tt}, so {p} is a WINNING position.',
  ),
  labLose: m(
    'Vị trí {p}: mọi nước đi tới {lo}, …, {hi} đều là vị trí thắng, nên {p} là vị trí THUA.',
    'Position {p}: every move to {lo}, …, {hi} reaches a winning position, so {p} is a LOSING position.',
  ),
  pattern: m(
    'Các vị trí thua là 0, {w}, {w2}, …: đúng các bội của {w}, tức cột đầu tiên của bảng. Mọi vị trí khác là thắng.',
    'The losing positions are 0, {w}, {w2}, …: exactly the multiples of {w}, the first column of the table. Every other position is winning.',
  ),
  stratFirst: m(
    'n = {n} không chia hết cho {w}: người đi trước lấy {r0} que để về {cur}, bội của {w}, rồi giữ tổng mỗi vòng bằng {w}.',
    'n = {n} is not divisible by {w}: the first player takes {r0|stick|sticks} to reach {cur}, a multiple of {w}, then keeps each round at {w} in all.',
  ),
  stratSecond: m(
    'n = {n} chia hết cho {w}: người đi trước đang ở vị trí thua. Đối phương lấy {x} que, người thứ hai lấy {y}: về {cur}, bội của {w}.',
    'n = {n} is divisible by {w}: the first player is on a losing position. The opponent takes {x|stick|sticks}, the second player takes {y}: back to {cur}, a multiple of {w}.',
  ),
  stratStep: m(
    'Sau {mv} nước đi còn {cur} que, vẫn là bội của {w}: mỗi vòng đối phương lấy {x}, người thắng lấy {y}, tổng {w}.',
    'After {mv} moves {cur|stick|sticks} are left, still a multiple of {w}: each round the opponent takes {x}, the winner takes {y}, {w} in all.',
  ),
  stratEnd: m(
    'Còn 0 que sau {mv} nước đi: người thắng lấy que cuối cùng.',
    'No sticks are left after {mv} moves: the winner takes the last stick.',
  ),
  doneFirst: m(
    'n = {n} = {q}·{w} + {r0}: người đi trước thắng bằng cách lấy {r0} que, rồi luôn trả về bội của {w}.',
    'n = {n} = {q}·{w} + {r0}: the first player wins by taking {r0|stick|sticks}, then always returning to a multiple of {w}.',
  ),
  doneSecond: m(
    'n = {n} = {q}·{w}: là bội của {w}, người đi trước ở vị trí thua và người đi sau thắng bằng cách luôn trả về bội của {w}.',
    'n = {n} = {q}·{w}, a multiple of {w}: the first player is on a losing position and the second player wins by always returning to a multiple of {w}.',
  ),
};

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { n, k } = input;
  const w = k + 1;
  const r0 = n % w;
  const rows = Math.floor(n / w) + 1;
  const bounds = { xmin: -0.8, xmax: w - 0.2, ymin: -(rows - 1) - 0.8, ymax: 0.8 };
  const at = (p: number): [number, number] => [p % w, -Math.floor(p / w)];
  /** the table of the positions 0..n; `mark` colours each one */
  const table = (mark: (p: number) => HighlightKind | null) => {
    const fig = new Figure(bounds);
    const marks: Record<string, HighlightKind> = {};
    for (let p = 0; p <= n; p++) {
      fig.point(`q${p}`, at(p), `${p}`, { r: 11 });
      const kind = mark(p);
      if (kind) marks[`q${p}`] = kind;
    }
    return { fig, marks };
  };
  const losing = (p: number): boolean => p % w === 0;
  const put = framePut(emit, ctx.locale);
  const base = { n, k, w };

  put(EX.start, 1, table((p) => (p === n ? 'active' : 'muted')).fig, base, 'start', {
    q0: 'compare',
    [`q${n}`]: 'active',
  });

  // the moves out of n
  {
    const { fig, marks } = table((p) =>
      p === n ? 'active' : p >= n - k && p < n ? 'result' : 'muted',
    );
    const lowest = Math.max(0, n - k);
    for (let t = lowest; t < n; t++) {
      fig.seg(`mv${t}`, `q${n}`, `q${t}`, { arrow: true });
      marks[`mv${t}`] = 'active';
    }
    put(EX.rule, 2, fig, { ...base, lo: n - 1, hi: lowest }, 'rule', marks);
  }

  // the labels, one more position at each frame, as far as two columns' worth of rows
  const last = Math.min(n, 2 * w);
  for (let p = 0; p <= last; p++) {
    const { fig, marks } = table((q) =>
      q === p ? 'active' : q < p ? (losing(q) ? 'compare' : 'result') : 'muted',
    );
    for (let q = 0; q < p; q++) marks[`q${q}`] = losing(q) ? 'compare' : 'result';
    marks[`q${p}`] = 'active';
    const j = p % w;
    put(
      p === 0 ? EX.lab0 : losing(p) ? EX.labLose : EX.labWin,
      3,
      fig,
      { ...base, p, j, tt: p - j, lo: p - 1, hi: p - k },
      p === 0 ? 'label' : undefined,
      marks,
    );
  }

  // the pattern on the whole table
  {
    const { fig, marks } = table((p) => (losing(p) ? 'compare' : 'result'));
    put(EX.pattern, 4, fig, { ...base, w2: 2 * w }, 'pattern', marks);
  }

  // a sample game: the winner (the first player when n is not a multiple of w, the second one otherwise) mirrors
  const path: number[] = [n];
  const mover: ('W' | 'L')[] = [];
  let cur = n;
  if (r0 !== 0) {
    cur -= r0;
    path.push(cur);
    mover.push('W');
  }
  while (cur > 0) {
    cur -= 1; // the opponent takes one stick
    path.push(cur);
    mover.push('L');
    cur -= k; // and the winner takes k
    path.push(cur);
    mover.push('W');
  }
  const total = path.length - 1;
  const firstCut = r0 !== 0 ? 1 : 2;
  const cuts = [
    ...new Set([firstCut, firstCut + 2, firstCut + 4, total].filter((c) => c <= total)),
  ].sort((a, b) => a - b);
  cuts.forEach((c, idx) => {
    const { fig, marks } = table((p) => (losing(p) ? 'compare' : 'muted'));
    for (let i = 0; i < c; i++) {
      fig.seg(`pl${i}`, `q${path[i]}`, `q${path[i + 1]}`, { arrow: true });
      marks[`pl${i}`] = mover[i] === 'W' ? 'result' : 'group-1';
    }
    marks[`q${path[c]}`] = 'active';
    const here = path[c];
    const vars = { ...base, r0, cur: here, mv: c, x: 1, y: k };
    const text =
      idx === 0
        ? r0 !== 0
          ? EX.stratFirst
          : EX.stratSecond
        : here === 0
          ? EX.stratEnd
          : EX.stratStep;
    put(text, 5, fig, vars, idx === 0 ? 'strategy' : undefined, marks);
  });

  const final = table((p) => (losing(p) ? 'compare' : 'result'));
  put(
    r0 !== 0 ? EX.doneFirst : EX.doneSecond,
    5,
    final.fig,
    { ...base, q: Math.floor(n / w), r0 },
    'done',
    final.marks,
  );
}

export const subtractionGameEntry: WalkthroughEntry<In, S> = {
  id: 'subtraction-game',
  entryRev: 2,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m4-games-invariants'],
  title: m(
    'Trò chơi lấy que: vị trí thắng và thua',
    'The stick game: winning and losing positions',
  ),
  code: {
    pseudo: [
      'bảng k + 1 cột các vị trí 0, 1, …, n; đống n que ở vị trí n',
      'các nước đi từ n: lấy 1 tới k que, mỗi nước một mũi tên',
      'gán nhãn từng vị trí từ 0: thua nếu mọi nước đi tới vị trí thắng, thắng nếu có nước tới vị trí thua',
      'các vị trí thua là cột đầu tiên của bảng, tức các bội của k + 1',
      'ván mẫu: người thắng giữ tổng mỗi vòng bằng k + 1, đưa đống que về 0',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    {
      id: 'n10-k3',
      label: m(
        '10 que, lấy 1 tới 3 (đi trước thắng)',
        '10 sticks, take 1 to 3 (first player wins)',
      ),
      input: { n: 10, k: 3 },
    },
    {
      id: 'n12-k3',
      label: m('12 que, lấy 1 tới 3 (đi sau thắng)', '12 sticks, take 1 to 3 (second player wins)'),
      input: { n: 12, k: 3 },
    },
    { id: 'n7-k2', label: m('7 que, lấy 1 tới 2', '7 sticks, take 1 to 2'), input: { n: 7, k: 2 } },
    {
      id: 'n20-k4',
      label: m('20 que, lấy 1 tới 4', '20 sticks, take 1 to 4'),
      input: { n: 20, k: 4 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng ai lấy nhiều que hơn thì thắng: thắng là lấy que cuối cùng.',
        'Thinking whoever takes more sticks wins: winning means taking the last stick.',
      ),
    },
    {
      beat: 'label',
      text: m(
        'Nghĩ rằng vị trí thua là vị trí không có nước đi tốt: thua nghĩa là mọi nước đi đều dẫn tới vị trí thắng của đối phương.',
        'Thinking a losing position is one with no good move: losing means every move leads to a winning position for the opponent.',
      ),
    },
    {
      beat: 'pattern',
      text: m(
        'Nghĩ rằng quy luật chỉ đúng với n nhỏ: bằng quy nạp, bội của k + 1 luôn là vị trí thua.',
        'Thinking the pattern holds only for small n: by induction a multiple of k + 1 is always losing.',
      ),
    },
    {
      beat: 'strategy',
      text: m(
        'Nghĩ rằng người đi sau không bao giờ thắng: nếu n là bội của k + 1 thì người đi sau thắng.',
        'Thinking the second player never wins: if n is a multiple of k + 1 the second player wins.',
      ),
    },
  ],
  maxFrames: 24,
  maxBytes: 260_000,
  run,
};
