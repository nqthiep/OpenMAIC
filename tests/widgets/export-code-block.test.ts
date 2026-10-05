import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildResourcePackZip, interactiveExportHtml } from '@/lib/export/use-export-pptx';
import type { Scene } from '@/lib/types/stage';

const HTML = '<!DOCTYPE html><html><body><script>run()</script><h1>Editor</h1></body></html>';
const code = { type: 'interactive', widgetType: 'code', html: HTML };
const codeViaConfig = { type: 'interactive', widgetConfig: { type: 'code' }, html: HTML };
const plain = { type: 'interactive', html: HTML };
const sim = { type: 'interactive', widgetType: 'simulation', html: HTML };

describe('interactiveExportHtml', () => {
  it('replaces code widget HTML with a static notice when flag is false or unknown', () => {
    for (const allowed of [false, undefined]) {
      for (const content of [code, codeViaConfig]) {
        const out = interactiveExportHtml(content, allowed);
        expect(out).not.toBe(HTML);
        expect(out).not.toContain('Editor');
        expect(out.toLowerCase()).not.toContain('<script');
      }
    }
  });
  it('keeps code widget HTML when allowed', () => {
    expect(interactiveExportHtml(code, true)).toBe(HTML);
  });
  it('keeps other widgets even when flag unknown', () => {
    expect(interactiveExportHtml(sim, undefined)).toBe(HTML);
    expect(interactiveExportHtml(plain, false)).toBe(HTML);
  });
});

function scene(content: unknown): Scene {
  return {
    id: 's1',
    stageId: 'stg1',
    title: 'Demo',
    order: 1,
    type: 'interactive',
    content,
  } as unknown as Scene;
}

async function zipHtml(content: unknown, codeAllowed?: boolean): Promise<string> {
  const result = await buildResourcePackZip([scene(content)], [], [], {
    viewportRatio: 0.5625,
    viewportSize: 960,
    ratioPx2Inch: 96,
    ratioPx2Pt: 96 / 72,
    fileName: 'demo',
    getPptxBlob: async () => new Blob(['pptx']),
    codeAllowed,
  });
  const zip = await JSZip.loadAsync(await result.blob!.arrayBuffer());
  const name = Object.keys(zip.files).find(
    (n) => n.startsWith('interactive/') && !zip.files[n].dir,
  )!;
  return new TextDecoder().decode(await zip.files[name].async('uint8array'));
}

describe('buildResourcePackZip code widget', () => {
  it('writes the static notice, not the widget HTML, when blocked', async () => {
    for (const allowed of [undefined, false]) {
      const html = await zipHtml(code, allowed);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).not.toContain('Editor');
      expect(html.toLowerCase()).not.toContain('<script');
    }
  });
  it('writes the original HTML when allowed or not a code widget', async () => {
    expect(await zipHtml(code, true)).toBe(HTML);
    expect(await zipHtml(sim, undefined)).toBe(HTML);
  });
});
