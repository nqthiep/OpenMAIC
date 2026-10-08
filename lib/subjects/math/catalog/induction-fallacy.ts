/**
 * Walkthrough entry: Fallacies of induction (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m2-induction`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState } from '@/lib/subjects/math/figure';

type Kind = 'all-same-color' | 'missing-base';
type In = { n: number; kind: Kind };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    n: { kind: 'int', range: [3, 8] },
    kind: { kind: 'enum', values: ['all-same-color', 'missing-base'] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Một phát biểu đáng ngờ', 'A suspicious claim'),
    narration: m(
      'Ta nêu một phát biểu và nói sẽ chứng minh nó bằng quy nạp. Phát biểu này thực ra sai. Nhiệm vụ của ta là tìm ra bước hỏng trong lập luận.',
      'We state a claim and say we will prove it by induction. The claim is in fact false. Our job is to find the broken step in the argument.',
    ),
    hints: [
      m('Quy nạp gồm những phần nào?', 'What parts does an induction have?'),
      m('Bước cơ sở và bước quy nạp.', 'The base case and the induction step.'),
      m(
        'Cả hai phải đúng; ta sẽ xem phần nào hỏng.',
        'Both must be true; we will see which one is broken.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng một lập luận quy nạp trông trôi chảy thì phát biểu chắc chắn đúng: phải kiểm từng bước.',
        'Thinking a smooth-looking induction argument makes the claim surely true: every step must be checked.',
      ),
    ],
  },
  {
    id: 'step',
    label: m('Bước quy nạp', 'The induction step'),
    narration: m(
      'Ta giả sử phát biểu đúng với k và cố suy ra nó đúng với k cộng một. Lập luận nghe có vẻ trôi chảy. Từng dòng của bước này dường như đều đúng.',
      'We assume the claim for k and try to derive it for k plus one. The argument sounds smooth. Each line of this step seems correct.',
    ),
    ask: {
      text: m(
        'Với k đủ lớn, bước quy nạp từ k lên k + 1 trong lập luận này có đúng không?',
        'For k large enough, is the induction step from k to k + 1 in this argument correct?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Đúng', 'Correct'), m('Sai', 'Wrong')],
        // both arguments have a sound step for large k: the flaw is in the first step (horses) or in the base case (parity)
        answer: () => 0,
      },
    },
    hints: [
      m('Bước quy nạp nói điều gì?', 'What does the induction step say?'),
      m('Nếu đúng với k thì đúng với k + 1.', 'If it holds for k then it holds for k + 1.'),
      m(
        'Nó không nói rằng phát biểu đúng với k nào cả, chỉ nói về việc truyền đi.',
        'It does not say the claim holds for any particular k, only about passing it on.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bước quy nạp đúng là đủ: còn cần bước cơ sở đúng, và bước đó phải đúng cho mọi k.',
        'Thinking a true induction step is enough: a true base case is needed, and the step must hold for every k.',
      ),
    ],
  },
  {
    id: 'crack',
    label: m('Chỗ hỏng', 'The crack'),
    narration: m(
      'Ta soi từng trường hợp nhỏ của bước quy nạp và tìm nơi lập luận không còn đứng vững. Ở đó, một điều lập luận đã ngầm dùng bị phá vỡ.',
      'We examine the small cases of the step and look for where the argument no longer holds. There, something the argument silently relied on is broken.',
    ),
    ask: {
      text: m(
        'Bước nào của lập luận không còn đúng?',
        'Which step of the argument stops being true?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Bước cơ sở n = 1', 'The base case n = 1'),
          m('Bước quy nạp từ k = 1 lên 2', 'The induction step from k = 1 to 2'),
          m('Bước quy nạp với k lớn', 'The induction step for large k'),
        ],
        // the horses break at the step 1 → 2, the parity claim at the base case
        answer: (frame) => ((frame.meta.vars as { horse: number }).horse === 1 ? 1 : 0),
      },
    },
    hints: [
      m(
        'Với k nhỏ nhất, lập luận còn đúng không?',
        'For the smallest k, does the argument still work?',
      ),
      m(
        'Thử k = 1: hai nhóm một con có chung con nào không?',
        'Try k = 1: do two groups of one horse share a horse?',
      ),
      m(
        'Không có chung con nào, nên bước từ 1 lên 2 hỏng; với bài số, thử n = 1 và thấy cơ sở sai.',
        'They share none, so the step from 1 to 2 breaks; in the numeric case try n = 1 and see the base fail.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng lỗi nằm ở phát biểu chứ không phải lập luận: phát biểu sai, và ta phải chỉ ra bước nào của lập luận cho phép sai lầm lọt qua.',
        'Thinking the error is in the claim and not the argument: the claim is false, and we must point at the step of the argument that lets the mistake through.',
      ),
    ],
  },
  {
    id: 'fix',
    label: m('Điều kiện cần', 'What induction needs'),
    narration: m(
      'Quy nạp cần cả hai thứ: một bước cơ sở đúng, và một bước quy nạp đúng cho mọi k bắt đầu từ cơ sở. Thiếu một trong hai thì phát biểu có thể sai dù lập luận trông trọn vẹn.',
      'Induction needs both: a true base case, and an induction step that is true for every k starting from the base. With either one missing, a claim can be false even though the argument looks complete.',
    ),
    hints: [
      m('Quy nạp đúng cần điều kiện nào?', 'What does a correct induction need?'),
      m('Cơ sở đúng và bước quy nạp đúng.', 'A true base case and a true induction step.'),
      m(
        'Thiếu cơ sở hoặc bước hỏng ở một k nào đó thì phát biểu có thể sai.',
        'With the base case missing, or the step broken at some k, the claim may be false.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ cần kiểm vài giá trị đầu thay cho bước quy nạp: vài giá trị đầu không chứng minh được mọi n.',
        'Thinking checking a few first values can stand in for the induction step: a few first values do not prove every n.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Quy nạp cần cả hai thứ: bước cơ sở đúng và bước quy nạp đúng cho mọi k kể từ cơ sở. Thiếu một trong hai thì phát biểu có thể sai dù lập luận trông trọn vẹn. Đổi mẫu để xem cả hai kiểu lỗi.',
      'Induction needs both: a true base case and an induction step that is true for every k from the base on. Missing either one, a claim can be false although the argument looks complete. Change the preset to see both kinds of flaw.',
    ),
    hints: [
      m('Quy nạp cần những gì?', 'What does induction need?'),
      m(
        'Một bước cơ sở đúng và một bước quy nạp đúng cho mọi k bắt đầu từ cơ sở.',
        'A true base case and an induction step that is true for every k starting from the base.',
      ),
      m(
        'Kiểm cả hai: lỗi có thể ở bước cơ sở hoặc ở bước đầu tiên của chuỗi suy luận.',
        'Check both: the flaw can be in the base case or in the first link of the chain.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ cần bước quy nạp nghe hợp lý: nếu bước cơ sở hoặc bước nối đầu tiên hỏng, cả chuỗi sụp đổ.',
        'Thinking a plausible-sounding induction step is enough: if the base case or the first link fails, the whole chain collapses.',
      ),
    ],
  },
];

const EX = {
  hStart: m(
    'Phát biểu "chứng minh bằng quy nạp": trong một đàn {n} con ngựa, mọi con đều cùng màu. Phát biểu này sai; ta tìm chỗ hỏng.',
    'The claim "proved by induction": in a herd of {n} horses, every horse has the same colour. The claim is false; we look for the flaw.',
  ),
  hStep1: m(
    'Bước quy nạp từ k = {k} lên {n}: bỏ con cuối, {k} con còn lại cùng màu theo giả thiết.',
    'The induction step from k = {k} to {n}: leave out the last horse, the other {k} have one colour by the hypothesis.',
  ),
  hStep2: m(
    'Bỏ con đầu: {k} con còn lại cũng cùng màu. Hai nhóm chung {ov} con (đậm), nên mọi con cùng màu. Nghe có vẻ trôi chảy.',
    'Leave out the first horse: the other {k} also have one colour. The two groups share {ov} horses (dark), so all have one colour. It sounds smooth.',
  ),
  hCrack: m(
    'Thử bước nhỏ nhất, k = 1 lên 2: hai nhóm là con 1 và con 2, chung {ov} con. Không có gì nối màu hai nhóm lại.',
    'Try the smallest step, k = 1 to 2: the two groups are horse 1 and horse 2, sharing {ov} horses. Nothing ties the two colours together.',
  ),
  hFix: m(
    'Bước 1 lên 2 hỏng nên cả chuỗi sụp đổ, dù mọi bước từ k = 2 trở lên đều ổn. Hai con có thể khác màu.',
    'The step 1 to 2 fails and the whole chain collapses, although every step from k = 2 on is fine. Two horses can differ in colour.',
  ),
  hDone: m(
    'Mệnh đề không đúng với đàn {n} con: bước quy nạp phải đúng cho cả bước nhỏ nhất, k = 1 lên 2.',
    'The claim fails for a herd of {n}: the induction step must hold for the smallest step too, k = 1 to 2.',
  ),
  pStart: m(
    'Phát biểu "chứng minh bằng quy nạp": n² + n luôn lẻ. Các số bên dưới là n² + n với n = 1 đến {n}.',
    'The claim "proved by induction": n² + n is always odd. The numbers below are n² + n for n = 1 to {n}.',
  ),
  pStep: m(
    'Giả sử k² + k lẻ với k = {k}. Khi đó (k + 1)² + (k + 1) = (k² + k) + 2(k + 1) = lẻ + chẵn = lẻ. Bước này đúng với mọi k.',
    'Suppose k² + k is odd for k = {k}. Then (k + 1)² + (k + 1) = (k² + k) + 2(k + 1) = odd + even = odd. This step is right for every k.',
  ),
  pCrack: m(
    'Kiểm trực tiếp: n = 1 cho 1² + 1 = {v1}, một số chẵn. Cả {n} giá trị đầu đều chẵn (cam): bước cơ sở không đúng.',
    'Check directly: n = 1 gives 1² + 1 = {v1}, an even number. All the first {n} values are even (orange): the base case fails.',
  ),
  pFix: m(
    'Bước quy nạp đúng nhưng không có chỗ để bắt đầu: n = 1 cho {v1}, chẵn. Thiếu bước cơ sở đúng thì không suy ra được gì.',
    'The induction step is right but has nowhere to start: n = 1 gives {v1}, even. Without a true base case nothing follows.',
  ),
  pDone: m(
    'n² + n thực ra luôn chẵn: n(n + 1) là tích hai số liên tiếp. Quy nạp cần cả bước cơ sở đúng lẫn bước quy nạp đúng.',
    'n² + n is in fact always even: n(n + 1) is a product of two consecutive numbers. Induction needs a true base case and a true step.',
  ),
};

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { n, kind } = input;
  const horse = kind === 'all-same-color' ? 1 : 0;
  const bounds = { xmin: 0, xmax: n + 1, ymin: -1.5, ymax: 1.5 };
  /** n dots in a row labelled 1..n (the horses), or labelled with n² + n for the n values (the parity claim) */
  const row = (
    mark: (i: number) => HighlightKind,
    upTo = n,
  ): { fig: Figure; marks: Record<string, HighlightKind> } => {
    const fig = new Figure(bounds);
    const marks: Record<string, HighlightKind> = {};
    for (let i = 1; i <= upTo; i++) {
      fig.point(`p${i}`, [i, 0], horse ? `${i}` : `${i * i + i}`, { r: 14 });
      marks[`p${i}`] = mark(i);
    }
    return { fig, marks };
  };
  const put = framePut(emit, ctx.locale);
  const at = (
    text: Messages,
    codeLine: number,
    pic: { fig: Figure; marks: Record<string, HighlightKind> },
    vars: Record<string, number>,
    beat?: string,
  ): void => put(text, codeLine, pic.fig, { horse, ...vars }, beat, pic.marks);
  const k = n - 1;

  if (horse) {
    at(
      EX.hStart,
      1,
      row(() => 'muted'),
      { n },
      'start',
    );
    at(
      EX.hStep1,
      2,
      row((i) => (i <= k ? 'group-0' : 'muted')),
      { n, k },
      'step',
    );
    at(
      EX.hStep2,
      2,
      row((i) => (i >= 2 && i <= k ? 'group-2' : i <= k ? 'group-0' : 'group-1')),
      { n, k, ov: n - 2 },
    );
    at(
      EX.hCrack,
      3,
      row((i) => (i === 1 ? 'group-0' : 'group-1'), 2),
      { ov: 0 },
      'crack',
    );
    at(
      EX.hFix,
      4,
      row((i) => (i === 1 ? 'group-0' : 'group-1'), 2),
      { n },
      'fix',
    );
    at(
      EX.hDone,
      4,
      row((i) => (i === 1 ? 'group-0' : 'group-1'), 2),
      { n },
      'done',
    );
  } else {
    const parity = (i: number): HighlightKind => ((i * i + i) % 2 === 0 ? 'compare' : 'result');
    at(
      EX.pStart,
      1,
      row(() => 'muted'),
      { n },
      'start',
    );
    at(
      EX.pStep,
      2,
      row((i) => (i === k || i === n ? 'active' : 'muted')),
      { n, k },
      'step',
    );
    at(EX.pCrack, 3, row(parity), { n, v1: 2 }, 'crack');
    at(EX.pFix, 4, row(parity, 1), { v1: 2 }, 'fix');
    at(EX.pDone, 4, row(parity), { n }, 'done');
  }
}

