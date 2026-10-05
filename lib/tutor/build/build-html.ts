/**
 * Dựng HTML tự chứa của walkthrough (ARCHITECTURE §6, DATA-MODEL §3).
 * Thứ tự: doctype, head (charset, CSP, viewport, style), body (shell, 2 khối JSON, runtime).
 */
import type { WalkthroughData, WalkthroughWidgetConfig } from '@/lib/tutor/protocol/widget-data';
import { cspMetaTag } from './csp';
import { escapeHtml, SHELL_CSS } from './shell';

export interface BuildWalkthroughInput {
  config: WalkthroughWidgetConfig;
  data: WalkthroughData;
  /** IIFE đã bundle (core + đúng 1 visualizer). Builder không sửa JS. */
  runtimeJs: string;
  /** Kết quả `renderShell(...)`. */
  shell: string;
}

/** Nhúng được vào `<script type="application/json">`: thoát `<` và hai dấu ngắt dòng của JS. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
}

export function buildWalkthroughHtml({
  config,
  data,
  runtimeJs,
  shell,
}: BuildWalkthroughInput): string {
  if (/<\/script/i.test(runtimeJs) || runtimeJs.includes('<!--')) {
    throw new Error('runtimeJs chứa "</script" hoặc "<!--": không thể nhúng vào <script> an toàn');
  }
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(config.locale)}">`,
    '<head>',
    '<meta charset="utf-8">',
    cspMetaTag(),
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${SHELL_CSS}</style>`,
    '</head>',
    '<body>',
    shell,
    `<script type="application/json" id="widget-config">${jsonForScript(config)}</script>`,
    `<script type="application/json" id="walkthrough-data">${jsonForScript(data)}</script>`,
    `<script>${runtimeJs}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

/** Số byte UTF-8 của HTML (so với `maxBytes` của entry). */
export function htmlBytes(html: string): number {
  return new TextEncoder().encode(html).length;
}
