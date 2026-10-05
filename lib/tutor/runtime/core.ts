/**
 * Runtime lõi của widget walkthrough, chạy trong iframe null-origin (ARCHITECTURE §6–7,
 * INTERFACES §1–2, ADR 0013 quyết định 2 và 10). Không Node API, không mạng, không storage.
 * Dữ liệu động chỉ vào DOM bằng `textContent`/`setAttribute`.
 */
import { createPlayer, type PlayerState } from '@/lib/tutor/engine/player';
import {
  makeReady,
  makeState,
  parseInbound,
  planSetWidgetState,
  type InboundMessage,
  type Op,
} from '@/lib/tutor/protocol/messages';
import type {
  BeatRef,
  Frame,
  Panel,
  VisualizerRenderer,
  WalkthroughData,
  WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';
import { codeLinesFor, type CodeMap } from './code-highlight';
import { findRefs, formatCounter, isRecord, setRootState, type Refs } from './layout';
import {
  markBeats,
  markCode,
  markTabs,
  renderAux,
  renderBeats,
  renderCode,
  renderPredict,
  renderVars,
} from './panels';
import { buildPrediction, resolvePredict } from './predict';

const FLASH_MS = 1500;
const LOAD_ERROR = 'Walkthrough data could not be loaded.';

interface PresetEntry {
  id: string;
  label: string;
  total: number;
}

interface Loaded {
  config: WalkthroughWidgetConfig;
  data: WalkthroughData;
  presets: PresetEntry[];
}

/** Đọc hai khối JSON; ném lỗi nếu hỏng hoặc thiếu phần bắt buộc (caller bắt và hiện thông báo). */
function load(doc: Document): Loaded {
  const config: unknown = JSON.parse(doc.getElementById('widget-config')?.textContent ?? '');
  const data: unknown = JSON.parse(doc.getElementById('walkthrough-data')?.textContent ?? '');
  if (
    !isRecord(config) ||
    typeof config.walkthroughId !== 'string' ||
    typeof config.presetId !== 'string' ||
    !Number.isInteger(config.entryRev) ||
    !Array.isArray(config.presets) ||
    !isRecord(data) ||
    !isRecord(data.sets)
  ) {
    throw new Error('invalid walkthrough JSON');
  }
  const presets: PresetEntry[] = [];
  for (const p of config.presets) {
    if (!isRecord(p) || typeof p.id !== 'string') continue;
    const set = data.sets[p.id];
    if (isRecord(set) && Array.isArray(set.frames) && set.frames.length > 0) {
      presets.push({
        id: p.id,
        label: typeof p.label === 'string' ? p.label : p.id,
        total: set.frames.length,
      });
    }
  }
  if (!presets.some((p) => p.id === config.presetId)) throw new Error('unknown presetId');
  return {
    config: config as unknown as WalkthroughWidgetConfig,
    data: data as unknown as WalkthroughData,
    presets,
  };
}

function queryOrNull(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function boot(visualizer: VisualizerRenderer): void {
  const found = findRefs(document);
  if (!found) {
    console.error('walkthrough: missing #wt-root, #wt-explanation or #wt-visualizer');
    return;
  }
  const refs: Refs = found; // gán lại để hàm lồng bên dưới không mất kiểu non-null
  let loaded: Loaded;
  try {
    loaded = load(document);
  } catch {
    refs.explanation.textContent = LOAD_ERROR;
    return;
  }
  const { config, data, presets } = loaded;

  // --- trạng thái ---
  let preset = config.presetId;
  let panel: Panel = refs.tabs[config.panel] ? config.panel : 'pseudo';
  let beats: BeatRef[] = [];
  let beatButtons: HTMLButtonElement[] = [];
  let shown: { preset: string; index: number } | null = null;
  let prevFrame: Frame<unknown> | undefined;
  let predictAt: { preset: string; index: number } | null = null; // frame đang hiện câu hỏi
  let batching = false; // gộp nhiều op của một message thành một lần vẽ + một `widget-state`

  const player = createPlayer({ total: presets.find((p) => p.id === preset)?.total ?? 1 });

  const labelOf = (key: string) => data.labels?.[key] ?? key;
  const post = (msg: object) => {
    try {
      window.parent.postMessage(msg, '*');
    } catch {
      // không có parent để báo: bỏ qua
    }
  };
  const setCaption = (text: string) => {
    if (refs.caption) refs.caption.textContent = text;
  };

  // --- code ---
  const codeText = (p: Panel): string[] => {
    const raw = p === 'pseudo' ? data.code?.pseudo : data.code?.impl?.[p];
    return Array.isArray(raw) ? raw.map(String) : [];
  };
  const codeMap: CodeMap = isRecord(data.code?.map) ? data.code.map : {};

  function paintCode(index: number): void {
    if (!refs.codeLines) return;
    const line = data.sets[preset].frames[index]?.meta?.codeLine;
    markCode(refs.codeLines, codeLinesFor(panel, line, codeMap));
  }

  function setPanel(next: Panel): void {
    panel = refs.tabs[next] ? next : 'pseudo';
    markTabs(refs.tabs, panel);
    if (refs.codeLines) renderCode(refs.codeLines, codeText(panel));
    paintCode(player.getState().index);
  }

  // --- beat ---
  function buildBeats(): void {
    const raw = data.sets[preset].beats;
    beats = (Array.isArray(raw) ? raw : []).filter(
      (b) =>
        isRecord(b) &&
        typeof b.id === 'string' &&
        Number.isInteger(b.frame) &&
        Number.isInteger(b.occurrence),
    );
    const text = (id: string) => {
      const label = data.beatText?.[id]?.label;
      return typeof label === 'string' ? label : id;
    };
    beatButtons = refs.beats ? renderBeats(refs.beats, beats, text, (f) => player.jump(f)) : [];
  }

  // --- dự đoán ---
  function clearPredict(): void {
    predictAt = null;
    if (!refs.predict) return;
    refs.predict.removeAttribute('data-result');
    refs.predict.replaceChildren();
  }

  function showPredict(beatId: string): void {
    clearPredict();
    const index = player.getState().index;
    const q = resolvePredict(beatId, beats, index, data.beatText);
    if (!q || !refs.predict) return;
    const at = { preset, index };
    predictAt = at;
    renderPredict(
      refs.predict,
      q,
      {
        predict: labelOf('predict'),
        skip: labelOf('skip'),
        correct: labelOf('correct'),
        incorrect: labelOf('incorrect'),
      },
      (chosen) => {
        // Chỉ message này mang `prediction`; `sync` không bao giờ gửi lại (engine coi mọi
        // `prediction` của beat là đã trả lời).
        post(
          makeState({
            walkthroughId: config.walkthroughId,
            preset: at.preset,
            frame: at.index,
            prediction: buildPrediction(q, chosen),
          }),
        );
        if (chosen === null) clearPredict();
      },
    );
  }

  // --- vẽ ---
  function paintFrame(index: number): void {
    const frame = data.sets[preset].frames[index];
    const meta: Record<string, unknown> = isRecord(frame?.meta) ? frame.meta : {};
    refs.explanation.textContent = typeof meta.explanation === 'string' ? meta.explanation : '';
    if (refs.vars) renderVars(refs.vars, meta.vars);
    if (refs.aux) renderAux(refs.aux, meta.aux);
    paintCode(index);
    markBeats(beatButtons, beats, index);
    try {
      visualizer.render(frame, prevFrame);
    } catch (e) {
      console.error(e); // visualizer hỏng không được làm đứng player
    }
    prevFrame = frame;
  }

  function paintControls(s: PlayerState): void {
    const counter = formatCounter(s.index, s.total);
    if (refs.counter) refs.counter.textContent = counter;
    if (refs.slider) {
      refs.slider.max = String(s.total - 1);
      refs.slider.value = String(s.index);
      refs.slider.setAttribute('aria-valuetext', counter);
    }
    if (refs.speed) refs.speed.value = String(s.speed);
    if (refs.play) refs.play.textContent = labelOf(s.isPlaying ? 'pause' : 'play');
    setRootState(refs.root, { index: s.index, total: s.total, playing: s.isPlaying, preset });
  }

  /** Vẽ lại theo player; báo `widget-state` khi frame hoặc preset đổi (và `notify`). */
  function sync(notify: boolean): void {
    const s = player.getState();
    const moved = !shown || shown.preset !== preset || shown.index !== s.index;
    if (moved) {
      paintFrame(s.index);
      shown = { preset, index: s.index };
    }
    paintControls(s);
    if (predictAt && (predictAt.preset !== preset || predictAt.index !== s.index)) clearPredict();
    if (moved && notify) {
      post(makeState({ walkthroughId: config.walkthroughId, preset, frame: s.index }));
    }
  }

  // --- op từ planSetWidgetState ---
  function setPreset(id: string): void {
    if (id === preset) return; // cùng preset: không được dừng player
    preset = id;
    prevFrame = undefined; // frame của preset khác không dùng làm `prev`
    buildBeats();
    if (refs.preset) refs.preset.value = id;
    player.setTotal(presets.find((p) => p.id === id)?.total ?? 1);
  }

  function applyOp(op: Op): void {
    switch (op.op) {
      case 'preset':
        setPreset(op.preset);
        break;
      case 'frame':
        player.jump(op.frame);
        break;
      case 'panel':
        setPanel(op.panel);
        break;
      case 'speed':
        player.setSpeed(op.speed);
        break;
      case 'playing':
        if (op.playing) player.play({ restart: op.restart });
        else player.pause();
        break;
      case 'caption':
        setCaption(op.content);
        break;
      case 'predict':
        showPredict(op.beatId);
        break;
    }
  }

  const flashTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  function flash(target: string): void {
    const el = queryOrNull(target);
    if (!el) return;
    clearTimeout(flashTimers.get(el));
    el.classList.add('wt-flash');
    flashTimers.set(
      el,
      setTimeout(() => el.classList.remove('wt-flash'), FLASH_MS),
    );
  }

  function handle(msg: InboundMessage): void {
    if (msg.type === 'HIGHLIGHT_ELEMENT') {
      if (msg.content !== undefined) setCaption(msg.content);
      flash(msg.target);
      return;
    }
    const ops = planSetWidgetState(msg, presets, preset);
    if (!ops) return; // preset lạ: bỏ cả message
    batching = true;
    try {
      for (const op of ops) applyOp(op);
    } finally {
      batching = false;
    }
    sync(true);
  }

  function announceReady(): void {
    post(
      makeReady({
        walkthroughId: config.walkthroughId,
        entryRev: config.entryRev,
        presets: presets.map((p) => ({ id: p.id, total: p.total })),
      }),
    );
  }

  // --- khởi tạo ---
  refs.explanation.setAttribute('aria-live', 'polite');
  try {
    visualizer.mount(refs.visualizer, config);
  } catch (e) {
    console.error(e);
  }
  player.subscribe(() => {
    if (!batching) sync(true);
  });

  if (refs.preset) {
    for (const p of presets) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.label;
      refs.preset.appendChild(option);
    }
    refs.preset.value = preset;
    refs.preset.addEventListener('change', () => {
      if (refs.preset) {
        handle({ type: 'SET_WIDGET_STATE', state: { preset: refs.preset.value } });
      }
    });
  }
  for (const [p, tab] of Object.entries(refs.tabs)) {
    tab?.addEventListener('click', () => setPanel(p as Panel));
  }
  refs.prev?.addEventListener('click', () => player.step(-1));
  refs.next?.addEventListener('click', () => player.step(1));
  refs.reset?.addEventListener('click', () => player.reset());
  refs.play?.addEventListener('click', () => player.toggle());
  refs.speed?.addEventListener('input', () => player.setSpeed(Number(refs.speed?.value)));
  refs.slider?.addEventListener('input', () => player.jump(Number(refs.slider?.value)));

  buildBeats();
  setPanel(panel);
  sync(false);

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (isRecord(event.data) && event.data.__maicErrorReplayRequest === true) {
      announceReady(); // host gắn listener muộn: báo lại để nhận state mong muốn
      return;
    }
    const msg = parseInbound(event.data);
    if (!msg) return;
    try {
      handle(msg);
    } catch (e) {
      console.error(e); // thông điệp xấu không được ném lỗi ra ngoài
    }
  });

  announceReady();
}

/** Điểm vào của mỗi entry visualizer (`lib/tutor/runtime/entries/<v>.ts`). */
export function startWalkthroughRuntime(visualizer: VisualizerRenderer): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(visualizer), { once: true });
  } else {
    boot(visualizer);
  }
}
