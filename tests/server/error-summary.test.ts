import { describe, expect, it } from 'vitest';

import {
  describeUnexpectedError,
  MODEL_FAILURE_TEXT,
  visitorErrorText,
} from '@/lib/server/error-summary';

describe('visitorErrorText', () => {
  it('sends the fixed text, never upstream text, when the operator key was used', () => {
    const upstream = new Error('Incorrect API key provided: sk-live-echoed');

    expect(visitorErrorText(upstream, true, MODEL_FAILURE_TEXT)).toBe(MODEL_FAILURE_TEXT);
  });

  it('keeps the message for a visitor who supplied their own key', () => {
    expect(visitorErrorText(new Error('Rate limit reached'), false, MODEL_FAILURE_TEXT)).toBe(
      'Rate limit reached',
    );
  });

  it('uses the fallback for a thrown value that is not an Error, whatever the key', () => {
    expect(visitorErrorText('raw string', false, 'fallback')).toBe('fallback');
  });
});

describe('describeUnexpectedError', () => {
  it('reports name, a plain code and the first frame, and no message text', () => {
    const error = Object.assign(new TypeError('password=hunter2'), { code: 'EACCES' });

    const line = describeUnexpectedError(error);

    expect(line).toMatch(/^TypeError code=EACCES frame=at /);
    expect(line).not.toContain('hunter2');
  });

  it('never takes a frame from text inside the message', () => {
    const error = new Error('boom\n    at injected (attacker.js:1:1)');

    const line = describeUnexpectedError(error);

    expect(line).not.toContain('injected');
  });

  it('drops a code that is not a plain token', () => {
    const error = Object.assign(new Error('x'), { code: 'bad code with spaces' });

    expect(describeUnexpectedError(error)).toMatch(/ code=none /);
  });

  it('describes a value that is not an Error without reading it', () => {
    expect(describeUnexpectedError('password=hunter2')).toBe('non-error value');
  });
});
