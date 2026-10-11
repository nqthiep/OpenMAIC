import { describe, expect, it } from 'vitest';

import {
  describeUnexpectedError,
  MODEL_FAILURE_TEXT,
  visitorErrorText,
  visitorStreamEvent,
} from '@/lib/server/error-summary';

describe('visitorStreamEvent', () => {
  it('replaces an error event with the fixed text when the operator key was used', () => {
    const event = { type: 'error', data: { message: 'Invalid API key sk-live-echoed' } };

    expect(visitorStreamEvent(event, true)).toEqual({
      type: 'error',
      data: { message: MODEL_FAILURE_TEXT },
    });
  });

  it('passes an error event through for a visitor who supplied their own key', () => {
    const event = { type: 'error', data: { message: 'Rate limit reached' } };

    expect(visitorStreamEvent(event, false)).toBe(event);
  });

  it('passes other events through unchanged, whatever the key', () => {
    const event = { type: 'text', data: { text: 'lesson text' } };

    expect(visitorStreamEvent(event, true)).toBe(event);
    expect(visitorStreamEvent(event, false)).toBe(event);
  });
});

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
