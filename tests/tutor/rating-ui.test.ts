import { describe, expect, it } from 'vitest';

import { buildRatingRecord, MAX_RATING } from '@/lib/tutor/learning-log';
import { acceptRating, RATING_VALUES, shouldShowRating } from '@/lib/tutor/rating-ui';

const walkthrough = {
  id: 'w',
  content: { type: 'interactive', widgetConfig: { kind: 'walkthrough', walkthroughId: 'bs' } },
};
const simulation = {
  id: 'i',
  content: { type: 'interactive', widgetConfig: { kind: 'simulation' } },
};
const slide = { id: 's', content: { type: 'slide' } };

describe('shouldShowRating', () => {
  it('shows only when some scene is a walkthrough', () => {
    expect(shouldShowRating([slide, walkthrough])).toBe(true);
    expect(shouldShowRating([walkthrough])).toBe(true);
  });

  it('hides for courses without a walkthrough scene', () => {
    expect(shouldShowRating([])).toBe(false);
    expect(shouldShowRating([slide, simulation])).toBe(false);
    expect(shouldShowRating([null, undefined, 'x'])).toBe(false);
  });
});

describe('RATING_VALUES', () => {
  it('is 1..MAX_RATING and every value survives buildRatingRecord unclamped', () => {
    expect(RATING_VALUES).toEqual([1, 2, 3, 4, 5]);
    expect(RATING_VALUES).toHaveLength(MAX_RATING);
    for (const easy of RATING_VALUES) {
      expect(buildRatingRecord({ stageId: 'st', easy }).easy).toBe(easy);
    }
  });
});

describe('acceptRating', () => {
  it('accepts the first press', () => {
    expect(acceptRating(null, 4)).toBe(4);
  });

  it('blocks repeat presses once chosen (including the same value)', () => {
    expect(acceptRating(4, 4)).toBeUndefined();
    expect(acceptRating(4, 2)).toBeUndefined();
  });

  it('rejects values outside the scale', () => {
    expect(acceptRating(null, 0)).toBeUndefined();
    expect(acceptRating(null, 6)).toBeUndefined();
    expect(acceptRating(null, 2.5)).toBeUndefined();
  });
});
