/**
 * A provider's error body can echo the credential the request carried, so the
 * MinerU parser logs only the status and a redacted snippet of that body.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFParserConfig } from '@/lib/pdf/types';
import { parseWithMinerUDocument, redactSecretsForLog } from '@/lib/pdf/pdf-providers';

const SECRET = 'sk-proj-7Hq2mZ9xLk4Rt8Vw3Nb6Cd1Fg5Hj0Ps';

const mocks = vi.hoisted(() => ({
  providerFetch: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mocks.logError, debug: vi.fn() }),
}));
vi.mock('@/lib/server/provider-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/provider-fetch')>()),
  providerFetch: (...args: unknown[]) => mocks.providerFetch(...args),
}));

const config = { providerId: 'mineru', baseUrl: 'https://mineru.example.com' } as PDFParserConfig;
const options = { fileName: 'paper.pdf', mimeType: 'application/pdf' };

function loggedText(): string {
  return mocks.logError.mock.calls.map((args) => args.join(' ')).join('\n');
}

describe('redactSecretsForLog', () => {
  it.each([
    ['an Authorization header', `Authorization: Bearer ${SECRET}`, 'Authorization: [redacted]'],
    [
      'a Basic Authorization header',
      'Authorization: Basic dXNlcjpwYXNzd29yZA==',
      'Authorization: [redacted]',
    ],
    [
      'a JSON api_key field',
      `{"api_key": "${SECRET}", "ok": true}`,
      '{"api_key": "[redacted]", "ok": true}',
    ],
    [
      'a token query parameter',
      `https://cdn.example.com/a?token=${SECRET}&w=1`,
      'https://cdn.example.com/a?token=[redacted]&w=1',
    ],
    [
      'URL userinfo',
      `https://op:${SECRET}@mineru.internal/file_parse`,
      'https://[redacted]@mineru.internal/file_parse',
    ],
    ['a bare Bearer token', 'denied with Bearer abc.def_123', 'denied with Bearer [redacted]'],
    ['a long opaque key', `key ${SECRET}`, 'key [redacted]'],
  ])('removes %s', (_name, input, expected) => {
    expect(redactSecretsForLog(input)).toBe(expected);
  });

  it('keeps a parser traceback that carries no credential', () => {
    const traceback =
      'File "/usr/local/lib/python3.10/site-packages/mineru/backend/pipeline/pipeline_analyze.py", ' +
      "line 12\nModuleNotFoundError: No module named 'magic_pdf'";

    expect(redactSecretsForLog(traceback)).toBe(traceback);
  });
});

describe('MinerU error logs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('logs the status and a redacted snippet, never the credential the body echoes', async () => {
    mocks.providerFetch.mockResolvedValueOnce(
      new Response(
        `{"detail":"denied","Authorization":"Bearer ${SECRET}",` +
          `"source":"https://op:${SECRET}@mineru.internal/file_parse"}`,
        { status: 500 },
      ),
    );

    await expect(parseWithMinerUDocument(config, Buffer.from('%PDF-1.4'), options)).rejects.toThrow(
      'MinerU API error (500)',
    );

    const logged = loggedText();
    expect(logged).toContain('[status=500]');
    expect(logged).toContain('"detail":"denied"');
    expect(logged).not.toContain(SECRET);
  });

  it('logs only the status for a body that is not JSON and chains no cause', async () => {
    mocks.providerFetch.mockResolvedValueOnce(
      new Response(`<html>token ${SECRET}</html>`, { status: 200 }),
    );

    const error = await parseWithMinerUDocument(config, Buffer.from('%PDF-1.4'), options).catch(
      (caught: unknown) => caught,
    );

    expect((error as Error).message).toBe(
      'The self-hosted MinerU server returned an invalid response',
    );
    expect((error as Error).cause).toBeUndefined();
    expect(loggedText()).toContain('non-JSON body [status=200]');
    expect(loggedText()).not.toContain(SECRET);
  });
});
