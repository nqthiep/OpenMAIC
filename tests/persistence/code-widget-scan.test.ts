import { describe, expect, it } from 'vitest';
import { countCodeWidgetScenes } from '@/app/api/persistence/[...path]/route';

const scene = (content: unknown) => ({ id: 's', content });

describe('countCodeWidgetScenes (code-widget-stored log)', () => {
  it('counts code scenes in a document and in a single scene body', () => {
    const doc = {
      scenes: [
        scene({ type: 'interactive', widgetType: 'code' }),
        scene({ type: 'interactive', widgetConfig: { type: 'code' } }),
        scene({ type: 'interactive', widgetType: 'simulation' }),
      ],
    };
    expect(countCodeWidgetScenes(JSON.stringify(doc))).toBe(2);
    expect(
      countCodeWidgetScenes(JSON.stringify(scene({ type: 'interactive', widgetType: 'code' }))),
    ).toBe(1);
  });

  it('skips the JSON parse when the text cannot name a code widget', () => {
    expect(countCodeWidgetScenes('not json at all')).toBe(0);
    expect(countCodeWidgetScenes(JSON.stringify({ scenes: [scene({ type: 'slide' })] }))).toBe(0);
  });
});
