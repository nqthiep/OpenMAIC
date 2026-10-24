/**
 * Provider text that can echo a credential (an error message, a response body,
 * a batch failure) is redacted before it is logged or put in a thrown error,
 * and a signed URL is logged as its scheme and host only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFParserConfig } from '@/lib/pdf/types';

const SECRET = 'sk-proj-7Hq2mZ9xLk4Rt8Vw3Nb6Cd1Fg5Hj0Ps';
const UPLOAD_URL = 'https://93.184.216.34/upload/paper.pdf';

const mocks = vi.hoisted(() => ({
  lines: [] as string[],
  transport: vi.fn(),
  docmind: { submit: vi.fn(), status: vi.fn(), result: vi.fn() },
}));

vi.mock('@/lib/logger', () => {
  const record = (...args: unknown[]) => {
    mocks.lines.push(args.map(String).join(' '));
  };
  return { createLogger: () => ({ info: record, warn: record, error: record, debug: record }) };
});

// `providerFetch` re-exports `audioProviderFetch`, so this one stub serves the
// MinerU Cloud and self-hosted paths.
vi.mock('@/lib/server/audio-provider-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/audio-provider-fetch')>();
  return { ...actual, audioProviderFetch: mocks.transport };
});

vi.mock('@alicloud/docmind-api20220711', () => {
  class Client {
    submitDocParserJobAdvance = mocks.docmind.submit;
    queryDocParserStatus = mocks.docmind.status;
    getDocParserResult = mocks.docmind.result;
  }
  class Request {
    constructor(public args: unknown) {}
  }
  return {
    default: Client,
    SubmitDocParserJobAdvanceRequest: Request,
    SubmitDocParserJobAdvanceRequestMultimediaParameters: Request,
    QueryDocParserStatusRequest: Request,
    GetDocParserResultRequest: Request,
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

import { parseWithMinerUCloud } from '@/lib/pdf/mineru-cloud';
import {
  parseWithAliDocMindClient,
  verifyAliDocMindCredentials,
} from '@/lib/pdf/alidocmind-client';
import { fetchAliDocMindImageAsBase64, parseWithMinerUDocument } from '@/lib/pdf/pdf-providers';

const CLOUD = {
  providerId: 'mineru',
  apiKey: 'cloud-token',
  baseUrl: 'https://mineru.example.com/api/v4',
} as PDFParserConfig;
const DOCMIND = { accessKeyId: 'ak', accessKeySecret: 'sk' };
const SUBMIT = { fileName: 'paper.pdf', buffer: Buffer.from('%PDF-1.4') };

function logged(): string {
  return mocks.lines.join('\n');
}

/** The error a promise rejects with; fails the test if it resolves. */
async function rejectionOf(pending: Promise<unknown>): Promise<Error> {
  try {
    await pending;
  } catch (caught) {
    return caught as Error;
  }
  throw new Error('expected the call to reject');
}

beforeEach(() => {
  mocks.lines.length = 0;
  mocks.transport.mockReset();
  for (const fn of Object.values(mocks.docmind)) fn.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MinerU Cloud logs', () => {
  it('redacts the message of an HTTP error and keeps it out of the thrown error', async () => {
    mocks.transport.mockResolvedValueOnce(
      Response.json({ code: 1, msg: `token=${SECRET}`, data: null }, { status: 401 }),
    );

    const error = await rejectionOf(
      parseWithMinerUCloud(CLOUD, Buffer.from('%PDF-1.4'), 'paper.pdf'),
    );

    expect(error.message).not.toContain(SECRET);
    expect(logged()).toContain('HTTP 401: token=[redacted]');
    expect(logged()).not.toContain(SECRET);
  });

  it('redacts the message of an envelope rejected with a non-zero code', async () => {
    mocks.transport.mockResolvedValueOnce(
      Response.json({ code: 1001, msg: `token=${SECRET}`, data: null }, { status: 200 }),
    );

    await parseWithMinerUCloud(CLOUD, Buffer.from('%PDF-1.4'), 'paper.pdf').catch(() => undefined);

    expect(logged()).toContain('code 1001: token=[redacted]');
    expect(logged()).not.toContain(SECRET);
  });

  it('redacts a non-JSON body before it is logged', async () => {
    mocks.transport.mockResolvedValueOnce(
      new Response(`<p>token=${SECRET} denied</p>`, { status: 502 }),
    );

    await parseWithMinerUCloud(CLOUD, Buffer.from('%PDF-1.4'), 'paper.pdf').catch(() => undefined);

    expect(logged()).toContain('non-JSON body (HTTP 502): <p>token=[redacted] denied</p>');
    expect(logged()).not.toContain(SECRET);
  });

  it('redacts the error of a failed batch', async () => {
    mocks.transport.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/file-urls/batch')) {
        return Response.json({
          code: 0,
          msg: 'ok',
          data: { batch_id: 'b1', file_urls: [UPLOAD_URL] },
        });
      }
      if (url === UPLOAD_URL) return new Response('', { status: 200 });
      return Response.json({
        code: 0,
        msg: 'ok',
        data: {
          extract_result: {
            file_name: 'paper.pdf',
            state: 'failed',
            err_msg: `token=${SECRET}`,
          },
        },
      });
    });

    await expect(parseWithMinerUCloud(CLOUD, Buffer.from('%PDF-1.4'), 'paper.pdf')).rejects.toThrow(
      'MinerU Cloud parsing failed',
    );

    expect(logged()).toContain('failed: token=[redacted]');
    expect(logged()).not.toContain(SECRET);
  }, 15_000); // the upload is followed by a fixed 1.5 s wait
});

