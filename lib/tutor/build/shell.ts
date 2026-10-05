/**
 * Shell tĩnh của widget walkthrough (ARCHITECTURE §6): DOM + CSS inline.
 * Chỉ dùng id trong WT_IDS; mọi chữ qua `escapeHtml`. Runtime điền nội dung bằng textContent.
 *
 * Hợp đồng với runtime/visualizer (class do CSS ở đây định nghĩa):
 * - `wt-on`: dòng code (`[data-line]`) hoặc nút beat đang chọn; tab code đang chọn dùng `aria-pressed="true"`.
 * - `wt-flash`: nháy khi HIGHLIGHT_ELEMENT; `wt-hl-active|compare|result|visited|muted` tô nền/`fill`.
 * - Dòng code được runtime dựng trong `.wt-code-lines` (không có id từng dòng).
 */
import type { Panel } from '@/lib/tutor/protocol/widget-data';

export interface ShellOptions {
  title: string;
  /** Nhãn điều khiển (`walkthrough-data.labels`); thiếu khoá thì hiện chính khoá. */
  labels: Record<string, string>;
  customInput: boolean;
  lang: string;
  panels: Panel[];
}

const PANEL_ORDER: readonly Panel[] = ['pseudo', 'cpp', 'py'];
const RTL_LANG = /^(ar|fa|he|ur)(-|$)/i;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const SHELL_CSS = `
:root{--wt-bg:#fff;--wt-fg:#1f2937;--wt-mut:#6b7280;--wt-bd:#d1d5db;--wt-acc:#2563eb;--wt-on:#dbeafe;--wt-cmp:#fde68a;--wt-res:#bbf7d0;--wt-vis:#e5e7eb;--wt-err:#dc2626}
@media (prefers-color-scheme:dark){:root{--wt-bg:#111827;--wt-fg:#e5e7eb;--wt-mut:#9ca3af;--wt-bd:#374151;--wt-acc:#60a5fa;--wt-on:#1e3a8a;--wt-cmp:#854d0e;--wt-res:#166534;--wt-vis:#374151;--wt-err:#f87171}}
*{box-sizing:border-box}
body{margin:0;background:var(--wt-bg);color:var(--wt-fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
#wt-root{display:grid;gap:12px;padding:12px}
#wt-root>*{min-inline-size:0}
#wt-title{margin:0;font-size:18px}
#wt-explanation{margin:0;min-block-size:3em}
#wt-caption{margin:0;color:var(--wt-mut);font-style:italic}
#wt-beats{display:flex;flex-wrap:wrap;gap:6px}
.wt-main{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:12px;align-items:start}
.wt-side{display:grid;gap:12px;min-inline-size:0}
@media (max-width:640px){.wt-main{grid-template-columns:minmax(0,1fr)}}
#wt-visualizer{min-block-size:160px;overflow:auto}
#wt-vars{border-collapse:collapse;inline-size:100%}
#wt-vars th,#wt-vars td{border:1px solid var(--wt-bd);padding:2px 8px;text-align:start}
#wt-aux{display:grid;gap:4px}
#wt-vars:empty,#wt-aux:empty,#wt-beats:empty,#wt-predict:empty,#wt-exercise:empty,#wt-caption:empty,#wt-input-error:empty{display:none}
#wt-code{border:1px solid var(--wt-bd);border-radius:6px;overflow:hidden}
.wt-tabs{display:flex;gap:4px;padding:4px;border-block-end:1px solid var(--wt-bd)}
.wt-tabs:empty{display:none}
.wt-code-lines{padding-block:4px;overflow:auto;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
[data-line]{display:block;padding-inline:8px;border-inline-start:3px solid transparent;white-space:pre;transition:background-color .2s,border-color .2s}
[data-line].wt-on{background:var(--wt-on);border-inline-start-color:var(--wt-acc)}
button,select,input[type=text]{font:inherit;color:inherit;background:transparent;border:1px solid var(--wt-bd);border-radius:6px;padding:4px 10px}
button{cursor:pointer}
button.wt-on,button[aria-pressed=true]{background:var(--wt-on);border-color:var(--wt-acc)}
#wt-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wt-field{display:inline-flex;align-items:center;gap:6px}
#wt-frame-slider{flex:1 1 120px;min-inline-size:80px}
#wt-frame-counter{min-inline-size:5em;text-align:end;font-variant-numeric:tabular-nums}
.wt-input-row{display:flex;flex-wrap:wrap;flex-basis:100%;gap:8px;align-items:center}
#wt-input{flex:1 1 160px;min-inline-size:0}
#wt-input-error{margin:0;flex-basis:100%;color:var(--wt-err)}
.wt-hl-active{background:var(--wt-on);fill:var(--wt-on)}
.wt-hl-compare{background:var(--wt-cmp);fill:var(--wt-cmp)}
.wt-hl-result{background:var(--wt-res);fill:var(--wt-res)}
.wt-hl-visited{background:var(--wt-vis);fill:var(--wt-vis)}
.wt-hl-muted{opacity:.45}
.wt-hl-active,.wt-hl-compare,.wt-hl-result,.wt-hl-visited,.wt-hl-muted{transition:background-color .3s,fill .3s,opacity .3s}
:where(#wt-root,#wt-root *){outline:2px solid transparent;outline-offset:2px;transition:outline-color .3s}
:focus-visible,.wt-flash{outline-color:var(--wt-acc)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`.trim();

