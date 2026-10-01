import { describe, expect, it } from 'vitest';
import {
  CODE_WIDGET_HINT,
  assertScenePolicy,
  coerceCodeWidgetType,
  isCodeWidget,
  isWalkthroughContent,
  isWalkthroughScene,
} from '@/lib/widgets/policy';

const byType = { type: 'interactive', widgetType: 'code' };
const byConfig = { type: 'interactive', widgetConfig: { type: 'code' } };
const other = { type: 'interactive', widgetType: 'simulation' };
const walk = { type: 'interactive', widgetConfig: { kind: 'walkthrough' } };

describe('policy', () => {
  it('detects code via both fields', () => {
    expect(isCodeWidget(byType)).toBe(true);
    expect(isCodeWidget(byConfig)).toBe(true);
    expect(isCodeWidget(other)).toBe(false);
    expect(isCodeWidget({ type: 'slide', widgetType: 'code' })).toBe(false);
  });
  it('detects walkthrough', () => {
    expect(isWalkthroughContent(walk)).toBe(true);
    expect(isWalkthroughScene({ content: walk })).toBe(true);
    expect(isWalkthroughContent(other)).toBe(false);
  });
  it('assertScenePolicy blocks unless allowed', () => {
    expect(assertScenePolicy({ content: byType }, { codeAllowed: false })).toEqual({
      error: 'code-widget-blocked',
      hint: CODE_WIDGET_HINT,
    });
    expect(assertScenePolicy({ content: byType }, { codeAllowed: true })).toBeNull();
    expect(assertScenePolicy({ content: other }, { codeAllowed: false })).toBeNull();
  });
  it('coerces type', () => {
    expect(coerceCodeWidgetType('code')).toBe('simulation');
    expect(coerceCodeWidgetType('game')).toBe('game');
  });
  it('does not throw on odd data', () => {
    for (const v of [null, undefined, 'x', 3, [], {}]) {
      expect(isCodeWidget(v)).toBe(false);
      expect(isWalkthroughScene(v)).toBe(false);
      expect(assertScenePolicy(v, { codeAllowed: false })).toBeNull();
    }
  });
});
