/**
 * Walkthrough entry: Sprague–Grundy for a subtraction game (take 1–3 from one pile; a player who
 * cannot move loses) on at most three piles of size 0–7 (SCHEMA §5, card 2E-04).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { piles: number[] };
type S = {
  rows: number;
  cols: number;
  cells: (number | string)[][];
  rowLabels: string[];
  colLabels: string[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
/** The mex question frames for these two sizes (their values 3 and 0 are the instructive ones). */
const ASK_AT = [3, 4];

const EX = {
  start: m(
    'Trò chơi: {k} đống, mỗi lượt lấy 1, 2 hoặc 3 viên từ MỘT đống; ai không đi được thì thua. Ta tính g(x) cho x = 0..7 rồi ghép các đống bằng xor.',
    'The game: {k} piles, each turn takes 1, 2 or 3 stones from ONE pile; a player who cannot move loses. We compute g(x) for x = 0..7 then combine piles with xor.',
  ),
  askMex: m(
    'g({x}): từ {x} viên đi được tới các đống {opts}, có g là {set}. g({x}) = mex của tập này bằng bao nhiêu?',
    'g({x}): from {x} stones one can reach the sizes {opts}, with g values {set}. What is g({x}), the mex of this set?',
  ),
  mex: m(
    'g({x}) = mex{set} = {g}: số tự nhiên nhỏ nhất KHÔNG có trong tập.',
    'g({x}) = mex{set} = {g}: the smallest natural number NOT in the set.',
  ),
  xor: m(
    'Giá trị g của các đống: {gs}. Tổng nim = xor của chúng = {xor}.',
    'The g values of the piles: {gs}. The nim-sum = their xor = {xor}.',
  ),
  verdict: m(
    'Tổng nim = {xor}: người đi trước {res}.',
    'The nim-sum is {xor}: the first player {res}.',
  ),
  move: m(
    'Nước thắng: lấy {t} viên từ đống {p} (còn {np}): g đổi từ {gp} thành {gn} nên xor về 0. Đối thủ rơi vào thế thua.',
    'The winning move: take {t} stones from pile {p} (leaving {np}): g changes from {gp} to {gn} so the xor becomes 0. The opponent is in a losing position.',
  ),
  done: m(
    'Kết luận: người đi trước {res}. Mọi trò chơi công bằng theo lượt đều quy về một đống nim qua g.',
    'Conclusion: the first player {res}. Every impartial game reduces to a nim pile through g.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Mỗi đống là một trò chơi nhỏ; định lý Sprague–Grundy gán cho nó một số g, và tổng nhiều đống thắng hay thua do xor các g quyết định. Ở đây có {k} đống.',
      'Each pile is a small game; the Sprague–Grundy theorem gives it a number g, and whether a sum of piles is won or lost is decided by the xor of the g values. Here there are {k} piles.',
    ),
    hints: [
      m(
        'Có thể xét thắng thua từng đống riêng rồi ghép lại không?',
        'Can we judge each pile separately and combine?',
      ),
      m(
        'Không đủ bằng thắng/thua đơn thuần; cần một con số cho mỗi đống.',
        'Win/lose alone is not enough; each pile needs a number.',
      ),
      m(
        'Số đó là g (Grundy); các đống ghép lại bằng xor.',
        'That number is g (Grundy); piles combine with xor.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cộng các g là đủ: phải xor, không cộng.',
        'Thinking adding the g values suffices: it must be xor, not addition.',
      ),
    ],
  },
  {
    id: 'mex',
    label: m('Tính g bằng mex', 'Computing g by mex'),
    narration: m(
      'g(x) là mex của các g(x − t) với t = 1..3: số tự nhiên nhỏ nhất không xuất hiện. g(0) = 0 vì không còn nước đi.',
      'g(x) is the mex of the values g(x − t) for t = 1..3: the smallest natural number that does not appear. g(0) = 0 because no move is left.',
    ),
    ask: {
      text: m('Theo em, g(x) bằng bao nhiêu?', 'What is g(x)?'),
      predict: {
        kind: 'choice',
        options: [m('0', '0'), m('1', '1'), m('2', '2'), m('3', '3')],
        answer: (_frame, next) => {
          const g = next?.meta.vars?.g;
          return typeof g === 'number' ? g : -1;
        },
      },
    },
    hints: [
      m(
        'Liệt kê g của các đống đi tới được từ x.',
        'List the g values of the sizes reachable from x.',
      ),
      m(
        'mex là số tự nhiên nhỏ nhất KHÔNG có trong tập, bắt đầu thử từ 0.',
        'The mex is the smallest natural number NOT in the set, trying from 0.',
      ),
      m(
        'Ví dụ mex{0, 1, 2} = 3 và mex{1, 2, 3} = 0 (vì 0 vắng).',
        'For example mex{0, 1, 2} = 3 and mex{1, 2, 3} = 0 (since 0 is missing).',
      ),
    ],
    misconceptions: [
      m(
        'Lấy mex là số lớn nhất trong tập cộng 1: sai khi tập thiếu một số nhỏ hơn.',
        'Taking the mex as the largest in the set plus 1: wrong when a smaller number is missing.',
      ),
    ],
  },
  {
    id: 'xor',
    label: m('Tổng nim', 'The nim-sum'),
    narration: m(
      'Mỗi đống có g riêng: {gs}. Tổng của các trò chơi độc lập có g bằng xor các g: tổng nim = {xor}.',
      'Each pile has its own g: {gs}. A sum of independent games has g equal to the xor of the g values: the nim-sum = {xor}.',
    ),
    hints: [
      m(
        'Hai đống có g bằng nhau thì xor của chúng là gì?',
        'If two piles have equal g, what is their xor?',
      ),
      m('0: chúng triệt tiêu nhau.', '0: they cancel out.'),
      m('Tổng nim = g1 xor g2 xor g3.', 'The nim-sum = g1 xor g2 xor g3.'),
    ],
    misconceptions: [
      m(
        'Cộng các g thay vì xor: [1, 2, 3] có tổng 6 nhưng xor bằng 0 (thế thua).',
        'Adding the g values instead of xor: [1, 2, 3] sums to 6 but the xor is 0 (a losing position).',
      ),
    ],
  },
  {
    id: 'verdict',
    label: m('Thắng hay thua', 'Win or lose'),
    narration: m(
      'Tổng nim khác 0 thì người đi trước có nước đưa nó về 0 nên thắng; bằng 0 thì mọi nước đi đều làm nó khác 0 nên người đi trước thua.',
      'A nonzero nim-sum lets the first player move it to 0 and win; a zero nim-sum means every move makes it nonzero, so the first player loses.',
    ),
    ask: {
      text: m('Theo em, người đi trước thắng hay thua?', 'Does the first player win or lose?'),
      predict: {
        kind: 'choice',
        options: [m('Thắng', 'Wins'), m('Thua', 'Loses')],
        answer: (frame) => (frame.meta.vars?.xor === 0 ? 1 : 0),
      },
    },
    hints: [
      m('Nhìn tổng nim: khác 0 hay bằng 0?', 'Look at the nim-sum: nonzero or zero?'),
      m('Khác 0: có nước về 0; bằng 0: không có.', 'Nonzero: a move to 0 exists; zero: none does.'),
      m(
        'Người đi trước thắng khi và chỉ khi tổng nim khác 0.',
        'The first player wins if and only if the nim-sum is nonzero.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng thắng khi tổng nim bằng 0: ngược lại, 0 là thế thua cho người sắp đi.',
        'Thinking the first player wins at nim-sum 0: it is the other way round, 0 is lost for the player to move.',
      ),
    ],
  },
  {
    id: 'winning-move',
    label: m('Nước thắng', 'The winning move'),
    narration: m(
      'Để đưa tổng nim về 0, chọn một đống mà g xor tổng nim nhỏ hơn g của nó, rồi lấy 1 đến 3 viên sao cho g mới đúng bằng số đó. Luôn làm được vì mex mọi giá trị nhỏ hơn đều đạt tới được.',
      'To bring the nim-sum to 0 pick a pile whose g xor the nim-sum is smaller than its g, then take 1 to 3 stones so the new g is exactly that value. It always works because every smaller value is reachable by the mex.',
    ),
    hints: [
      m(
        'Muốn xor mới bằng 0, g của đống bị đổi phải thành bao nhiêu?',
        'For the new xor to be 0, what must the g of the changed pile become?',
      ),
      m(
        'g xor tổng nim; và phải nhỏ hơn g cũ để đạt tới được.',
        'g xor the nim-sum; and it must be below the old g to be reachable.',
      ),
      m(
        'Thử lấy 1, 2, 3 viên cho tới khi g của đống mới khớp.',
        'Try taking 1, 2, 3 stones until the g of the new size matches.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng luôn lấy từ đống lớn nhất: đống cần đổi là đống có g xor tổng nim nhỏ hơn g.',
        'Thinking one always takes from the largest pile: the pile to change is one whose g xor the nim-sum is smaller than g.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Người đi trước {res}. Cách làm áp dụng cho mọi trò chơi công bằng hữu hạn: tính g bằng mex rồi xor, không cần xét cây trò chơi.',
      'The first player {res}. The method works for every finite impartial game: compute g by mex then xor, with no need to search the game tree.',
    ),
    hints: [
      m('Vì sao nhanh hơn thử mọi nước đi?', 'Why is it faster than trying every move?'),
      m(
        'Số trạng thái của tổng các đống là tích, còn g chỉ tính trên từng đống.',
        'The number of states of the sum is a product, whereas g is computed per pile.',
      ),
      m(
        'Chi phí tuyến tính theo kích thước đống thay vì tích số trạng thái.',
        'The cost is linear in the pile sizes instead of the product of states.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng g chỉ dùng cho trò Nim: nó dùng cho mọi trò chơi công bằng.',
        'Thinking g is only for Nim: it applies to every impartial game.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const piles = input.piles;
  const k = piles.length;
  const g: (number | undefined)[] = Array(8).fill(undefined);
  const key = (r: number, c: number): string => `${r},${c}`;
  const pilesRow = (): (number | string)[] =>
    Array.from({ length: 8 }, (_, c) => (c < k ? piles[c] : ''));

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    emit(
      {
        rows: 2,
        cols: 8,
        cells: [g.map((x) => (x === undefined ? '' : x)), pilesRow()],
        rowLabels: ['g', msg(m('đống', 'piles'), ctx.locale)],
        colLabels: Array.from({ length: 8 }, (_, c) => String(c)),
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: marks,
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };
  const win = msg(m('thắng', 'wins'), ctx.locale);
  const lose = msg(m('thua', 'loses'), ctx.locale);

  put(EX.start, 1, { k }, {}, 'start');
  for (let x = 0; x < 8; x++) {
    tick();
    const reach = [1, 2, 3].filter((t) => t <= x).map((t) => x - t);
    const set = `{${[...new Set(reach.map((y) => g[y] as number))].sort((a, b) => a - b).join(', ')}}`;
    let v = 0;
    while (reach.some((y) => g[y] === v)) v++;
    if (ASK_AT.includes(x)) {
      put(EX.askMex, 2, { x, opts: reach.join(', '), set }, { [key(0, x)]: 'active' }, 'mex');
    }
    g[x] = v;
    put(EX.mex, 2, { x, set, g: v }, { [key(0, x)]: 'result' });
  }
  const gs = piles.map((p) => g[p] as number);
  const xor = gs.reduce((a, b) => a ^ b, 0);
  put(
    EX.xor,
    3,
    { gs: gs.join(', '), xor },
    Object.fromEntries(piles.map((p, c) => [key(1, c), 'active' as HighlightKind])),
    'xor',
  );
  put(EX.verdict, 4, { xor, res: xor !== 0 ? win : lose }, {}, 'verdict');
  if (xor !== 0) {
    const p = piles.findIndex((_, i) => (gs[i] ^ xor) < gs[i]);
    const target = gs[p] ^ xor;
    const t = [1, 2, 3].find((tt) => tt <= piles[p] && g[piles[p] - tt] === target) as number;
    put(
      EX.move,
      4,
      { t, p, np: piles[p] - t, gp: gs[p], gn: target },
      { [key(1, p)]: 'result', [key(0, piles[p] - t)]: 'compare' },
      'winning-move',
    );
  }
  put(EX.done, 5, { res: xor !== 0 ? win : lose }, {}, 'done');
}

export const nimGrundyEntry: WalkthroughEntry<In, S> = {
  id: 'nim-grundy',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'grid',
  curriculumTopics: ['t4-game-theory'],
  title: m('Sprague–Grundy: trò chơi lấy 1–3 viên', 'Sprague–Grundy: a take-1-to-3 game'),
  code: {
    pseudo: [
      'for x ← 0 .. 7: g[x] ← mex{ g[x − t] : t ∈ 1..3, t ≤ x }',
      '   (mex = số tự nhiên nhỏ nhất không có trong tập)',
      'total ← 0; for mỗi đống p: total ← total xor g[p]',
      'total ≠ 0: người đi trước thắng (đi sao cho total về 0); total = 0: thua',
      'return total',
    ],
    impl: {
      cpp: [
        'int grundy_xor(const std::vector<int>& piles) {',
        '    int g[8];',
        '    for (int x = 0; x < 8; x++) {',
        '        bool seen[4] = {false, false, false, false};',
        '        for (int t = 1; t <= 3 && t <= x; t++) seen[g[x - t]] = true;',
        '        int v = 0;',
        '        while (seen[v]) v++;',
        '        g[x] = v;',
        '    }',
        '    int total = 0;',
        '    for (int p : piles) total ^= g[p];',
        '    return total;',
        '}',
      ],
      py: [
        'def grundy_xor(piles):',
        '    g = [0] * 8',
        '    for x in range(8):',
        '        seen = {g[x - t] for t in range(1, 4) if t <= x}',
        '        v = 0',
        '        while v in seen:',
        '            v += 1',
        '        g[x] = v',
        '    total = 0',
        '    for p in piles:',
        '        total ^= g[p]',
        '    return total',
      ],
    },
    map: {
      cpp: { 1: [2, 3, 4, 5, 8], 2: [6, 7], 3: [10, 11], 4: [12], 5: [12] },
      py: { 1: [2, 3, 4, 8], 2: [5, 6, 7], 3: [9, 10, 11], 4: [12], 5: [12] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { piles: { kind: 'int-array', len: [1, 3], range: [0, 7] } },
  },
  customInput: false,
  presets: [
    {
      id: 'win',
      label: m('Người đi trước thắng', 'The first player wins'),
      input: { piles: [3, 4, 5] },
    },
    {
      id: 'lose',
      label: m('Người đi trước thua', 'The first player loses'),
      input: { piles: [1, 2, 3] },
    },
    { id: 'single', label: m('Một đống', 'A single pile'), input: { piles: [6] } },
    {
      id: 'empty',
      label: m('Biên: hai đống rỗng', 'Edge: two empty piles'),
      input: { piles: [0, 0] },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'mex',
      text: m(
        'mex là số tự nhiên nhỏ nhất KHÔNG có trong tập (không phải số lớn nhất cộng 1); và các đống ghép bằng xor, không cộng.',
        'The mex is the smallest natural number NOT in the set (not the largest plus 1); and piles combine with xor, not addition.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'mex',
      text: m(
        'Mảng seen cần kích thước đủ lớn cho giá trị mex (ở đây tối đa 3 nên seen[4]); khởi tạo bằng false.',
        'The array seen must be large enough for the mex value (at most 3 here, so seen[4]); initialise it to false.',
      ),
    },
    {
      lang: 'py',
      beat: 'mex',
      text: m(
        'g[x - t] với t ≤ x tránh chỉ số âm (Python sẽ lấy từ cuối list thay vì báo lỗi).',
        'g[x - t] with t ≤ x avoids a negative index (Python would read from the end of the list instead of failing).',
      ),
    },
  ],
  maxFrames: 40,
  maxBytes: 200_000,
  run,
};
