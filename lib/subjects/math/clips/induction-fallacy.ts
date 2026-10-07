/**
 * Clip template: two fallacies of induction (card 3D-T4): "all horses have the same colour" (the step from 1 to 2
 * breaks because two groups of one horse share nothing) and a claim with a valid step but no base case ("n² + n
 * is odd"). TypeScript half only (the Manim scene is task 3D-M4). Deterministic and browser-safe (ADR 0006):
 * integers only.
 * Curriculum topic `induction` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type Kind = 'all-same-color' | 'missing-base';
type In = { n: number; kind: Kind };

const inputSpec = {
  kind: 'record',
  fields: {
    n: { kind: 'int', range: [3, 8] },
    kind: { kind: 'enum', values: ['all-same-color', 'missing-base'] },
  },
} as const;

/** Two groups of k horses inside k + 1 horses share k − 1 horses: the overlap that the "proof" relies on. */
export const horseOverlap = (k: number): number => k - 1;

/** The claim of the second fallacy: n² + n is odd. */
export const claimMissingBase = (n: number): boolean => (n * n + n) % 2 === 1;

/** The first n where the claim stops being derivable: the step from k = 1 to 2 for the horses, the base case n = 1 otherwise. */
export function failAt(kind: Kind): number {
  return kind === 'all-same-color' ? 2 : 1;
}

