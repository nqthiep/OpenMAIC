import { describe, expect, it } from 'vitest';
import { buildWalkthroughHtml } from '@/lib/tutor/build/build-html';
import {
  MAX_FORMULAS,
  MAX_TEX_CHARS,
  buildMathTable,
  katexCss,
  renderMathSegments,
  renderTex,
} from '@/lib/tutor/build/katex';
import { renderShell } from '@/lib/tutor/build/shell';
import { createWalkthroughProvider, getTutorLabels } from '@/lib/tutor/provider';
import type { Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { InteractiveContent } from '@openmaic/dsl';
import { binarySearchEntry } from '@/lib/subjects/cp/catalog/binary-search';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';

describe('renderTex', () => {
  it('renders a formula to KaTeX html with a MathML twin', () => {
    const html = renderTex('x^2+y^2=z^2')!;
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-mathml');
    expect(html).not.toContain('<script');
  });

  it('is deterministic', () => {
    expect(renderTex('\\frac{a}{b}')).toBe(renderTex('\\frac{a}{b}'));
  });

  it('returns null for invalid TeX and for an over-long formula', () => {
    expect(renderTex('\\frac{')).toBeNull();
    expect(renderTex('x'.repeat(MAX_TEX_CHARS + 1))).toBeNull();
  });

  it('trust: false turns links and images into plain red text, never an anchor, an image or a url', () => {
    for (const tex of [
      '\\href{javascript:alert(1)}{x}',
      '\\url{http://evil/}',
      '\\includegraphics{http://evil/x.png}',
      '\\htmlClass{evil}{x}',
    ]) {
      // the TeX source stays inert text inside <annotation>; everything else must be free of links and images
      const html = (renderTex(tex) ?? '').replace(/<annotation[\s\S]*?<\/annotation>/g, '');
      expect(html, tex).not.toMatch(/<a[\s>]|<img|href=|src=|javascript:/i);
    }
  });

  it('a macro bomb is stopped by maxExpand', () => {
    expect(renderTex('\\def\\a{\\a\\a}\\a')).toBeNull();
  });
});

describe('renderMathSegments / buildMathTable', () => {
  it('keeps the plain text and renders each formula part', () => {
    const segs = renderMathSegments('Với \\(a>0\\) thì \\(\\frac{a}{2}>0\\).');
    expect(segs.map((s) => s.tex)).toEqual([null, 'a>0', null, '\\frac{a}{2}>0', null]);
    expect(segs[1].html).toContain('katex');
  });

  it('a formula that cannot be rendered stays source text', () => {
    const segs = renderMathSegments('x \\(\\frac{\\) y');
    expect(segs.every((s) => s.tex === null)).toBe(true);
    expect(segs.map((s) => s.text).join('')).toBe('x \\(\\frac{\\) y');
  });

  it('collects each distinct formula once, from any depth of strings, skipping the broken ones', () => {
    const table = buildMathTable([
      'a \\(x^2\\) b',
      { nodes: [{ text: '\\(x^2\\) again' }, { text: '\\(y\\)' }, { text: '\\(\\frac{\\)' }] },
      42,
      null,
    ]);
    expect(Object.keys(table).sort()).toEqual(['x^2', 'y']);
  });

  it('is empty when there is no formula, and caps the number of formulas', () => {
    expect(buildMathTable(['plain', { a: 'text' }])).toEqual({});
    const many = Array.from({ length: MAX_FORMULAS + 1 }, (_, i) => `\\(x_{${i}}\\)`);
    expect(() => buildMathTable(many)).toThrow('too-many-formulas');
  });
});

describe('katexCss', () => {
  const css = katexCss();

  it('inlines fonts as data URIs only: no network url, no file url', () => {
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).not.toMatch(/url\((?!data:)/);
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).toContain('.katex');
  });

  it('stays within the 300 KB budget of spike Q8', () => {
    expect(Buffer.byteLength(css)).toBeLessThanOrEqual(300 * 1024);
  });
});

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** A one-frame-per-step entry whose explanations hold formulas (or none). */
function fake(withMath: boolean, visualizer = 'array'): AnyWalkthroughEntry {
  const text = (tex: string) =>
    withMath ? m(`Ta có \\(${tex}\\).`, `We have \\(${tex}\\).`) : m('Một bước.', 'A step.');
  const entry: WalkthroughEntry<{ n: number }, { values: number[]; mode: 'cells' }> = {
    id: 'math-fake',
    entryRev: 1,
    subject: 'math',
    visualizer,
    curriculumTopics: ['t-fake'],
    title: m('Thử công thức', 'Formula test'),
    code: {
      pseudo: ['a'],
      impl: { cpp: [], py: [] },
      map: { cpp: { 1: [] }, py: { 1: [] } },
    },
    inputSpec: { kind: 'record', fields: { n: { kind: 'int', range: [1, 5] } } },
    customInput: false,
    presets: [{ id: 'p', label: m('P', 'P'), input: { n: 2 } }],
    beatDefs: [
      {
        id: 'start',
        required: true,
        label: m('Đầu', 'Start'),
        narration: m('Bắt đầu.', 'Begin.'),
        hints: [m('a', 'a'), m('b', 'b'), m('c', 'c')],
      },
      {
        id: 'done',
        required: true,
        label: m('Cuối', 'End'),
        narration: m('Xong.', 'Done.'),
        hints: [m('a', 'a'), m('b', 'b'), m('c', 'c')],
      },
    ],
    maxFrames: 10,
    maxBytes: 600_000,
    run(input, emit, _tick, ctx) {
      const s = { values: [1, 2, input.n], mode: 'cells' as const };
      emit(s, {
        explanation: msg0(text('a^2+b^2=c^2'), ctx.locale),
        codeLine: 1,
        tags: ['beat:start'],
      });
      emit(s, {
        explanation: msg0(text('\\frac{1}{2}'), ctx.locale),
        codeLine: 1,
        tags: ['beat:done'],
      });
    },
  };
  return entry as unknown as AnyWalkthroughEntry;
}
const msg0 = (mm: Messages, locale: string) => mm[locale] ?? mm['en-US'];

