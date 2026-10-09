/**
 * Walkthrough entry: N queens by backtracking, first solution (SCHEMA §5, card 2A-08, README D18).
 * n = 6 needs about 380 frames (171 cell checks), over the card's limit of 120, so it is left out
 * of the input range (the card says to drop it and tell the leader). Deterministic and
 * browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { n: 1 | 3 | 4 | 5 };
type S = {
  rows: number;
  cols: number;
  /** 'Q' for a queen, '' for an empty cell (shorter than null in every frame) */
  cells: string[][];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Đặt {n} quân hậu lên bàn {n} × {n} sao cho không hai hậu nào tấn công nhau (cùng hàng, cột hoặc đường chéo).',
    'Place {n|queen|queens} on an {n} × {n} board so that no two attack each other (same row, column or diagonal).',
  ),
  row: m(
    'Sang hàng {r}: mỗi hàng đặt đúng một hậu, nên thử lần lượt từng cột, bắt đầu từ cột 0.',
    'On to row {r}: each row holds exactly one queen, so try the columns one by one, starting at column 0.',
  ),
  check: m(
    'Hàng {r}: thử đặt hậu ở cột {c}. Ô ({r}, {c}) có bị hậu nào đã đặt tấn công không?',
    'Row {r}: try a queen at column {c}. Is the cell ({r}, {c}) attacked by a queen already placed?',
  ),
  sameCol: m(
    'Ô ({r}, {c}) bị tấn công: hậu ở hàng {rr} cùng cột {c}. Các ô bị tấn công ở hàng {r} được tô mờ; thử cột kế tiếp.',
    'Cell ({r}, {c}) is attacked: the queen in row {rr} shares column {c}. Attacked cells of row {r} are dimmed; try the next column.',
  ),
  sameDiag: m(
    'Ô ({r}, {c}) bị tấn công: hậu ở hàng {rr}, cột {qc} cùng đường chéo. Các ô bị tấn công ở hàng {r} được tô mờ; thử cột kế tiếp.',
    'Cell ({r}, {c}) is attacked: the queen at row {rr}, column {qc} is on the same diagonal. Attacked cells of row {r} are dimmed; try the next column.',
  ),
  place: m(
    'Ô ({r}, {c}) an toàn: đặt hậu ở đây rồi sang hàng kế tiếp.',
    'Cell ({r}, {c}) is safe: place a queen here and move on to the next row.',
  ),
  back: m(
    'Hàng {r} hết cột an toàn. Quay lui: nhấc hậu ở hàng {pr}, cột {pc} lên và thử cột kế tiếp của hàng {pr}.',
    'Row {r} has no safe column. Backtrack: lift the queen at row {pr}, column {pc} and try the next column of row {pr}.',
  ),
  solution: m(
    'Đã đặt đủ {n} hậu, không hậu nào tấn công nhau: đây là nghiệm đầu tiên, các hậu ở cột {cols}.',
    'All {n|queen|queens} are placed and none attack each other: this is the first solution, queens in columns {cols}.',
  ),
  doneYes: m(
    'Dừng ở nghiệm đầu tiên sau {attempts} lần thử ô.',
    'Stop at the first solution after {attempts} cell checks.',
  ),
  doneNo: m(
    'Hàng 0 đã hết cột: không có cách đặt {n} hậu. Đã thử mọi khả năng sau {attempts} lần thử ô.',
    'Row 0 ran out of columns: {n|queen|queens} cannot be placed. Every possibility was tried in {attempts} cell checks.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Bài {n} hậu: đặt {n} quân hậu lên bàn {n} × {n} không tấn công nhau. Ta dùng quay lui: đặt từng hàng, gặp ngõ cụt thì lùi lại.',
      'The {n}-queens task: place {n|queen|queens} on an {n} × {n} board with no attacks. We use backtracking: fill row by row and step back at a dead end.',
    ),
    hints: [
      m(
        'Hai hậu cùng hàng thì sao? Vậy mỗi hàng có tối đa mấy hậu?',
        'What if two queens share a row? So how many queens can a row hold?',
      ),
      m(
        'Mỗi hàng đúng một hậu, nên chỉ cần chọn cột cho từng hàng.',
        'Exactly one queen per row, so we only choose a column for each row.',
      ),
      m(
        'Đặt hàng 0, rồi hàng 1, …; nếu một hàng không còn cột an toàn thì quay lui sửa hàng trước đó.',
        'Fill row 0, then row 1, …; if a row has no safe column, backtrack and change the previous row.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hậu chỉ tấn công theo hàng và cột: nó còn đi theo cả hai đường chéo.',
        'Thinking a queen attacks only along rows and columns: it also moves along both diagonals.',
      ),
    ],
  },
  {
    id: 'try',
    label: m('Sang hàng mới', 'A new row'),
    narration: m(
      'Hàng {r} chưa có hậu. Vì mỗi hàng cần đúng một hậu, ta thử các cột 0, 1, 2, … lần lượt cho tới khi gặp ô an toàn.',
      'Row {r} has no queen yet. Since each row needs exactly one queen, we try columns 0, 1, 2, … in turn until a safe cell turns up.',
    ),
    hints: [
      m('Mỗi hàng cần bao nhiêu hậu?', 'How many queens does each row need?'),
      m(
        'Đúng một. Vậy ta chỉ cần quyết định cột cho hàng này.',
        'Exactly one. So we only decide the column for this row.',
      ),
      m(
        'Thử cột 0, 1, 2, … theo thứ tự; cột đầu tiên an toàn thì đặt hậu và sang hàng sau.',
        'Try columns 0, 1, 2, … in order; at the first safe column, place the queen and go to the next row.',
      ),
    ],
    misconceptions: [
      m(
        'Thử đặt cả hai hậu vào cùng một hàng cho nhanh: hai hậu cùng hàng đã tấn công nhau.',
        'Putting two queens in one row to save time: two queens in a row already attack each other.',
      ),
    ],
  },
  {
    id: 'conflict-check',
    label: m('Kiểm tra ô', 'Check the cell'),
    narration: m(
      'Ô ({r}, {c}) bị tấn công nếu một hậu đã đặt ở trên cùng cột c = {c}, hoặc cùng đường chéo: hiệu hàng bằng hiệu cột.',
      'The cell ({r}, {c}) is attacked if a queen above shares the column c = {c}, or a diagonal: the row gap equals the column gap.',
    ),
    ask: {
      text: m(
        'Theo em, ô này có bị hậu nào đã đặt tấn công không?',
        'Is this cell attacked by any queen already placed?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Có, bị tấn công', 'Yes, attacked'), m('Không, an toàn', 'No, safe')],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:place') ? 1 : 0),
      },
    },
    hints: [
      m(
        'Nhìn các hậu đã đặt ở những hàng phía trên: có hậu nào cùng cột với ô này không?',
        'Look at the queens in the rows above: does any share this cell’s column?',
      ),
      m(
        'Kiểm đường chéo: hai ô (r, c) và (r2, c2) cùng đường chéo khi |r − r2| = |c − c2|.',
        'Check diagonals: cells (r, c) and (r2, c2) share one when |r − r2| = |c − c2|.',
      ),
      m(
        'Bị tấn công nếu cùng cột hoặc |r − r2| = |c − c2| với một hậu đã đặt; ngược lại an toàn.',
        'Attacked if it shares the column or |r − r2| = |c − c2| with a placed queen; otherwise safe.',
      ),
    ],
    misconceptions: [
      m(
        'Chỉ kiểm cột mà quên đường chéo: hai hậu trên đường chéo vẫn tấn công nhau.',
        'Checking only columns and forgetting diagonals: two queens on a diagonal still attack each other.',
      ),
      m(
        'Kiểm cả các hàng phía dưới: các hàng chưa đặt chưa có hậu nên không cần xét.',
        'Checking the rows below too: rows not filled yet have no queens, so they need no check.',
      ),
    ],
  },
  {
    id: 'place',
    label: m('Đặt hậu', 'Place a queen'),
    narration: m(
      'Ô ({r}, {c}) không bị hậu nào tấn công, nên ta đặt hậu ở đây và đi tiếp xuống hàng sau.',
      'The cell ({r}, {c}) is attacked by no queen, so we place a queen here and move down to the next row.',
    ),
    hints: [
      m('Ô này có an toàn không?', 'Is this cell safe?'),
      m(
        'Có: không cùng cột, không cùng đường chéo với hậu nào ở trên.',
        'Yes: no shared column or diagonal with any queen above.',
      ),
      m(
        'Ghi cols[r] = c rồi gọi đệ quy cho hàng r + 1.',
        'Record cols[r] = c and recurse on row r + 1.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đã đặt là cố định mãi: nếu các hàng sau bế tắc, ta vẫn phải nhấc hậu này lên.',
        'Thinking a placed queen stays forever: if later rows get stuck, this queen must be lifted again.',
      ),
    ],
  },
  {
    id: 'backtrack',
    label: m('Quay lui', 'Backtrack'),
    narration: m(
      'Hàng {r} không còn cột nào an toàn. Việc đặt các hàng trên đã sai: ta nhấc hậu ở hàng {pr}, cột {pc} lên và thử cột khác.',
      'Row {r} has no safe column left. The placement above was a mistake: we lift the queen at row {pr}, column {pc} and try another column.',
    ),
    hints: [
      m(
        'Nếu một hàng không có cột an toàn, lỗi nằm ở hàng đó hay hàng trước?',
        'If a row has no safe column, is the fault in that row or an earlier one?',
      ),
      m(
        'Ở các hậu đã đặt trước: chúng chặn mọi cột của hàng này.',
        'In the queens placed earlier: they block every column of this row.',
      ),
      m(
        'Nhấc hậu ở hàng ngay trên và thử cột kế tiếp của hàng đó; hết cột thì lùi tiếp.',
        'Lift the queen of the row just above and try the next column there; if none is left, step back further.',
      ),
    ],
    misconceptions: [
      m(
        'Bắt đầu lại từ hàng 0: chỉ cần lùi một hàng, các hàng phía trên vẫn còn đúng.',
        'Restarting from row 0: stepping back one row is enough, the rows above are still fine.',
      ),
    ],
  },
  {
    id: 'solution',
    label: m('Tìm được nghiệm', 'A solution'),
    narration: m(
      'Cả {n} hàng đều có hậu và không hậu nào tấn công nhau: các hậu ở cột {cols} (theo thứ tự hàng). Ta dừng ở nghiệm đầu tiên.',
      'All {n|row|rows} hold a queen and none attack each other: the queens are in columns {cols} (in row order). We stop at the first solution.',
    ),
    hints: [
      m('Khi nào ta biết đã xong?', 'When do we know we are done?'),
      m(
        'Khi đã đặt xong hàng cuối cùng, tức r = n.',
        'When the last row is filled, that is r = n.',
      ),
      m(
        'r = n ⇒ trả về true; mọi lời gọi đệ quy bên trên cũng trả về true và dừng.',
        'r = n ⇒ return true; every recursive call above returns true as well and stops.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ có một cách đặt: thường có nhiều nghiệm (4 hậu có 2), ta chỉ dừng ở nghiệm đầu tiên.',
        'Thinking there is only one placement: there are usually several (4 queens have 2); we stop at the first.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Xong sau {attempts} lần thử ô. Quay lui không thử hết {n}^{n} cách đặt mà bỏ cả nhánh ngay khi một hậu bị chặn: đó là sức mạnh của việc cắt tỉa.',
      'Done after {attempts} cell checks. Backtracking does not try all {n}^{n|placement|placements}; it drops a whole branch as soon as a queen is blocked: that is the power of pruning.',
    ),
    hints: [
      m(
        'Số cách đặt mỗi hàng một hậu tuỳ ý là bao nhiêu?',
        'How many ways are there to put one queen per row, unrestricted?',
      ),
      m('n^n cách, rất lớn. Ta có thử hết không?', 'n^n ways, a huge number. Do we try them all?'),
      m(
        'Không: khi một ô bị tấn công ta bỏ cả nhánh con của nó, nên chỉ thử một phần nhỏ.',
        'No: when a cell is attacked we drop its whole subtree, so only a small part is tried.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng quay lui chính là vét cạn: nó vét cạn nhưng cắt tỉa sớm các nhánh chắc chắn sai.',
        'Thinking backtracking is plain brute force: it is exhaustive search that prunes branches certain to fail.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input;
  const cols: number[] = []; // cols[r] = column of the queen in row r, for the rows placed so far
  let attempts = 0;

  const board = (): string[][] =>
    Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) => (cols[r] === c ? 'Q' : '')),
    );

  /** First queen that attacks (r, c): its row, column and why. */
  const attacker = (r: number, c: number): { rr: number; qc: number; diag: boolean } | null => {
    for (let rr = 0; rr < r; rr++) {
      if (cols[rr] === c) return { rr, qc: c, diag: false };
      if (Math.abs(r - rr) === Math.abs(c - cols[rr])) return { rr, qc: cols[rr], diag: true };
    }
    return null;
  };

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    cols.forEach((c, r) => (highlights[`${r},${c}`] = 'visited'));
    emit(
      { rows: n, cols: n, cells: board() },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { n }, {}, 'start');

  /** Fill row r; true when a full solution was found (cols stays as the solution). */
  function place(r: number): boolean {
    tick();
    if (r === n) {
      put(
        EX.solution,
        2,
        { n, cols: cols.join(', ') },
        Object.fromEntries(cols.map((c, k) => [`${k},${c}`, 'result' as HighlightKind])),
        'solution',
      );
      return true;
    }
    const rowMarks: Record<string, HighlightKind> = {};
    for (let c = 0; c < n; c++) rowMarks[`${r},${c}`] = 'active';
    put(EX.row, 3, { r }, rowMarks, 'try');
    for (let c = 0; c < n; c++) {
      attempts++;
      put(EX.check, 4, { r, c }, { [`${r},${c}`]: 'active' }, 'conflict-check');
      const hit = attacker(r, c);
      if (hit) {
        const marks: Record<string, HighlightKind> = {};
        for (let k = 0; k < n; k++) if (attacker(r, k)) marks[`${r},${k}`] = 'muted';
        marks[`${r},${c}`] = 'active';
        marks[`${hit.rr},${hit.qc}`] = 'compare';
        put(hit.diag ? EX.sameDiag : EX.sameCol, 4, { r, c, rr: hit.rr, qc: hit.qc }, marks);
        continue;
      }
      cols.push(c);
      put(EX.place, 5, { r, c }, { [`${r},${c}`]: 'result' }, 'place');
      if (place(r + 1)) return true;
      cols.pop();
      // a deeper row was stuck: it was this queen that blocked it, lift it and go on with column c + 1
      put(EX.back, 6, { r: r + 1, pr: r, pc: c }, { [`${r},${c}`]: 'compare' }, 'backtrack');
    }
    return false;
  }

  const ok = place(0);
  put(
    ok ? EX.doneYes : EX.doneNo,
    1,
    { n, attempts },
    ok ? Object.fromEntries(cols.map((c, k) => [`${k},${c}`, 'result' as HighlightKind])) : {},
    'done',
  );
}

