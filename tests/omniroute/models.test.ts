import { describe, expect, it } from 'vitest';

import { LLM_STAGES } from '@/lib/server/model-routes';
import { ROLE_IDS } from '@/lib/server/omniroute/contract';
import { buildItems, buildPresets } from '@/lib/server/omniroute/models';
import { readRoles, ROLE_STAGES, roleOfStage } from '@/lib/server/omniroute/roles';

import { model } from './fake-omniroute';

const LISTED = [
  model('auto/best-vision'),
  model('auto/best-chat'),
  model('auto/best-reasoning'),
  model('auto/cheap'),
  model('premium', { owned_by: 'combo' }),
  model('openai/gpt-5', {
    capabilities: { vision: false, tool_calling: true },
    input_modalities: ['text', 'image'],
    context_length: 131072,
    max_output_tokens: 32768,
  }),
  model('openai/gpt-mini', {
    capabilities: { vision: false, tool_calling: false },
    input_modalities: ['text'],
  }),
  model('glm/glm-5', { owned_by: 'glm' }),
  model('dva/claude-x', { owned_by: 'devin-cli-agentic' }),
  { object: 'model' },
];

describe('roles and stages', () => {
  it('puts every stage the app can route in exactly one role', () => {
    for (const stage of LLM_STAGES) {
      const direct = ROLE_IDS.filter((role) =>
        (ROLE_STAGES[role] as readonly string[]).includes(stage),
      );
      expect(direct.length, `${stage} listed in ${direct.join()}`).toBeLessThanOrEqual(1);
      expect(roleOfStage(stage), stage).toBeDefined();
    }
    const listed = ROLE_IDS.flatMap((role) => ROLE_STAGES[role]);
    expect(new Set(listed).size).toBe(listed.length);
    for (const stage of listed)
      expect((LLM_STAGES as readonly string[]).includes(stage)).toBe(true);
  });

  it('sends a stage that inherits to the role of the stage it inherits from', () => {
    expect(roleOfStage('scene-content:quiz')).toBe('generate');
    expect(roleOfStage('pbl-v2-runtime:instructor')).toBe('chat');
    expect(roleOfStage('pbl-v2-runtime:evaluate')).toBe('grade');
    expect(roleOfStage('not-a-stage')).toBeUndefined();
  });

  it('reads a role from the first of its stages that points at OmniRoute', () => {
    const row = (stage: string, value: unknown) => ({
      stage,
      value,
      version: 1,
      updatedBy: 'x',
      updatedAt: 'now',
    });
    expect(
      readRoles([
        row('scene-outlines-stream', 'openai:gpt-5'),
        row('scene-content', {
          model: 'omniroute:auto/best-vision',
          vision: true,
          tools: true,
          contextWindow: 65536,
        }),
        row('quiz-grade', 'omniroute:auto/best-reasoning'),
      ]),
    ).toEqual({
      generate: { model: 'auto/best-vision', vision: true, tools: true, contextWindow: 65536 },
      grade: { model: 'auto/best-reasoning', vision: false, tools: false },
    });
  });
});

describe('buildItems', () => {
  const items = buildItems(LISTED, new Set(['openai']));

  it('keeps auto and combos, and single models only of the allowed providers', () => {
    expect(items.map((item) => `${item.group}:${item.id}`)).toEqual([
      'auto:auto/best-vision',
      'auto:auto/best-chat',
      'auto:auto/best-reasoning',
      'auto:auto/cheap',
      'combo:premium',
      'model:openai/gpt-5',
      'model:openai/gpt-mini',
    ]);
  });

  it('reads vision from capabilities or modalities, and tools, context and output', () => {
    const gpt = items.find((item) => item.id === 'openai/gpt-5')!;
    expect(gpt).toMatchObject({
      vision: true,
      tools: true,
      contextWindow: 131072,
      outputWindow: 32768,
      owner: 'openai',
    });
    expect(items.find((item) => item.id === 'openai/gpt-mini')).toMatchObject({
      vision: false,
      tools: false,
      contextWindow: null,
    });
  });

  it('says images only when an auto name does, and nothing else about combos and auto', () => {
    expect(items.find((item) => item.id === 'auto/best-vision')).toMatchObject({
      vision: true,
      tools: null,
    });
    expect(items.find((item) => item.id === 'auto/best-chat')).toMatchObject({
      vision: null,
      tools: null,
    });
    expect(items.find((item) => item.id === 'premium')).toMatchObject({
      group: 'combo',
      vision: null,
      tools: null,
      owner: 'combo',
    });
  });

  it('keeps nothing of a provider that is not allowed, and survives an empty or odd list', () => {
    expect(buildItems(LISTED, new Set()).every((item) => item.group !== 'model')).toBe(true);
    expect(buildItems([], new Set(['openai']))).toEqual([]);
  });
});

describe('buildPresets', () => {
  it('fills a suggestion from the names OmniRoute lists', () => {
    const presets = buildPresets(buildItems(LISTED, new Set(['openai'])));
    expect(presets.balanced).toEqual({
      generate: { model: 'auto/best-vision', vision: true, tools: true },
      chat: { model: 'auto/best-chat', vision: false, tools: true },
      grade: { model: 'auto/best-reasoning', vision: false, tools: true },
      utility: { model: 'auto/cheap', vision: false, tools: true },
    });
    expect(presets.economy?.chat.model).toBe('auto/cheap');
  });

  it('offers a suggestion only when all four roles can be filled', () => {
    const noVision = buildItems(
      LISTED.filter((raw) => raw.id !== 'auto/best-vision'),
      new Set(['openai']),
    );
    expect(buildPresets(noVision)).toEqual({});
  });
});