export const inductionFallacyEntry: WalkthroughEntry<In, S> = {
  id: 'induction-fallacy',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m2-induction'],
  title: m('Nguỵ biện quy nạp', 'Fallacies of induction'),
  code: {
    pseudo: [
      'hàng ngựa hoặc hàng giá trị n² + n, kèm phát biểu cần chứng minh bằng quy nạp',
      'bước quy nạp: hai nhóm k con chồng lên nhau, hoặc phép biến đổi từ k lên k + 1 của n² + n',
      'chỗ hỏng: bước k = 1 → 2 (hai nhóm một con, không chung con nào), hoặc bước cơ sở n = 1 cho số chẵn',
      'quy nạp cần cả bước cơ sở đúng lẫn bước quy nạp đúng',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    {
      id: 'colors-4',
      label: m('Mọi con ngựa cùng màu (4 con)', 'All horses have one colour (4 horses)'),
      input: { n: 4, kind: 'all-same-color' },
    },
    {
      id: 'colors-8',
      label: m('Mọi con ngựa cùng màu (8 con)', 'All horses have one colour (8 horses)'),
      input: { n: 8, kind: 'all-same-color' },
    },
    {
      id: 'base-3',
      label: m('n² + n luôn lẻ (đến n = 3)', 'n² + n is always odd (up to n = 3)'),
      input: { n: 3, kind: 'missing-base' },
    },
    {
      id: 'base-6',
      label: m('n² + n luôn lẻ (đến n = 6)', 'n² + n is always odd (up to n = 6)'),
      input: { n: 6, kind: 'missing-base' },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng một lập luận quy nạp trông trôi chảy thì phát biểu chắc chắn đúng: phải kiểm từng bước.',
        'Thinking a smooth-looking induction argument makes the claim surely true: every step must be checked.',
      ),
    },
    {
      beat: 'step',
      text: m(
        'Nghĩ rằng bước quy nạp đúng là đủ: còn cần bước cơ sở đúng, và bước đó phải đúng cho mọi k.',
        'Thinking a true induction step is enough: a true base case is needed, and the step must hold for every k.',
      ),
    },
    {
      beat: 'crack',
      text: m(
        'Nghĩ rằng lỗi nằm ở phát biểu chứ không phải lập luận: phát biểu sai, và ta phải chỉ ra bước nào của lập luận cho phép sai lầm lọt qua.',
        'Thinking the error is in the claim and not the argument: the claim is false, and we must point at the step of the argument that lets the mistake through.',
      ),
    },
    {
      beat: 'fix',
      text: m(
        'Nghĩ rằng chỉ cần kiểm vài giá trị đầu thay cho bước quy nạp: vài giá trị đầu không chứng minh được mọi n.',
        'Thinking checking a few first values can stand in for the induction step: a few first values do not prove every n.',
      ),
    },
  ],
  maxFrames: 8,
  maxBytes: 200_000,
  run,
};
