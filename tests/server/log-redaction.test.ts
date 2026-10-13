import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@/lib/logger';
import { __resetLogSecretsForTesting, registerLogSecret } from '@/lib/log-secrets';

const OPERATOR_KEY = 'sk-operator-0123456789';
const VISITOR_KEY = 'sk-visitor-abcdefghij';

describe('log redaction', () => {
  let lines: string[];

  beforeEach(() => {
    __resetLogSecretsForTesting();
    lines = [];
    const capture = (line: string) => {
      lines.push(line);
    };
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    vi.stubEnv('LOG_LEVEL', 'debug');
    vi.stubEnv('LOG_FORMAT', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    __resetLogSecretsForTesting();
  });

  it('replaces a registered operator secret in every line', () => {
    registerLogSecret(OPERATOR_KEY, 'operator');

    createLogger('Test').info('upstream said', OPERATOR_KEY);

    expect(lines[0]).toContain('[redacted]');
    expect(lines[0]).not.toContain(OPERATOR_KEY);
  });

  it('redacts a visitor secret inside an error stack', () => {
    registerLogSecret(VISITOR_KEY, 'visitor');

    createLogger('Test').error('request failed', new Error(`bad key ${VISITOR_KEY}`));

    expect(lines.join('\n')).not.toContain(VISITOR_KEY);
  });

  it('redacts a secret from the environment without registration', () => {
    vi.stubEnv('TEST_API_KEY', 'sk-env-0123456789abcdef');

    createLogger('Test').info('value sk-env-0123456789abcdef');

    expect(lines[0]).not.toContain('sk-env-0123456789abcdef');
    expect(lines[0]).toContain('[redacted]');
  });

  it('redacts an environment secret whose keyword is not last in the name (D-33)', () => {
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'bearer-0123456789abcdef');
    vi.stubEnv('ALIDOCMIND_ACCESS_KEY_ID', 'LTAI-0123456789abcdef');

    createLogger('Test').info('bearer bearer-0123456789abcdef key LTAI-0123456789abcdef');

    expect(lines[0]).not.toContain('bearer-0123456789abcdef');
    expect(lines[0]).not.toContain('LTAI-0123456789abcdef');
  });

  it('keeps a numeric setting whose name contains a keyword, and a count named *_TOKENS (D-33)', () => {
    vi.stubEnv('PDF_TOKEN_LIMIT', '10000000');
    vi.stubEnv('OPENMAIC_AGENT_COMPACTION_RESERVE_TOKENS', '20000000');

    createLogger('Test').info('limits 10000000 and 20000000');

    expect(lines[0]).toContain('limits 10000000 and 20000000');
  });

  it('ignores values shorter than the minimum length, so ordinary words are not hidden', () => {
    registerLogSecret('short', 'operator');

    createLogger('Test').info('a short word: short');

    expect(lines[0]).toContain('a short word: short');
  });

  it('keeps operator secrets after more visitor secrets than the limit are registered', () => {
    registerLogSecret(OPERATOR_KEY, 'operator');
    for (let index = 0; index < 300; index += 1) {
      registerLogSecret(`visitor-secret-${index}-xxxxxxxx`, 'visitor');
    }

    createLogger('Test').info(OPERATOR_KEY);

    expect(lines[0]).not.toContain(OPERATOR_KEY);
  });

  it('stops redacting the oldest visitor secret once the limit pushes it out', () => {
    registerLogSecret('visitor-oldest-xxxxxxxx', 'visitor');
    for (let index = 0; index < 256; index += 1) {
      registerLogSecret(`visitor-newer-${index}-xxxxxxx`, 'visitor');
    }

    createLogger('Test').info('visitor-oldest-xxxxxxxx');

    expect(lines[0]).toContain('visitor-oldest-xxxxxxxx');
  });
});