export const inductionFallacyEntry: ClipEntry<In> = defineClip<In>({
  id: 'induction-fallacy',
  curriculumTopics: ['induction'],
  title: m('Nguỵ biện quy nạp', 'Fallacies of induction'),
  inputSpec,
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
  chapters: [
    {
      id: 'claim',
      startSec: 0,
      endSec: 9,
      label: m('Một phát biểu đáng ngờ', 'A suspicious claim'),
      before: m(
        'Ta nêu một phát biểu và nói sẽ chứng minh nó bằng quy nạp. Phát biểu này thực ra sai.',
        'We state a claim and say we will prove it by induction. The claim is in fact false.',
      ),
      after: m(
        'Nhiệm vụ của ta là tìm ra bước hỏng trong lập luận.',
        'Our job is to find the broken step in the argument.',
      ),
    },
    {
      id: 'step',
      startSec: 9,
      endSec: 21,
      label: m('Bước quy nạp', 'The induction step'),
      before: m(
        'Ta giả sử phát biểu đúng với k và cố suy ra nó đúng với k cộng một. Lập luận nghe có vẻ trôi chảy.',
        'We assume the claim for k and try to derive it for k plus one. The argument sounds smooth.',
      ),
      after: m(
        'Từng dòng của bước này dường như đều đúng.',
        'Each line of this step seems correct.',
      ),
      ask: m(
        'Theo em, bước quy nạp này có vẻ đúng không?',
        'Does this induction step look right to you?',
      ),
    },
    {
      id: 'crack',
      startSec: 21,
      endSec: 35,
      label: m('Chỗ hỏng', 'The crack'),
      before: m(
        'Ta soi từng trường hợp nhỏ của bước quy nạp và tìm nơi lập luận không còn đứng vững.',
        'We examine the small cases of the step and look for where the argument no longer holds.',
      ),
      after: m(
        'Ở đó, một điều lập luận đã ngầm dùng bị phá vỡ.',
        'There, something the argument silently relied on is broken.',
      ),
      caption: m('chỗ hỏng', 'the crack'),
      ask: m('Bước nào không còn đúng?', 'Which step stops being true?'),
    },
    {
      id: 'fix',
      startSec: 35,
      endSec: 46,
      label: m('Điều kiện cần', 'What induction needs'),
      before: m(
        'Quy nạp cần cả hai thứ: một bước cơ sở đúng, và một bước quy nạp đúng cho mọi k bắt đầu từ cơ sở.',
        'Induction needs both: a true base case, and an induction step that is true for every k starting from the base.',
      ),
      after: m(
        'Thiếu một trong hai thì phát biểu có thể sai dù lập luận trông trọn vẹn.',
        'With either one missing, a claim can be false even though the argument looks complete.',
      ),
      caption: m('cơ sở + bước', 'base + step'),
    },
  ],
  invariants: (i) => {
    if (i.kind === 'all-same-color') {
      // two groups of k horses (each missing one horse) overlap in k − 1 horses; the common horse the proof needs exists iff k ≥ 2
      for (let k = 1; k < i.n; k++) if (horseOverlap(k) > 0 !== k >= 2) return false;
      return failAt(i.kind) === 2 && horseOverlap(1) === 0;
    }
    // the claim fails at n = 1 (1 + 1 = 2 is even), yet the step "P(k) ⇒ P(k + 1)" holds for every k up to n
    if (claimMissingBase(1)) return false;
    for (let k = 1; k <= i.n; k++)
      if (claimMissingBase(k) && !claimMissingBase(k + 1)) return false;
    return failAt(i.kind) === 1 && !claimMissingBase(i.n);
  },
  sheet: {
    chapters: [
      {
        id: 'claim',
        shows: m(
          'phát biểu cần chứng minh hiện trên màn hình cùng nhãn "chứng minh bằng quy nạp"',
          'the claim shown on screen with the label "proof by induction"',
        ),
        formulas: ['\\(P(n)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng một lập luận quy nạp trông trôi chảy thì phát biểu chắc chắn đúng: phải kiểm từng bước.',
            'Thinking a smooth-looking induction argument makes the claim surely true: every step must be checked.',
          ),
        ],
        hints: hints(
          'Quy nạp gồm những phần nào?',
          'Bước cơ sở và bước quy nạp.',
          'Cả hai phải đúng; ta sẽ xem phần nào hỏng.',
          'What parts does an induction have?',
          'The base case and the induction step.',
          'Both must be true; we will see which one is broken.',
        ),
      },
      {
        id: 'step',
        shows: m(
          'hai nhóm k con (hoặc phép biến đổi từ k lên k + 1) được vẽ chồng lên nhau',
          'two groups of k horses (or the passage from k to k + 1) drawn overlapping',
        ),
        formulas: ['\\(P(k) \\Rightarrow P(k + 1)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng bước quy nạp đúng là đủ: còn cần bước cơ sở đúng, và bước đó phải đúng cho mọi k.',
            'Thinking a true induction step is enough: a true base case is needed, and the step must hold for every k.',
          ),
        ],
        hints: hints(
          'Bước quy nạp nói điều gì?',
          'Nếu đúng với k thì đúng với k + 1.',
          'Nó không nói rằng phát biểu đúng với k nào cả, chỉ nói về việc truyền đi.',
          'What does the induction step say?',
          'If it holds for k then it holds for k + 1.',
          'It does not say the claim holds for any particular k, only about passing it on.',
        ),
      },
      {
        id: 'crack',
        shows: m(
          'trường hợp k = 1 → 2 được phóng to: hai nhóm một con không có phần chung; hoặc n = 1 được thử và cho kết quả sai',
          'the case k = 1 → 2 zoomed in: two groups of one horse share nothing; or n = 1 tried and failing',
        ),
        formulas: ['\\(1^2 + 1 = 2\\)', '\\(|G_1 \\cap G_2| = k - 1\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng lỗi nằm ở phát biểu chứ không phải lập luận: phát biểu sai, và ta phải chỉ ra bước nào của lập luận cho phép sai lầm lọt qua.',
            'Thinking the error is in the claim and not the argument: the claim is false, and we must point at the step of the argument that lets the mistake through.',
          ),
        ],
        hints: hints(
          'Với k nhỏ nhất, lập luận còn đúng không?',
          'Thử k = 1: hai nhóm một con có chung con nào không?',
          'Không có chung con nào, nên bước từ 1 lên 2 hỏng; với bài số, thử n = 1 và thấy cơ sở sai.',
          'For the smallest k, does the argument still work?',
          'Try k = 1: do two groups of one horse share a horse?',
          'They share none, so the step from 1 to 2 breaks; in the numeric case try n = 1 and see the base fail.',
        ),
      },
      {
        id: 'fix',
        shows: m(
          'hai ô "cơ sở" và "bước quy nạp" cùng được đánh dấu tích',
          'two boxes "base case" and "induction step" both ticked',
        ),
        formulas: ['\\(P(1)\\ \\wedge\\ \\forall k\\,(P(k) \\Rightarrow P(k + 1))\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng chỉ cần kiểm vài giá trị đầu thay cho bước quy nạp: vài giá trị đầu không chứng minh được mọi n.',
            'Thinking checking a few first values can stand in for the induction step: a few first values do not prove every n.',
          ),
        ],
        hints: hints(
          'Quy nạp đúng cần điều kiện nào?',
          'Cơ sở đúng và bước quy nạp đúng.',
          'Thiếu cơ sở hoặc bước hỏng ở một k nào đó thì phát biểu có thể sai.',
          'What does a correct induction need?',
          'A true base case and a true induction step.',
          'With the base case missing, or the step broken at some k, the claim may be false.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the smallest n at which the argument breaks. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { failAt: failAt(i.kind) };
}

const inductionFallacy: ClipModule<In> = { entry: inductionFallacyEntry, expectedDisplay };
export default inductionFallacy;
