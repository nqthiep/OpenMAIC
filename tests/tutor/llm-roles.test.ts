import { afterEach, describe, expect, it } from 'vitest';
import { TUTOR_SLOTS, TUTOR_STAGES, getTutorRoute, resolveTutorModel } from '@/lib/tutor/llm-roles';
import type { ModelConfigFile } from '@/lib/server/model-config/openmaic-yml';
import { setDeploymentConfigForTests } from '@/lib/server/model-config/runtime';

const providers = {
  openai: { preset: 'openai', apiKey: 'test-key' },
};

/** Installs an openmaic.yml-shaped deployment layer for the tutor roles to read. */
function deployment(config: Partial<ModelConfigFile> | null) {
  setDeploymentConfigForTests({
    layer: config ? { source: 'deployment', config: config as ModelConfigFile } : null,
    legacy: false,
    notices: [],
  });
}

afterEach(() => {
  setDeploymentConfigForTests();
});

describe('getTutorRoute', () => {
  it('returns the model the role is assigned in openmaic.yml', () => {
    deployment({ providers, slots: { 'tutor.moderation': 'openai:gpt-5.4' } });
    expect(getTutorRoute('tutor-moderation')).toEqual({ model: 'openai:gpt-5.4' });
  });

  it('gives every role its own slot', () => {
    const slots = Object.fromEntries(
      TUTOR_STAGES.map((stage) => [TUTOR_SLOTS[stage], `openai:m-${stage}`]),
    );
    deployment({ providers, slots });
    for (const stage of TUTOR_STAGES) {
      expect(getTutorRoute(stage)?.model).toBe(`openai:m-${stage}`);
    }
  });

  it('keeps the thinking setting of the assignment', () => {
    const thinking = { mode: 'enabled', effort: 'low' };
    deployment({ providers, slots: { 'tutor.moderation': { model: 'openai:gpt-5.4', thinking } } });
    expect(getTutorRoute('tutor-moderation')).toEqual({ model: 'openai:gpt-5.4', thinking });
  });

  it('returns null when the role is not assigned, even if the llm default is set', () => {
    deployment({ providers, slots: { llm: 'openai:gpt-5.4' } });
    expect(getTutorRoute('tutor-analyst')).toBeNull();
    expect(getTutorRoute('tutor-review-cp')).toBeNull();
  });

  it('returns null without a deployment configuration', () => {
    deployment(null);
    expect(getTutorRoute('tutor-moderation')).toBeNull();
  });
});

describe('resolveTutorModel', () => {
  it('returns null when the role is not assigned, without building a model', async () => {
    deployment({ providers, slots: { llm: 'openai:gpt-5.4' } });
    expect(await resolveTutorModel('sim-learner')).toBeNull();
  });
});
