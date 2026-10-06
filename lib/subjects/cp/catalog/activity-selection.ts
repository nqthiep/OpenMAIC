/**
 * Walkthrough entry: activity selection, the greedy "earliest end first" with the exchange argument
 * (SCHEMA §5, card 2B-04). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { seg: number[][] };
type Interval = { id: string; start: number; end: number; label: string };
type S = { values: number[]; mode: 'cells'; intervals: Interval[] };

/** The time axis 0..24 drawn as the cells of the array. */
const AXIS = Array.from({ length: 25 }, (_, t) => t);

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Có {n} đoạn thời gian [bắt đầu, kết thúc). Chọn nhiều đoạn nhất sao cho không hai đoạn nào giao nhau.',
    'There are {n} time segments [start, end). Pick as many as possible so that no two of them overlap.',
  ),
  sort: m(
    'Trước hết cần sắp các đoạn theo một khoá. Thứ tự hiện tại là thứ tự đề cho; ta phải chọn khoá sắp xếp.',
    'First the segments must be sorted by some key. The current order is the one given; we have to choose the sort key.',
  ),
  sorted: m(
    'Sắp theo điểm kết thúc tăng dần: đoạn nào kết thúc sớm nhất được xét trước. Từ đây ta duyệt theo thứ tự này.',
    'Sorted by end point, increasing: the segment that ends earliest is looked at first. From here we scan in this order.',
  ),
  pick: m(
    'Đoạn [{s}, {e}): s = {s} ≥ last = {last}, không giao đoạn đã chọn nên chọn nó, rồi đặt last = {e}.',
    'Segment [{s}, {e}): s = {s} ≥ last = {last}, no overlap with those chosen, so choose it and set last = {e}.',
  ),
  skip: m(
    'Đoạn [{s}, {e}): s = {s} < last = {last}, giao với đoạn đã chọn nên bỏ.',
    'Segment [{s}, {e}): s = {s} < last = {last}, it overlaps a chosen segment, so skip it.',
  ),
  exchange: m(
    'Vì sao chọn đoạn [{s}, {e}) đầu tiên là đúng: một lời giải tối ưu bắt đầu bằng đoạn khác ta đổi đoạn đó thành [{s}, {e}) mà vẫn hợp lệ.',
    'Why choosing [{s}, {e}) first is right: an optimal answer starting with another segment can swap it for [{s}, {e}) and stay valid.',
  ),
  done: m(
    'Chọn được {count} đoạn không giao nhau, nhiều nhất có thể.',
    'We chose {count} pairwise disjoint segments, the most possible.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Có {n} đoạn thời gian nửa mở [bắt đầu, kết thúc). Hai đoạn không giao nhau khi đoạn này kết thúc không muộn hơn lúc đoạn kia bắt đầu. Ta chọn nhiều đoạn nhất.',
      'There are {n} half-open time segments [start, end). Two segments do not overlap when one ends no later than the other starts. We choose as many as possible.',
    ),
    hints: [
      m('Thử mọi tập đoạn có tốn không?', 'Would trying every set of segments be expensive?'),
      m(
        'Có 2^n tập: quá nhiều. Cần một quy tắc chọn từng đoạn một và không phải hối hận.',
        'There are 2^n sets: too many. We need a rule that picks one segment at a time without regret.',
      ),
      m(
        'Tham lam: luôn chọn đoạn còn lại kết thúc sớm nhất và không giao, để chừa nhiều thời gian nhất cho phần sau.',
        'Greedy: always take the compatible segment that ends earliest, which leaves the most time for the rest.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chọn đoạn ngắn nhất trước là tốt nhất: một đoạn ngắn ở giữa có thể chặn hai đoạn khác.',
        'Thinking the shortest segment first is best: one short segment in the middle can block two others.',
      ),
    ],
  },
  {
    id: 'sort',
    label: m('Sắp xếp', 'Sort'),
    narration: m(
      'Ta cần sắp các đoạn trước khi duyệt. Có hai khoá tự nhiên: điểm bắt đầu hoặc điểm kết thúc. Chỉ một khoá cho lời giải đúng.',
      'We must sort the segments before scanning. There are two natural keys: the start or the end. Only one of them gives a correct answer.',
    ),
    ask: {
      text: m(
        'Theo em, nên sắp các đoạn theo điểm đầu hay điểm cuối?',
        'Should we sort the segments by start point or by end point?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Điểm đầu', 'Start point'), m('Điểm cuối', 'End point')],
        answer: (_frame, next) => (next ? 1 : -1),
      },
    },
    hints: [
      m(
        'Mục tiêu là chừa nhiều thời gian nhất cho các đoạn sau. Đại lượng nào quyết định thời gian còn lại?',
        'The aim is to leave the most time for later segments. Which quantity decides the remaining time?',
      ),
      m(
        'Thời gian còn lại bắt đầu từ lúc đoạn đã chọn kết thúc: điểm cuối càng sớm càng tốt.',
        'The remaining time starts when the chosen segment ends: the earlier the end the better.',
      ),
      m(
        'Sắp theo điểm cuối tăng dần. Sắp theo điểm đầu sai: [0, 10) đứng đầu sẽ chặn mọi đoạn nhỏ trong nó.',
        'Sort by end point, increasing. Sorting by start is wrong: [0, 10) first would block every small segment inside it.',
      ),
    ],
    misconceptions: [
      m(
        'Sắp theo điểm bắt đầu: ví dụ [0, 10), [1, 2), [3, 4) cho 1 đoạn thay vì 2.',
        'Sorting by start: for example [0, 10), [1, 2), [3, 4) gives 1 segment instead of 2.',
      ),
    ],
  },
  {
    id: 'pick',
    label: m('Chọn đoạn', 'Pick a segment'),
    narration: m(
      'Đoạn [{s}, {e}) bắt đầu lúc {s}, không sớm hơn mốc rảnh last = {last}, nên không giao. Ta chọn nó và dời last đến {e}.',
      'The segment [{s}, {e}) starts at {s}, not before the free time last = {last}, so no overlap. We choose it and move last to {e}.',
    ),
    hints: [
      m(
        'Đoạn này có bắt đầu trước khi đoạn đã chọn cuối cùng kết thúc không?',
        'Does this segment start before the last chosen one ends?',
      ),
      m(
        'So điểm bắt đầu s với last (điểm kết thúc của đoạn chọn gần nhất).',
        'Compare the start s with last (the end of the most recently chosen segment).',
      ),
      m(
        'Đoạn nửa mở: s ≥ last là không giao ⇒ chọn và last ← e.',
        'Half-open segments: s ≥ last means no overlap ⇒ choose and set last ← e.',
      ),
    ],
    misconceptions: [
      m(
        'Dùng s > last thay vì s ≥ last: đoạn [1, 4) và [4, 6) không giao nhau vì 4 thuộc đoạn sau.',
        'Using s > last instead of s ≥ last: [1, 4) and [4, 6) do not overlap, because 4 belongs to the second one.',
      ),
    ],
  },
  {
    id: 'skip',
    label: m('Bỏ đoạn', 'Skip a segment'),
    narration: m(
      'Đoạn [{s}, {e}) bắt đầu lúc {s}, sớm hơn mốc last = {last}: nó giao với đoạn đã chọn, nên bỏ.',
      'The segment [{s}, {e}) starts at {s}, before last = {last}: it overlaps a chosen segment, so we skip it.',
    ),
    hints: [
      m('Đoạn này giao với đoạn nào đã chọn?', 'Which chosen segment does this one overlap?'),
      m(
        'Nó bắt đầu trước khi đoạn chọn cuối cùng kết thúc: s < last.',
        'It starts before the last chosen segment ends: s < last.',
      ),
      m(
        'Giao thì bỏ; last không đổi và ta xét đoạn kế tiếp.',
        'Overlapping means skip; last stays and we look at the next segment.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bỏ một đoạn là mất cơ hội: nhờ sắp theo điểm cuối, đoạn đã chọn kết thúc sớm hơn nên không mất gì.',
        'Thinking skipping loses an opportunity: since we sorted by end, the chosen segment ends earlier, nothing is lost.',
      ),
    ],
  },
  {
    id: 'exchange',
    label: m('Lập luận đổi chỗ', 'The exchange argument'),
    narration: m(
      'Lấy một lời giải tối ưu bất kỳ. Đoạn đầu tiên của nó kết thúc không sớm hơn {e}. Thay bằng [{s}, {e}) thì vẫn không giao đoạn nào sau, nên số đoạn không giảm.',
      'Take any optimal answer. Its first segment ends no earlier than {e}. Replacing it with [{s}, {e}) still overlaps none of the later ones, so the count does not drop.',
    ),
    hints: [
      m(
        'Giả sử có lời giải tối ưu không chứa đoạn kết thúc sớm nhất. Đoạn đầu của nó kết thúc lúc nào so với {e}?',
        'Suppose some optimal answer lacks the earliest-ending segment. When does its first segment end compared with the earliest end?',
      ),
      m(
        'Không sớm hơn. Nếu thay đoạn đầu đó bằng đoạn kết thúc sớm nhất thì có đoạn nào bị giao không?',
        'No earlier. If we swap that first segment for the earliest-ending one, does any segment become overlapped?',
      ),
      m(
        'Không: đoạn thay vào kết thúc không muộn hơn nên mọi đoạn sau vẫn rời nó. Vậy luôn có lời giải tối ưu chứa đoạn kết thúc sớm nhất.',
        'No: the replacement ends no later, so all later segments stay clear. Hence some optimal answer contains the earliest-ending segment.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tham lam đúng vì "có vẻ hợp lý": cần chứng minh, và phép đổi chỗ chính là chứng minh.',
        'Thinking the greedy is right because it "looks reasonable": a proof is needed, and the exchange is the proof.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Chọn được {count} đoạn không giao nhau, và đó là nhiều nhất. Thời gian chủ yếu dành cho việc sắp xếp: O(n log n).',
      'We chose {count} pairwise disjoint segments, which is the most possible. Most of the time goes into sorting: O(n log n).',
    ),
    hints: [
      m('Sau khi sắp xếp, ta duyệt mấy lần?', 'After sorting, how many passes do we make?'),
      m(
        'Một lần duyệt, mỗi đoạn xét đúng một lần: O(n).',
        'One pass, each segment looked at once: O(n).',
      ),
      m(
        'Tổng cộng O(n log n) vì bước sắp xếp chiếm phần lớn thời gian.',
        'In total O(n log n) since the sort takes most of the time.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng kết quả phụ thuộc vào thứ tự đề cho: sau khi sắp theo điểm cuối, số đoạn là như nhau.',
        'Thinking the result depends on the input order: after sorting by end, the count is the same.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const segs = input.seg.map(([start, end], k) => ({ id: `s${k}`, start, end, k }));
  const n = segs.length;
  const intervals: Interval[] = segs.map((x) => ({
    id: x.id,
    start: x.start,
    end: x.end,
    label: `[${x.start}, ${x.end})`,
  }));
  const status = new Map<string, HighlightKind>();
  const lab = (x: { start: number; end: number }): string => `[${x.start}, ${x.end})`;

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    order: readonly { start: number; end: number }[],
    current: string | undefined,
    last: number | undefined,
    tag?: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (const [id, kind] of status) highlights[id] = kind;
    if (current !== undefined && !status.has(current)) highlights[current] = 'active';
    emit(
      { values: AXIS, mode: 'cells', intervals },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights,
        pointers: last === undefined ? {} : { last },
        aux: [
          {
            id: 'order',
            label: msg(m('Thứ tự xét', 'Order of scan'), ctx.locale),
            items: order.map(lab),
          },
        ],
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 2, { n }, segs, undefined, undefined, 'start');
  put(EX.sort, 1, { n }, segs, undefined, undefined, 'sort');
  const sorted = [...segs].sort((p, q) => p.end - q.end); // stable: equal ends keep the input order
  put(EX.sorted, 1, { n }, sorted, undefined, 0);

  let last = 0;
  let count = 0;
  sorted.forEach((x, idx) => {
    tick();
    if (x.start >= last) {
      const before = last;
      last = x.end;
      count++;
      status.set(x.id, 'result');
      put(
        EX.pick,
        4,
        { k: idx + 1, s: x.start, e: x.end, last: before, count },
        sorted,
        x.id,
        last,
        'pick',
      );
      if (count === 1) {
        put(EX.exchange, 4, { s: x.start, e: x.end }, sorted, x.id, last, 'exchange');
      }
    } else {
      status.set(x.id, 'muted');
      put(
        EX.skip,
        5,
        { k: idx + 1, s: x.start, e: x.end, last, count },
        sorted,
        x.id,
        last,
        'skip',
      );
    }
  });
  put(EX.done, 6, { count }, sorted, undefined, last, 'done');
}

export const activitySelectionEntry: WalkthroughEntry<In, S> = {
  id: 'activity-selection',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t3-greedy'],
  title: m(
    'Chọn nhiều đoạn nhất không giao nhau',
    'Activity selection: the most disjoint segments',
  ),
  code: {
    pseudo: [
      'sắp các đoạn tăng dần theo điểm cuối',
      'last ← 0; count ← 0',
      'for mỗi đoạn [s, e) theo thứ tự đó:',
      '    if s ≥ last: chọn đoạn; last ← e; count ← count + 1',
      '    else: bỏ đoạn',
      'return count',
    ],
    impl: {
      cpp: [
        'int max_segments(std::vector<std::pair<int, int>> seg) {',
        '    std::sort(seg.begin(), seg.end(), [](const auto& x, const auto& y) { return x.second < y.second; });',
        '    int last = 0, count = 0;',
        '    for (const auto& s : seg) {',
        '        if (s.first >= last) {',
        '            count++;',
        '            last = s.second;',
        '        }',
        '    }',
        '    return count;',
        '}',
      ],
      py: [
        'def max_segments(seg):',
        '    seg = sorted(seg, key=lambda s: s[1])',
        '    last, count = 0, 0',
        '    for s, e in seg:',
        '        if s >= last:',
        '            count += 1',
        '            last = e',
        '    return count',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4], 4: [5, 6, 7], 5: [8], 6: [10] },
      py: { 1: [2], 2: [3], 3: [4], 4: [5, 6, 7], 5: [5], 6: [8] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { seg: { kind: 'grid', rows: [1, 8], cols: [2, 2], cell: 'int', range: [0, 24] } },
  },
  check: (input) => (input.seg.every(([s, e]) => s < e) ? [] : ['start-not-before-end']),
  customInput: false,
  presets: [
    {
      id: 'classic',
      label: m('Ví dụ chuẩn', 'Standard example'),
      input: {
        seg: [
          [1, 4],
          [3, 5],
          [0, 6],
          [5, 7],
          [3, 9],
          [8, 9],
        ],
      },
    },
    {
      id: 'nested',
      label: m('Đoạn lồng nhau', 'Nested segments'),
      input: {
        seg: [
          [0, 10],
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      },
    },
    {
      id: 'disjoint',
      label: m('Đều rời nhau', 'All disjoint'),
      input: {
        seg: [
          [0, 1],
          [2, 3],
          [4, 5],
        ],
      },
    },
    { id: 'single', label: m('Một đoạn', 'One segment'), input: { seg: [[2, 5]] } },
    {
      id: 'same-end',
      label: m('Cùng điểm cuối', 'Same end point'),
      input: {
        seg: [
          [1, 4],
          [2, 4],
          [3, 4],
        ],
      },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'sort',
      text: m(
        'Sắp theo điểm bắt đầu là sai (phản ví dụ [0, 10), [1, 2), [3, 4)); phải sắp theo điểm kết thúc.',
        'Sorting by start is wrong (counterexample [0, 10), [1, 2), [3, 4)); sort by end.',
      ),
    },
    {
      beat: 'pick',
      text: m(
        'Với đoạn nửa mở [s, e) hai đoạn kề nhau không giao: so s ≥ last, không phải s > last. Nếu đề dùng đoạn đóng thì so s > last.',
        'For half-open [s, e) touching segments do not overlap: compare s ≥ last, not s > last. If the task uses closed segments compare s > last.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'sort',
      text: m(
        'Tiêu chí sắp xếp cho std::sort là một lambda: [](const auto& x, const auto& y) { return x.second < y.second; }. Dùng <= làm std::sort có hành vi không xác định.',
        'The sort criterion for std::sort is a lambda: [](const auto& x, const auto& y) { return x.second < y.second; }. Using <= makes std::sort undefined.',
      ),
    },
    {
      lang: 'py',
      beat: 'sort',
      text: m(
        'sorted(seg, key=lambda s: s[1]) sắp theo phần tử thứ hai (điểm cuối); quên key sẽ sắp theo điểm đầu.',
        'sorted(seg, key=lambda s: s[1]) sorts by the second item (the end); without key it sorts by the start.',
      ),
    },
  ],
  maxFrames: 40,
  maxBytes: 200_000,
  run,
};