export function renderShell(o: ShellOptions): string {
  const L = (key: string) => escapeHtml(o.labels[key] ?? key);
  const tabs = PANEL_ORDER.filter((p) => o.panels.includes(p))
    .map((p) => `<button id="wt-tab-${p}" type="button" aria-pressed="false">${L(p)}</button>`)
    .join('');
  const input = o.customInput
    ? `<div class="wt-input-row"><input id="wt-input" type="text" autocomplete="off" spellcheck="false" aria-label="${L('input')}" aria-describedby="wt-input-error"><button id="wt-apply" type="button">${L('apply')}</button><p id="wt-input-error" role="alert"></p></div>`
    : '';
  const dir = RTL_LANG.test(o.lang) ? 'rtl' : 'ltr';

  return [
    `<div id="wt-root" lang="${escapeHtml(o.lang)}" dir="${dir}" data-frame-index="0" data-total-frames="0" data-playing="false" data-preset="">`,
    `<h1 id="wt-title">${escapeHtml(o.title)}</h1>`,
    `<p id="wt-explanation" aria-live="polite"></p>`,
    `<div id="wt-beats" role="group" aria-label="${L('beats')}"></div>`,
    `<div class="wt-main">`,
    `<div id="wt-visualizer"></div>`,
    `<div class="wt-side">`,
    `<table id="wt-vars" aria-label="${L('vars')}"></table>`,
    `<div id="wt-aux" role="group" aria-label="${L('aux')}"></div>`,
    `<div id="wt-code" dir="ltr" role="group" aria-label="${L('code')}"><div class="wt-tabs">${tabs}</div><div class="wt-code-lines"></div></div>`,
    `</div>`,
    `</div>`,
    `<div id="wt-predict"></div>`,
    `<div id="wt-exercise"></div>`,
    `<p id="wt-caption" aria-live="polite"></p>`,
    `<div id="wt-controls" role="group" aria-label="${L('controls')}">`,
    `<button id="wt-prev" type="button">${L('prev')}</button>`,
    `<button id="wt-play" type="button">${L('play')}</button>`,
    `<button id="wt-next" type="button">${L('next')}</button>`,
    `<button id="wt-reset" type="button">${L('reset')}</button>`,
    `<label class="wt-field">${L('speed')}<input id="wt-speed" type="range" min="0.25" max="2" step="0.25" value="1"></label>`,
    `<input id="wt-frame-slider" type="range" min="0" max="0" step="1" value="0" aria-label="${L('frame')}">`,
    `<span id="wt-frame-counter"></span>`,
    `<label class="wt-field">${L('preset')}<select id="wt-preset"></select></label>`,
    input,
    `</div>`,
    `</div>`,
  ].join('\n');
}
