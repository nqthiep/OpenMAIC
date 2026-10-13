import { describe, expect, it } from 'vitest';

import { StageListError, stageListFailureMessage } from '@/lib/utils/stage-storage';

// B55: the owner listing answers 404 when the server's agent runtime is off. That is a server
// setting, so the visitor is told so instead of being told that storage is down.
describe('stageListFailureMessage', () => {
  it('names the runtime setting when the owner listing answers 404', () => {
    expect(stageListFailureMessage(new StageListError(404))).toBe(
      'Saved classrooms are unavailable: the agent runtime is not enabled on this server.',
    );
  });

  it('keeps the persistence message for any other status', () => {
    expect(stageListFailureMessage(new StageListError(500))).toBe(
      'Persistence is unavailable. Saved classrooms could not be loaded.',
    );
  });

  it('keeps the persistence message for an error that is not a listing error', () => {
    expect(stageListFailureMessage(new Error('network down'))).toBe(
      'Persistence is unavailable. Saved classrooms could not be loaded.',
    );
  });

  it('carries the HTTP status on the error', () => {
    const error = new StageListError(404);
    expect(error.status).toBe(404);
    expect(error.message).toBe('Failed to list owner stages: HTTP 404');
  });
});
