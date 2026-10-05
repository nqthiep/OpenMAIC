/**
 * Panel của widget: bảng biến, panel phụ, nút beat, dòng code, tab code (ARCHITECTURE §6, §8).
 * Chỉ dùng `textContent`/`setAttribute`/`createElement`: không `innerHTML` với dữ liệu.
 * Class `wt-on` đánh dấu dòng code / nút beat đang chọn (CSS ở `build/shell.ts`).
 */
import type { BeatRef, Panel } from '@/lib/tutor/protocol/widget-data';
import { isRecord } from './layout';

/** `#wt-vars` là `<table>` trong shell; nếu là phần tử khác thì dựng bảng bên trong. */
export function renderVars(el: HTMLElement, vars: unknown): void {
  const doc = el.ownerDocument;
  const body = doc.createElement('tbody');
  if (isRecord(vars)) {
    for (const [name, value] of Object.entries(vars)) {
      const row = doc.createElement('tr');
      const th = doc.createElement('th');
      th.setAttribute('scope', 'row');
      th.textContent = name;
      const td = doc.createElement('td');
      td.textContent = String(value);
      row.append(th, td);
      body.appendChild(row);
    }
  }
  if (body.childElementCount === 0) {
    el.replaceChildren(); // rỗng: shell ẩn bằng :empty
  } else if (el.tagName === 'TABLE') {
    el.replaceChildren(body);
  } else {
    const table = doc.createElement('table');
    table.appendChild(body);
    el.replaceChildren(table);
  }
}

/** `aux`: `{ id, label, items }[]` (heap Dijkstra, stack Tarjan, queue BFS, mảng failure KMP…). */
export function renderAux(el: HTMLElement, aux: unknown): void {
  const doc = el.ownerDocument;
  const blocks: HTMLElement[] = [];
  if (Array.isArray(aux)) {
    for (const a of aux) {
      if (!isRecord(a) || !Array.isArray(a.items)) continue;
      const box = doc.createElement('div');
      box.className = 'wt-aux-item';
      box.setAttribute('data-aux', String(a.id));
      const label = doc.createElement('strong');
      label.textContent = String(a.label ?? a.id);
      const list = doc.createElement('ul');
      for (const item of a.items) {
        const li = doc.createElement('li');
        li.textContent = String(item);
        list.appendChild(li);
      }
      box.append(label, list);
      blocks.push(box);
    }
  }
  el.replaceChildren(...blocks);
}

/** Một `<button data-beat>` cho mỗi beat; beat lặp (`occurrence > 1`) thêm số lần vào nhãn. */
export function renderBeats(
  el: HTMLElement,
  beats: readonly BeatRef[],
  labelOf: (beatId: string) => string,
  onJump: (frame: number) => void,
): HTMLButtonElement[] {
  const doc = el.ownerDocument;
  const buttons = beats.map((b) => {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-beat', b.id);
    btn.setAttribute('data-occurrence', String(b.occurrence));
    const label = labelOf(b.id);
    btn.textContent = b.occurrence > 1 ? `${label} (${b.occurrence})` : label;
    btn.addEventListener('click', () => onJump(b.frame));
    return btn;
  });
  el.replaceChildren(...buttons);
  return buttons;
}

/** Beat đang chọn = beat có `frame` lớn nhất mà ≤ `index` (hoà: beat sau). */
export function markBeats(
  buttons: readonly HTMLElement[],
  beats: readonly BeatRef[],
  index: number,
): void {
  let active = -1;
  beats.forEach((b, i) => {
    if (b.frame <= index && (active < 0 || b.frame >= beats[active].frame)) active = i;
  });
  buttons.forEach((btn, i) => {
    btn.classList.toggle('wt-on', i === active);
    if (i === active) btn.setAttribute('aria-current', 'step');
    else btn.removeAttribute('aria-current');
  });
}

/** Dựng dòng code của tab hiện tại; `data-line` 1-based, không id từng dòng. */
export function renderCode(host: HTMLElement, lines: readonly string[]): void {
  const doc = host.ownerDocument;
  host.replaceChildren(
    ...lines.map((text, i) => {
      const div = doc.createElement('div');
      div.setAttribute('data-line', String(i + 1));
      div.textContent = text === '' ? ' ' : text; // dòng trống vẫn giữ chiều cao
      return div;
    }),
  );
}

export function markCode(host: HTMLElement, active: readonly number[]): void {
  const on = new Set(active.map(String));
  for (const line of Array.from(host.children)) {
    const hit = on.has(line.getAttribute('data-line') ?? '');
    line.classList.toggle('wt-on', hit);
    if (hit) line.setAttribute('aria-current', 'true');
    else line.removeAttribute('aria-current');
  }
}

export function markTabs(tabs: Partial<Record<Panel, HTMLElement>>, panel: Panel): void {
  for (const [p, tab] of Object.entries(tabs)) {
    tab?.setAttribute('aria-pressed', String(p === panel));
  }
}

export interface PredictLabels {
  predict: string;
  skip: string;
  correct: string;
  incorrect: string;
}

/**
 * Câu hỏi dự đoán trong `#wt-predict`: đề, các nút chọn (`<button data-option>`, dùng được bằng
 * bàn phím) và "Bỏ qua". `onPick(i | null)` được gọi tối đa một lần; sau đó nút bị khoá, nút đúng
 * có `wt-on`, nút đã chọn `aria-pressed`, kết quả hiện ở `<p role="status">` (bỏ qua: xoá panel).
 */
export function renderPredict(
  el: HTMLElement,
  q: { ask: string; options: readonly string[]; answer: number },
  labels: PredictLabels,
  onPick: (chosen: number | null) => void,
): void {
  const doc = el.ownerDocument;
  const ask = doc.createElement('p');
  ask.className = 'wt-predict-ask';
  ask.textContent = q.ask;
  const group = doc.createElement('div');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', labels.predict);
  group.className = 'wt-predict-options';
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  status.className = 'wt-predict-result';
  const skip = doc.createElement('button');
  skip.type = 'button';
  skip.setAttribute('data-predict-skip', '');
  skip.textContent = labels.skip;

  const buttons = q.options.map((text, i) => {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-option', String(i));
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = text;
    return btn;
  });
  let done = false;
  const finish = (chosen: number | null) => {
    if (done) return;
    done = true;
    if (chosen === null) {
      el.replaceChildren();
    } else {
      const hit = chosen === q.answer;
      for (const b of [...buttons, skip]) b.disabled = true;
      buttons[chosen].setAttribute('aria-pressed', 'true');
      buttons[q.answer].classList.add('wt-on');
      el.setAttribute('data-result', hit ? 'correct' : 'incorrect');
      status.textContent = hit ? labels.correct : labels.incorrect;
    }
    onPick(chosen);
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => finish(i)));
  skip.addEventListener('click', () => finish(null));

  group.append(...buttons, skip);
  el.removeAttribute('data-result');
  el.replaceChildren(ask, group, status);
}