function build(entry: AnyWalkthroughEntry, locale = 'vi-VN') {
  const provider = createWalkthroughProvider({
    findWalkthrough: () => entry,
    getLabels: getTutorLabels,
  });
  const content = provider.build({ id: entry.id }, { locale }).content as InteractiveContent;
  const html = content.html as string;
  const data = JSON.parse(html.match(/id="walkthrough-data">([\s\S]*?)<\/script>/)![1]);
  return { html, data };
}

describe('walkthrough page with formulas', () => {
  it('adds the math table and the KaTeX css only when a formula exists', () => {
    const yes = build(fake(true));
    expect(Object.keys(yes.data.math).sort()).toEqual(['\\frac{1}{2}', 'a^2+b^2=c^2']);
    expect(yes.html).toContain('data:font/woff2;base64,');
    expect(yes.html).toContain('.katex');
    const no = build(fake(false));
    expect(no.data.math).toBeUndefined();
    expect(no.html).not.toContain('katex');
    expect(no.html).not.toContain('data:font');
  });

  it('an existing catalog entry gets no math table and no KaTeX css (page unchanged)', () => {
    const { html, data } = build(binarySearchEntry as AnyWalkthroughEntry);
    expect(data.math).toBeUndefined();
    expect(html).not.toMatch(/katex|data:font/);
  });

  it('keeps the CSP: no external script or stylesheet, no remote font', () => {
    const { html } = build(fake(true));
    expect(html).toContain('Content-Security-Policy');
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toMatch(/<link\b/i);
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((x) => x[1]).join('\n');
    expect(styles).not.toMatch(/@import|url\((?!data:)/); // the page's own CSS (not the runtime script) loads nothing
  });

  it('the page is deterministic', () => {
    expect(build(fake(true)).html).toBe(build(fake(true)).html);
  });

  it('proofOutline pages carry the proof labels, others do not', () => {
    expect(build(fake(true, 'proofOutline')).data.labels['proof.therefore']).toBeTruthy();
    expect(build(fake(true, 'array')).data.labels['proof.therefore']).toBeUndefined();
  });

  it('buildWalkthroughHtml emits extraCss as a second style block and nothing without it', () => {
    const base = {
      config: {} as never,
      data: {
        title: 't',
        locale: 'en-US',
        sets: {},
        beatText: {},
        code: { pseudo: [], impl: { cpp: [], py: [] }, map: { cpp: {}, py: {} } },
        labels: {},
      } as never,
      runtimeJs: '1',
      shell: renderShell({
        title: 't',
        labels: {},
        customInput: false,
        lang: 'en-US',
        panels: ['pseudo'],
      }),
    };
    expect(
      buildWalkthroughHtml({ ...base, config: { locale: 'en-US' } as never }).match(/<style>/g),
    ).toHaveLength(1);
    expect(
      buildWalkthroughHtml({
        ...base,
        config: { locale: 'en-US' } as never,
        extraCss: '.k{}',
      }).match(/<style>/g),
    ).toHaveLength(2);
  });
});
