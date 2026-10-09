import { describe, expect, it } from 'vitest';
import { extractInteractiveElements } from '@openmaic/generation';
import { buildWalkthroughHtml, htmlBytes } from '@/lib/tutor/build/build-html';
import { cspMetaTag, WALKTHROUGH_CSP } from '@/lib/tutor/build/csp';
import { escapeHtml, renderShell } from '@/lib/tutor/build/shell';
import {
  MAX_INTERACTIVE_IDS,
  WT_IDS,
  type Panel,
  type WalkthroughData,
  type WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';

const FAKE_RUNTIME = `(function(){var r=document.getElementById('wt-root');if(r){r.dataset.ready='1';}})();`;

const config: WalkthroughWidgetConfig = {
  type: 'simulation',
  kind: 'walkthrough',
  walkthroughId: 'binary-search',
  entryRev: 3,
  contentHash: '9e8d7c6b5a493827',
  subject: 'cp',
  visualizer: 'array',
  locale: 'vi-VN',
  presetId: 'mid-hit',
  panel: 'cpp',
  presets: [{ id: 'mid-hit', label: 'Trúng ở giữa', total: 2, framesHash: 'a1b2c3d4e5f60718' }],
  beats: [{ id: 'start', occurrence: 1, frame: 0 }],
  runtimeVersion: 1,
};

const data: WalkthroughData = {
  title: 'Tìm kiếm nhị phân',
  locale: 'vi-VN',
  sets: {
    'mid-hit': {
      frames: [
        { state: { values: [1, 2, 3] }, meta: { index: 0, explanation: 'a < b && c' } },
        { state: { values: [1, 2, 3] }, meta: { index: 1, explanation: 'x\u2028y\u2029z' } },
      ],
      beats: [{ id: 'start', occurrence: 1, frame: 0 }],
    },
  },
  beatText: { start: { label: 'Bắt đầu' } },
  code: {
    pseudo: ['</script><b>x</b>'],
    impl: { cpp: ['int a;'], py: ['a = 1'] },
    map: { cpp: { '1': [1] }, py: { '1': [1] } },
  },
  labels: { play: 'Phát', pause: 'Tạm dừng' },
};

const ALL_PANELS: Panel[] = ['pseudo', 'cpp', 'py'];

function shellOf(opts: { customInput?: boolean; panels?: Panel[]; title?: string } = {}) {
  return renderShell({
    title: opts.title ?? data.title,
    labels: data.labels,
    customInput: opts.customInput ?? false,
    lang: 'vi-VN',
    panels: opts.panels ?? ALL_PANELS,
  });
}

function build(opts: { customInput?: boolean; panels?: Panel[]; runtimeJs?: string } = {}) {
  return buildWalkthroughHtml({
    config,
    data,
    runtimeJs: opts.runtimeJs ?? FAKE_RUNTIME,
    shell: shellOf(opts),
  });
}

function block(html: string, id: string): string {
  const m = html.match(
    new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`),
  );
  if (!m) throw new Error(`thiếu khối ${id}`);
  return m[1];
}

function inventoryIds(html: string): string[] {
  return [...extractInteractiveElements(html).matchAll(/^#(\S+)/gm)].map((m) => m[1]);
}

describe('buildWalkthroughHtml', () => {
  it('parses both JSON blocks; widget-config has no frames', () => {
    const html = build();
    const cfg = JSON.parse(block(html, 'widget-config'));
    const dat = JSON.parse(block(html, 'walkthrough-data'));
    expect(cfg).toEqual(config);
    expect(JSON.stringify(cfg)).not.toContain('"frames"');
    expect(cfg).not.toHaveProperty('sets');
    expect(dat).toEqual(data);
    expect(dat.sets['mid-hit'].frames).toHaveLength(2);
  });

  it('orders doctype, html lang, head, body, runtime last', () => {
    const html = build();
    expect(html.startsWith('<!doctype html>\n<html lang="vi-VN">')).toBe(true);
    const at = (s: string) => html.indexOf(s);
    const order = [
      '<meta charset="utf-8">',
      'http-equiv="Content-Security-Policy"',
      'name="viewport"',
      '<style>',
      '</head>',
      '<body>',
      'id="wt-root"',
      'id="widget-config"',
      'id="walkthrough-data"',
      `<script>${FAKE_RUNTIME}</script>`,
    ].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('has CSP meta; no external script, no localStorage', () => {
    const html = build({ customInput: true });
    expect(cspMetaTag()).toContain(WALKTHROUGH_CSP);
    expect(html).toContain(cspMetaTag());
    expect(WALKTHROUGH_CSP).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'",
    );
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toContain('localStorage');
  });

  it('escapes < in JSON blocks and keeps the data round-trippable', () => {
    const html = build();
    const raw = block(html, 'walkthrough-data');
    expect(raw).not.toContain('<');
    expect(raw).toContain('\\u003c/script>\\u003cb>');
    expect(raw).not.toMatch(/[\u2028\u2029]/);
    expect(raw).toContain('x\\u2028y\\u2029z');
    expect(JSON.parse(raw).code.pseudo[0]).toBe('</script><b>x</b>');
    expect(JSON.parse(raw).sets['mid-hit'].frames[1].meta.explanation).toBe('x\u2028y\u2029z');
  });

  it('throws when runtimeJs contains </script (any case) or <!--', () => {
    for (const bad of ['a</script>b', 'a</SCRIPT >b', 'a</ScRiPt', 'var s="<!--";']) {
      expect(() => build({ runtimeJs: bad })).toThrow();
    }
    expect(() => build({ runtimeJs: 'if (a < b) {}' })).not.toThrow();
  });

  it('does not alter runtimeJs', () => {
    expect(build({ runtimeJs: 'var a = "<b>" && 1;' })).toContain(
      '<script>var a = "<b>" && 1;</script>',
    );
  });

  it('escapes html lang from config.locale', () => {
    const html = buildWalkthroughHtml({
      config: { ...config, locale: 'x"><script>' },
      data,
      runtimeJs: FAKE_RUNTIME,
      shell: shellOf(),
    });
    expect(html).toContain('<html lang="x&quot;&gt;&lt;script&gt;">');
  });
});

describe('htmlBytes', () => {
  it('counts UTF-8 bytes (Vietnamese diacritics)', () => {
    expect(htmlBytes('abc')).toBe(3);
    expect(htmlBytes('Việt')).toBe(6);
    const s = 'Tìm kiếm nhị phân – ế ệ';
    expect(htmlBytes(s)).toBe(Buffer.byteLength(s, 'utf8'));
    expect(htmlBytes(s)).toBeGreaterThan(s.length);
  });
});

describe('renderShell', () => {
  it('lists #wt-* ids to extractInteractiveElements, at most 60', () => {
    const ids = inventoryIds(build({ customInput: true }));
    expect(ids.length).toBeLessThanOrEqual(MAX_INTERACTIVE_IDS);
    expect([...ids].sort()).toEqual([...WT_IDS].sort());
  });

  it('only uses ids from WT_IDS', () => {
    const html = shellOf({ customInput: true });
    const used = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    for (const id of used) expect(WT_IDS).toContain(id);
    expect(new Set(used).size).toBe(used.length);
  });

  it('omits input controls unless customInput', () => {
    const ids = inventoryIds(build({ customInput: false }));
    for (const id of ['wt-input', 'wt-apply', 'wt-input-error']) expect(ids).not.toContain(id);
    expect(ids).toContain('wt-preset');
  });

  it('builds only the tabs in panels (Math: pseudo only)', () => {
    const ids = inventoryIds(build({ panels: ['pseudo'] }));
    expect(ids).toContain('wt-tab-pseudo');
    expect(ids).not.toContain('wt-tab-cpp');
    expect(ids).not.toContain('wt-tab-py');
    expect(ids).toContain('wt-code');
  });

  it('escapes title and labels', () => {
    const html = renderShell({
      title: '<img src=x onerror=alert(1)> & "q"',
      labels: { play: '<b>Phát</b>', prev: '"><script>' },
      customInput: false,
      lang: 'vi-VN',
      panels: ['pseudo'],
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;');
    expect(html).toContain('&lt;b&gt;Phát&lt;/b&gt;');
  });

  it('has static containers, aria-live, wt-flash CSS and logical properties', () => {
    const html = build();
    expect(html).toMatch(
      /<div id="wt-predict" role="region" aria-live="polite" aria-label="[^"]+"><\/div>/,
    );
    expect(html).toContain('<div id="wt-exercise"></div>');
    expect(html).toMatch(/<p id="wt-explanation" aria-live="polite">/);
    expect(html).toContain('.wt-flash');
    expect(html).toMatch(/padding-inline|border-inline-start|min-inline-size/);
    expect(html).not.toMatch(/margin-(left|right)|padding-(left|right)|text-align:(left|right)/);
  });

  it('sets rtl only for right-to-left languages', () => {
    const mk = (lang: string) =>
      renderShell({ title: 't', labels: {}, customInput: false, lang, panels: [] });
    expect(mk('ar-SA')).toContain('dir="rtl"');
    expect(mk('vi-VN')).toContain('dir="ltr"');
  });
});

describe('escapeHtml', () => {
  it('escapes & < > "', () => {
    expect(escapeHtml(`a&b<c>"d"`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;');
  });
});
