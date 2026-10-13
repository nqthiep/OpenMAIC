import { describe, expect, it, vi } from 'vitest';

// Regression: a submit that returns no job id used to throw the JSON of the upstream body.
// That message is stored as the material's failure reason and reaches the agent, so the
// body must stay in the log only.
const { submitDocParserJobAdvance, warn } = vi.hoisted(() => ({
  submitDocParserJobAdvance: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@alicloud/docmind-api20220711', () => {
  class Client {
    submitDocParserJobAdvance = submitDocParserJobAdvance;
  }
  class Request {
    constructor(public args: unknown) {}
  }
  return {
    default: Client,
    SubmitDocParserJobAdvanceRequest: Request,
    SubmitDocParserJobAdvanceRequestMultimediaParameters: Request,
  };
});
vi.mock('@alicloud/openapi-client', () => ({
  Config: class {
    constructor(public args: unknown) {}
  },
}));
vi.mock('@alicloud/tea-util', () => ({
  RuntimeOptions: class {
    constructor(public args: unknown) {}
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn, error: vi.fn() }),
}));

import {
  parseWithAliDocMindClient,
  type AliDocMindSubmitOptions,
} from '@/lib/pdf/alidocmind-client';

const UPSTREAM_ECHO = 'upstream-echo-7f3a9c';
const CREDS = { accessKeyId: 'ak', accessKeySecret: 'sk' };
const OPTIONS: AliDocMindSubmitOptions = {
  buffer: Buffer.from('%PDF-1.4'),
  fileName: 'lesson.pdf',
};

describe('parseWithAliDocMindClient when the submit returns no job id', () => {
  it('throws a fixed message that carries no upstream body', async () => {
    submitDocParserJobAdvance.mockResolvedValue({
      body: { code: 'Forbidden', message: UPSTREAM_ECHO, data: {} },
    });

    const error = await parseWithAliDocMindClient(CREDS, OPTIONS).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('AliDocMind submit returned no job id');
    expect((error as Error).message).not.toContain(UPSTREAM_ECHO);
  });

  it('keeps the upstream body in the server log', async () => {
    submitDocParserJobAdvance.mockResolvedValue({
      body: { code: 'Forbidden', message: UPSTREAM_ECHO, data: {} },
    });

    await parseWithAliDocMindClient(CREDS, OPTIONS).catch(() => undefined);

    expect(warn).toHaveBeenCalledWith(
      'AliDocMind submit returned no job id:',
      expect.objectContaining({ message: UPSTREAM_ECHO }),
    );
  });
});
