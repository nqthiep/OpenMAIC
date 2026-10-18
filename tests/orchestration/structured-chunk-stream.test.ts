import { describe, expect, test } from 'vitest';
import {
  createParserState,
  finalizeParser,
  parseStructuredChunk,
} from '@/lib/orchestration/stateless-generate';

const OUTPUT = JSON.stringify([
  { type: 'action', name: 'wb_open', params: {} },
  {
    type: 'action',
    name: 'wb_draw_latex',
    params: { latex: '\\frac{2}{5} < \\frac{4}{5}', x: 100, y: 80 },
  },
  { type: 'text', content: 'Cùng mẫu số {5}, so sánh tử số.' },
  { type: 'action', name: 'wb_draw_text', params: { content: 'a [b] {c}', x: 1, y: 2 } },
]);

/** Feeds the output cut at `cut`, then the rest, and returns every action the parser emitted. */
function actionsWhenCutAt(cut: number) {
  const state = createParserState();
  const first = parseStructuredChunk(OUTPUT.slice(0, cut), state);
  const rest = parseStructuredChunk(OUTPUT.slice(cut), state);
  const end = finalizeParser(state);
  return [...first.actions, ...rest.actions, ...end.actions].map((a) => ({
    name: a.actionName,
    params: a.params,
  }));
}

describe('parseStructuredChunk on a stream cut anywhere', () => {
  test('never emits a half-streamed action (red "\\frac" on the whiteboard)', () => {
    const expected = JSON.parse(OUTPUT)
      .filter((item: { type: string }) => item.type === 'action')
      .map((item: { name: string; params: unknown }) => ({ name: item.name, params: item.params }));
    for (let cut = 1; cut < OUTPUT.length; cut++) {
      expect(actionsWhenCutAt(cut), `cut at ${cut}: …${OUTPUT.slice(cut - 20, cut)}`).toEqual(
        expected,
      );
    }
  });
});
