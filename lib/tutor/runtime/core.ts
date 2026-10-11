/**
 * Runtime lõi của widget walkthrough, chạy trong iframe null-origin (ARCHITECTURE §6–7,
 * INTERFACES §1–2, ADR 0013 quyết định 2 và 10). Không Node API, không mạng, không storage.
 * Dữ liệu động chỉ vào DOM bằng `textContent`/`setAttribute`.
 */
import { createPlayer, type PlayerState } from '@/lib/tutor/engine/player';
import {
  makeContinue,
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
import { buildPrediction, resolvePredict, type Prediction } from './predict';
import { setRichText, type MathTable } from './rich-text';

const FLASH_MS = 1500;
/** Used only when the data block itself is unreadable: no label can come from it then. */
const LOAD_ERROR_FALLBACK = 'Không tải được nội dung bài học.';

interface PresetEntry {
  id: string;
  label: string;
  total: number;
}

/** Câu hỏi dự đoán đang hiện trong `#wt-predict` (đã trả lời thì panel còn kết quả tới khi đổi frame). */
interface OpenQuestion {
  preset: string;
  index: number;
  beatId: string;
  answered: boolean;
}

const skipped = (beatId: string): Prediction => ({ beatId, correct: false, skipped: true });

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

/** The `loadError` label from `walkthrough-data` when that block still parses, else the fallback. */
function loadErrorText(doc: Document): string {
  try {
    const data: unknown = JSON.parse(doc.getElementById('walkthrough-data')?.textContent ?? '');
    const text = isRecord(data) && isRecord(data.labels) ? data.labels.loadError : undefined;
    if (typeof text === 'string' && text !== '') return text;
  } catch {
    // unreadable block: fall through to the fallback
  }
  return LOAD_ERROR_FALLBACK;
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
    refs.explanation.textContent = loadErrorText(document);
    return;
  }
  const { config, data, presets } = loaded;
  /** `\( tex \)` → server-rendered KaTeX HTML; only string values are kept (the table is data, not code) */
  const math: MathTable | undefined = isRecord(data.math)
    ? Object.fromEntries(Object.entries(data.math).filter(([, v]) => typeof v === 'string'))
    : undefined;

  // --- trạng thái ---
  let preset = config.presetId;
  let panel: Panel = refs.tabs[config.panel] ? config.panel : 'pseudo';
  let beats: BeatRef[] = [];
  let beatButtons: HTMLButtonElement[] = [];
  let shown: { preset: string; index: number } | null = null;
  let prevFrame: Frame<unknown> | undefined;
  let open: OpenQuestion | null = null;
  const pending: Prediction[] = []; // predicts that cannot be asked: reported as skipped at the next sync
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
  /** `widget-state` của frame đang hiện; chỉ message mang `prediction` thì engine mới coi là đã trả lời. */
  const postState = (prediction?: Prediction) =>
    post(
      makeState({
        walkthroughId: config.walkthroughId,
        preset,
        frame: player.getState().index,
        prediction,
      }),
    );
  // The learner moved on (Tiếp, or Phát starting playback). The host ends a prediction wait on it,
  // also on the last frame, where no frame change follows.
  const postContinue = () => post(makeContinue({ walkthroughId: config.walkthroughId }));
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
  /** Close the open question. Moving on without an answer is not a skip, so nothing is reported. */
  function closePredict(): void {
    open = null;
    if (refs.predict) {
      refs.predict.removeAttribute('data-result');
      refs.predict.replaceChildren();
    }
  }

  function showPredict(beatId: string): void {
    closePredict();
    const index = player.getState().index;
    const q = resolvePredict(beatId, beats, index, data.beatText);
    if (!q || !refs.predict) {
      pending.push(skipped(beatId)); // không hỏi được: báo bỏ qua ngay
      return;
    }
    const o: OpenQuestion = { preset, index, beatId, answered: false };
    open = o;
    renderPredict(
      refs.predict,
      q,
      {
        predict: labelOf('predict'),
        skip: labelOf('skip'),
        correct: labelOf('correct'),
        incorrect: labelOf('incorrect'),
        // a stage built before this label existed shows the check mark only
        answer: data.labels?.answer ?? '',
      },
      (chosen) => {
        // Chỉ message này mang `prediction`; `sync` không bao giờ gửi lại (engine coi mọi
        // `prediction` của beat là đã trả lời). The player stays paused until the learner moves on.
        o.answered = true;
        postState(buildPrediction(q, chosen));
      },
    );
  }

  // --- vẽ ---
  function paintFrame(index: number): void {
    const frame = data.sets[preset].frames[index];
    const meta: Record<string, unknown> = isRecord(frame?.meta) ? frame.meta : {};
    setRichText(
      refs.explanation,
      typeof meta.explanation === 'string' ? meta.explanation : '',
      math,
    );
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

  /**
   * Vẽ lại theo player; báo `widget-state` khi frame hoặc preset đổi (và `notify`), hoặc khi `force`.
   */
  function sync(notify: boolean, force = false): void {
    const s = player.getState();
    const moved = !shown || shown.preset !== preset || shown.index !== s.index;
    if (moved) {
      paintFrame(s.index);
      shown = { preset, index: s.index };
    }
    paintControls(s);
    if (open && (open.preset !== preset || open.index !== s.index)) closePredict();
    const skips = pending.splice(0);
    if (skips.length > 0) skips.forEach((p) => postState(p));
    else if ((moved && notify) || force) postState();
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
    if (!ops) {
      // preset lạ: bỏ cả message; câu hỏi kèm theo cũng không hiện được
      if (msg.state.predict) postState(skipped(msg.state.predict.beatId));
      return;
    }
    batching = true;
    try {
      for (const op of ops) applyOp(op);
      if (open && !open.answered && player.getState().isPlaying) {
        // a tick would clear the question before anyone answers it
        player.pause();
      }
    } finally {
      batching = false;
    }
    sync(true, true); // báo state cả khi frame không đổi: chat luôn có ngữ cảnh mới nhất
  }

  function announceReady(): void {
    post(
      makeReady({
        walkthroughId: config.walkthroughId,
        entryRev: config.entryRev,
        presets: presets.map((p) => ({ id: p.id, total: p.total })),
      }),
    );
    postState(); // ngay sau widget-ready để host có frame/preset hiện tại
  }

  // --- khởi tạo ---
  refs.explanation.setAttribute('aria-live', 'polite');
  try {
    visualizer.mount(refs.visualizer, { ...config, math, labels: data.labels });
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
  refs.next?.addEventListener('click', () => {
    player.step(1);
    closePredict(); // the last frame does not move, so Tiếp itself ends an open question
    postContinue();
  });
  refs.reset?.addEventListener('click', () => player.reset());
  refs.play?.addEventListener('click', () => {
    const starting = !player.getState().isPlaying;
    player.toggle();
    if (starting) postContinue(); // a pause is not a move-on
  });
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
