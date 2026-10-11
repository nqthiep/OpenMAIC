import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isReviewRequired } from '@/lib/config/feature-flags';
import {
  validateServerConfig,
  validateStudentModeConfiguration,
} from '@/lib/server/config-validation';
import type { ModelConfigFile } from '@/lib/server/model-config/openmaic-yml';
import { setDeploymentConfigForTests } from '@/lib/server/model-config/runtime';

const ENV_KEYS = [
  'ACCESS_CODE',
  'DATABASE_URL',
  'NEXT_PUBLIC_OPENMAIC_HOME',
  'NEXT_RUNTIME',
  'OPENMAIC_ACCESS_SECRET',
  'OPENMAIC_HOME',
  'OPENMAIC_REQUIRE_REVIEW',
  'OPENMAIC_TUTOR_MODERATION',
  'OWNER_SINGLE_USER',
  'PERSISTENCE_SHARED_OWNER_ID',
] as const;

const originals = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originals.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = originals.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  originals.clear();
  setDeploymentConfigForTests();
  vi.restoreAllMocks();
});

const providers = { openai: { preset: 'openai', apiKey: 'test-key' } };

const studentFile = {
  providers,
  slots: { 'tutor.moderation': 'openai:gpt-5.4' },
  allowUserKeys: false,
  lock: 'all' as const,
};

/** Installs an openmaic.yml-shaped deployment layer. */
function deployment(config: Partial<ModelConfigFile>): void {
  setDeploymentConfigForTests({
    layer: { source: 'deployment', config: config as ModelConfigFile },
    legacy: false,
    notices: [],
  });
}

/** Every student-mode setting in place. Each refusal test breaks exactly one of them. */
function studentDeployment(): void {
  process.env.OPENMAIC_HOME = 'learn';
  process.env.NEXT_PUBLIC_OPENMAIC_HOME = 'learn';
  process.env.ACCESS_CODE = 'a-long-access-code';
  process.env.OPENMAIC_ACCESS_SECRET = 'k'.repeat(32);
  process.env.OPENMAIC_TUTOR_MODERATION = 'true';
  deployment(studentFile);
}