describe('AliDocMind logs and errors', () => {
  it('redacts the message of a rejected credential probe', async () => {
    mocks.docmind.status.mockResolvedValueOnce({
      body: { code: 'NoPermission', message: `token=${SECRET}` },
    });

    const result = await verifyAliDocMindCredentials(DOCMIND);

    expect(result.ok).toBe(false);
    expect(logged()).toContain('Credential probe rejected [code=NoPermission]: token=[redacted]');
    expect(logged()).not.toContain(SECRET);
  });

  it('keeps the submit body out of the error when no job id comes back', async () => {
    mocks.docmind.submit.mockResolvedValueOnce({
      body: { code: 'Forbidden', message: `token=${SECRET}` },
    });

    const error = await rejectionOf(parseWithAliDocMindClient(DOCMIND, SUBMIT));

    expect(error.message).toContain('AliDocMind submit returned no job id');
    expect(error.message).toContain('token=[redacted]');
    expect(error.message).not.toContain(SECRET);
  });

  it('redacts the message of a failed status query', async () => {
    mocks.docmind.submit.mockResolvedValueOnce({ body: { data: { id: 'job-1' } } });
    mocks.docmind.status.mockResolvedValueOnce({
      body: { code: 'NoPermission', message: `token=${SECRET}` },
    });

    const error = await rejectionOf(parseWithAliDocMindClient(DOCMIND, SUBMIT));

    expect(error.message).toBe(
      'AliDocMind status query failed (code NoPermission): token=[redacted]',
    );
  });
});

describe('provider URLs in logs', () => {
  it('logs a refused image URL as its scheme and host only', async () => {
    await expect(
      fetchAliDocMindImageAsBase64(`https://evil.example.com/a.png?Signature=${SECRET}`),
    ).resolves.toBeNull();

    expect(logged()).toContain('refusing non-OSS image URL: https://evil.example.com');
    expect(logged()).not.toContain(SECRET);
    expect(logged()).not.toContain('a.png');
  });

  it('logs a signed OSS image that fails to load as its scheme and host only', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(
      fetchAliDocMindImageAsBase64(
        `https://bkt.oss-cn-hangzhou.aliyuncs.com/a.png?OSSAccessKeyId=ak&Signature=${SECRET}`,
      ),
    ).resolves.toBeNull();

    expect(logged()).toContain('image fetch 403 for https://bkt.oss-cn-hangzhou.aliyuncs.com');
    expect(logged()).not.toContain(SECRET);
    expect(logged()).not.toContain('a.png');
  });

  it('does not echo a value that is not a URL', async () => {
    await expect(fetchAliDocMindImageAsBase64(`not a url ${SECRET}`)).resolves.toBeNull();

    expect(logged()).toContain('refusing non-OSS image URL: [invalid URL]');
    expect(logged()).not.toContain(SECRET);
  });

  it('logs the self-hosted MinerU server as its scheme and host only', async () => {
    mocks.transport.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const config = {
      providerId: 'mineru',
      baseUrl: `https://op:${SECRET}@mineru.example.com/base?token=${SECRET}`,
    } as PDFParserConfig;

    await parseWithMinerUDocument(config, Buffer.from('%PDF-1.4'), {
      fileName: 'paper.pdf',
      mimeType: 'application/pdf',
    }).catch(() => undefined);

    expect(logged()).toContain('Parsing document with MinerU server: https://mineru.example.com');
    expect(logged()).not.toContain(SECRET);
  });
});
