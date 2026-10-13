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

  // B51: secret-bearing names the suffix list cannot see.
  it.each([
    ['AWS_BEARER_TOKEN_BEDROCK', 'bedrock-bearer-9d2bxxxxxxxx'],
    ['S3_CONTRACT_SECRET_KEY', 's3-contract-secret-9d2bxxxx'],
    ['ALIDOCMIND_ACCESS_KEY_ID', 'AKIA9d2bxxxxxxxxxxxx'],
  ])('redacts %s from the environment without registration', (name, value) => {
    vi.stubEnv(name, value);

    createLogger('Test').info(`saw ${value} in a line`);

    expect(lines.join('\n')).not.toContain(value);
    expect(lines.join('\n')).toContain('[redacted]');
  });

  it('redacts the password embedded in DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://appuser:dbpass-9d2bxxxxxxxx@db.internal:5432/openmaic');

    createLogger('Test').error('connect failed', new Error('password authentication failed'));

    expect(lines.join('\n')).not.toContain('dbpass-9d2bxxxxxxxx');
  });

  it('does not redact a DATABASE_URL without a password', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://db.internal:5432/openmaic');

    createLogger('Test').info('using postgres://db.internal:5432/openmaic');

    expect(lines.join('\n')).toContain('postgres://db.internal:5432/openmaic');
  });
});