/** The refusal lists this one problem and nothing else: a second listed problem fails the match. */
function soleProblem(problem: string): RegExp {
  const escaped = problem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^OPENMAIC_HOME=learn refuses to start:\\n- ${escaped}[^\\n]*$`);
}

describe('validateStudentModeConfiguration', () => {
  it('does nothing outside student mode, even with every setting missing', () => {
    expect(() => validateStudentModeConfiguration()).not.toThrow();
  });

  it('accepts a student deployment with every setting in place', () => {
    studentDeployment();
    expect(() => validateStudentModeConfiguration()).not.toThrow();
  });

  it('accepts the minimum lengths of ACCESS_CODE and OPENMAIC_ACCESS_SECRET', () => {
    studentDeployment();
    process.env.ACCESS_CODE = 'c'.repeat(16);
    process.env.OPENMAIC_ACCESS_SECRET = 'k'.repeat(32);
    expect(() => validateStudentModeConfiguration()).not.toThrow();
  });

  const refusals: Array<[string, () => void, RegExp]> = [
    [
      'ACCESS_CODE is unset',
      () => delete process.env.ACCESS_CODE,
      soleProblem('ACCESS_CODE must be set to at least 16 characters'),
    ],
    [
      'ACCESS_CODE has 15 characters',
      () => {
        process.env.ACCESS_CODE = 'x'.repeat(15);
      },
      soleProblem('ACCESS_CODE must be set to at least 16 characters'),
    ],
    [
      'OPENMAIC_ACCESS_SECRET is unset',
      () => delete process.env.OPENMAIC_ACCESS_SECRET,
      soleProblem('OPENMAIC_ACCESS_SECRET must be set to at least 32 characters'),
    ],
    [
      'OPENMAIC_ACCESS_SECRET has 31 characters',
      () => {
        process.env.OPENMAIC_ACCESS_SECRET = 'k'.repeat(31);
      },
      soleProblem('OPENMAIC_ACCESS_SECRET must be set to at least 32 characters'),
    ],
    [
      'OPENMAIC_ACCESS_SECRET equals ACCESS_CODE',
      () => {
        process.env.ACCESS_CODE = 's'.repeat(32);
        process.env.OPENMAIC_ACCESS_SECRET = 's'.repeat(32);
      },
      soleProblem('OPENMAIC_ACCESS_SECRET must differ from ACCESS_CODE'),
    ],
    [
      'OPENMAIC_TUTOR_MODERATION is off',
      () => delete process.env.OPENMAIC_TUTOR_MODERATION,
      soleProblem('OPENMAIC_TUTOR_MODERATION must be true'),
    ],
    [
      'tutor.moderation has no model',
      () => deployment({ providers, allowUserKeys: false, lock: 'all' }),
      soleProblem('tutor.moderation has no model'),
    ],
    [
      'allowUserKeys is true',
      () => deployment({ ...studentFile, allowUserKeys: true }),
      soleProblem('allowUserKeys must be false'),
    ],
    [
      'allowUserKeys is not written (on by default)',
      () => deployment({ providers, slots: studentFile.slots, lock: 'all' }),
      soleProblem('allowUserKeys must be false'),
    ],
    [
      'lock names only some slots',
      () => deployment({ ...studentFile, lock: ['tutor.moderation'] }),
      soleProblem('lock: all must be set'),
    ],
    [
      'lock is not written',
      () => deployment({ ...studentFile, lock: undefined }),
      soleProblem('lock: all must be set'),
    ],
    [
      'the build lacks NEXT_PUBLIC_OPENMAIC_HOME',
      () => delete process.env.NEXT_PUBLIC_OPENMAIC_HOME,
      soleProblem('NEXT_PUBLIC_OPENMAIC_HOME=learn must be set at build time'),
    ],
    [
      'OWNER_SINGLE_USER is true',
      () => {
        process.env.OWNER_SINGLE_USER = 'true';
      },
      soleProblem('OWNER_SINGLE_USER must be unset'),
    ],
    [
      'OWNER_SINGLE_USER is 1 with spaces around it',
      () => {
        process.env.OWNER_SINGLE_USER = ' 1 ';
      },
      soleProblem('OWNER_SINGLE_USER must be unset'),
    ],
    [
      'PERSISTENCE_SHARED_OWNER_ID is set',
      () => {
        process.env.PERSISTENCE_SHARED_OWNER_ID = 'team';
      },
      soleProblem('PERSISTENCE_SHARED_OWNER_ID must be unset'),
    ],
  ];

  it.each(refusals)('refuses when %s', (_name, breakSetting, message) => {
    studentDeployment();
    breakSetting();
    expect(() => validateStudentModeConfiguration()).toThrow(message);
  });

  it('accepts OWNER_SINGLE_USER=false and a blank PERSISTENCE_SHARED_OWNER_ID', () => {
    studentDeployment();
    process.env.OWNER_SINGLE_USER = 'false';
    process.env.PERSISTENCE_SHARED_OWNER_ID = '   ';
    expect(() => validateStudentModeConfiguration()).not.toThrow();
  });

  it('refuses a single-user owner without ACCESS_CODE, naming both settings', () => {
    studentDeployment();
    delete process.env.ACCESS_CODE;
    process.env.OWNER_SINGLE_USER = 'true';
    expect(() => validateStudentModeConfiguration()).toThrow(
      /ACCESS_CODE[\s\S]*OWNER_SINGLE_USER must be unset/,
    );
  });

  it('does not refuse the owner settings outside student mode', () => {
    process.env.OWNER_SINGLE_USER = 'true';
    process.env.PERSISTENCE_SHARED_OWNER_ID = 'team';
    expect(() => validateStudentModeConfiguration()).not.toThrow();
  });

  it('lists every missing setting in one refusal, each naming what to change', () => {
    process.env.OPENMAIC_HOME = 'learn';
    deployment({});
    expect(() => validateStudentModeConfiguration()).toThrow(
      /ACCESS_CODE[\s\S]*OPENMAIC_ACCESS_SECRET[\s\S]*OPENMAIC_TUTOR_MODERATION[\s\S]*tutor\.moderation[\s\S]*allowUserKeys[\s\S]*lock: all[\s\S]*NEXT_PUBLIC_OPENMAIC_HOME/,
    );
  });
});

describe('isReviewRequired', () => {
  it.each([
    [undefined, false],
    ['true', true],
    ['false', false],
  ])('outside student mode, OPENMAIC_REQUIRE_REVIEW=%s is %s', (value, expected) => {
    if (value !== undefined) process.env.OPENMAIC_REQUIRE_REVIEW = value;
    expect(isReviewRequired()).toBe(expected);
  });

  it.each([
    [undefined, true],
    ['', true],
    ['true', true],
    ['no', true],
    ['false', false],
    ['0', false],
  ])('in student mode, OPENMAIC_REQUIRE_REVIEW=%s is %s', (value, expected) => {
    process.env.OPENMAIC_HOME = 'learn';
    if (value !== undefined) process.env.OPENMAIC_REQUIRE_REVIEW = value;
    expect(isReviewRequired()).toBe(expected);
  });
});

describe('student-mode warnings at boot', () => {
  it('warns when the review gate is switched off on a student deployment', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.OPENMAIC_HOME = 'learn';
    process.env.OPENMAIC_REQUIRE_REVIEW = 'false';
    validateServerConfig();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('OPENMAIC_REQUIRE_REVIEW is false on a student deployment'),
    );
  });

  it('says nothing about the review gate when it is left on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.OPENMAIC_HOME = 'learn';
    validateServerConfig();
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('OPENMAIC_REQUIRE_REVIEW'));
  });

  it('warns when a build meant for students runs outside student mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_OPENMAIC_HOME = 'learn';
    validateServerConfig();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('NEXT_PUBLIC_OPENMAIC_HOME=learn was set at build time'),
    );
  });
});

describe('boot refuses a student deployment', () => {
  it('stops the process and names the missing ACCESS_CODE', async () => {
    studentDeployment();
    delete process.env.ACCESS_CODE;
    process.env.DATABASE_URL = 'postgres://boot-test/openmaic';
    process.env.NEXT_RUNTIME = 'nodejs';
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const stderr: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array,
      callback?: () => void,
    ) => {
      stderr.push(String(chunk));
      callback?.();
      return true;
    }) as never);
    const { register } = await import('@/instrumentation');

    await expect(register()).rejects.toThrow(/ACCESS_CODE must be set to at least 16 characters/);

    expect(exit).toHaveBeenCalledWith(1);
    const bootLines = stderr.filter((line) => line.startsWith('[boot]'));
    expect(bootLines).toHaveLength(1);
    expect(bootLines[0]).toMatch(
      /^\[boot\] Invalid server configuration; the server will not start: OPENMAIC_HOME=learn refuses to start:/,
    );
    expect(bootLines[0]).toMatch(/ACCESS_CODE must be set/);
  });
});