export const nQueensEntry: WalkthroughEntry<In, S> = {
  id: 'n-queens',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'grid',
  curriculumTopics: ['t2-backtracking'],
  title: m('N hậu bằng quay lui', 'N queens by backtracking'),
  code: {
    pseudo: [
      'place(r):',
      '    if r = n: return true',
      '    for c ← 0 .. n − 1:',
      '        if ô (r, c) an toàn (khác cột, khác đường chéo các hậu đã đặt):',
      '            cols[r] ← c; if place(r + 1): return true',
      '    return false',
    ],
    impl: {
      cpp: [
        'bool safe(const std::vector<int>& cols, int r, int c) {',
        '    for (int rr = 0; rr < r; rr++) {',
        '        if (cols[rr] == c || std::abs(r - rr) == std::abs(c - cols[rr])) return false;',
        '    }',
        '    return true;',
        '}',
        'bool place(std::vector<int>& cols, int r, int n) {',
        '    if (r == n) return true;',
        '    for (int c = 0; c < n; c++) {',
        '        if (safe(cols, r, c)) {',
        '            cols[r] = c;',
        '            if (place(cols, r + 1, n)) return true;',
        '        }',
        '    }',
        '    return false;',
        '}',
      ],
      py: [
        'def safe(cols, r, c):',
        '    for rr in range(r):',
        '        if cols[rr] == c or abs(r - rr) == abs(c - cols[rr]):',
        '            return False',
        '    return True',
        'def place(cols, r, n):',
        '    if r == n:',
        '        return True',
        '    for c in range(n):',
        '        if safe(cols, r, c):',
        '            cols[r] = c',
        '            if place(cols, r + 1, n):',
        '                return True',
        '    return False',
      ],
    },
    map: {
      cpp: { 1: [7], 2: [8], 3: [9], 4: [1, 2, 3, 4, 5, 10], 5: [11, 12], 6: [15] },
      py: { 1: [6], 2: [7, 8], 3: [9], 4: [1, 2, 3, 4, 5, 10], 5: [11, 12, 13], 6: [14] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { n: { kind: 'enum', values: [1, 3, 4, 5] } },
  },
  customInput: false,
  presets: [
    { id: 'n1', label: m('Biên n = 1', 'Edge n = 1'), input: { n: 1 } },
    { id: 'n3-none', label: m('n = 3: vô nghiệm', 'n = 3: no solution'), input: { n: 3 } },
    { id: 'n4', label: m('n = 4', 'n = 4'), input: { n: 4 } },
    { id: 'n5', label: m('n = 5', 'n = 5'), input: { n: 5 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'conflict-check',
      text: m(
        'Kiểm đường chéo bằng |r − r2| = |c − c2| (hoặc r − c và r + c không trùng); chỉ kiểm cột là thiếu.',
        'Check diagonals with |r − r2| = |c − c2| (or that r − c and r + c do not repeat); checking only columns is not enough.',
      ),
    },
    {
      beat: 'backtrack',
      text: m(
        'Sau khi quay lui phải bỏ hậu vừa đặt khỏi cols/bàn cờ, nếu không các lần thử sau vẫn thấy nó.',
        'After backtracking the queen just placed must leave cols/the board, or later checks still see it.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'conflict-check',
      text: m(
        'std::abs cho int cần <cstdlib>; với số thực thì dùng <cmath>. Đừng viết abs(r - rr) khi chưa include.',
        'std::abs on int needs <cstdlib>; for floating point use <cmath>. Do not write abs(r - rr) without the include.',
      ),
    },
    {
      lang: 'py',
      beat: 'conflict-check',
      text: m(
        'Python: abs(r1 − r2) == abs(c1 − c2) là điều kiện cùng đường chéo; viết r1 − r2 == c1 − c2 chỉ bắt một chiều chéo.',
        'Python: abs(r1 − r2) == abs(c1 − c2) is the same-diagonal test; r1 − r2 == c1 − c2 catches only one diagonal direction.',
      ),
    },
  ],
  maxFrames: 120,
  maxBytes: 200_000,
  run,
};
