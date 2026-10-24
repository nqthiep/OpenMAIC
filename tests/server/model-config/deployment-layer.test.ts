/**
 * The deployment layer over KHAITAM's provider store (lib/server/model-config/provider-store-layer.ts):
 * the providers, default model and stage routes an administrator saved become the layers upstream's
 * slot resolution reads. openmaic.yml, when present, still wins.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearProviders, useProviders } from '../../fixtures/provider-snapshot';

const { loadDeploymentLayer } = await import('@/lib/server/model-config/deployment-layer');
const { ProviderConfigNotReady } = await import('@/lib/server/provider-store/snapshot');

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaic-deployment-layer-'));
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  // Neither the legacy variables nor a file the environment names are the source here.
  for (const name of ['OPENMAIC_CONFIG', 'DEFAULT_MODEL', 'MODEL_ROUTES', 'MODEL_FALLBACK']) {
    vi.stubEnv(name, '');
  }
  clearProviders();
});

afterEach(() => {
  clearProviders();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('loadDeploymentLayer over the provider store', () => {
  it('has no layer when nothing is configured', () => {
    useProviders({});
    expect(loadDeploymentLayer()).toEqual({ layer: null, legacy: false, notices: [] });
  });

  it('answers "not ready" while a configured database has not been read', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    expect(() => loadDeploymentLayer()).toThrow(ProviderConfigNotReady);
  });

  it('declares the saved providers, and the default model is a server default that locks nothing', () => {
    useProviders({
      providers: { openai: { apiKey: 'sk-openai' } },
      defaultModel: 'openai:gpt-5.6',
    });
    const { layer, stageLayers } = loadDeploymentLayer();
    // Only an administrator configures providers (D3): users may not add keys of their own.
    expect(layer).toEqual({
      source: 'deployment',
      config: {
        providers: { openai: { preset: 'openai', apiKey: 'sk-openai' } },
        slots: { llm: 'openai:gpt-5.6', agent: null },
        allowUserKeys: false,
      },
    });
    expect(layer?.config.lock).toBeUndefined();
    expect(stageLayers).toBeUndefined();
  });

  it('ignores DEFAULT_MODEL and MODEL_ROUTES in the environment', () => {
    useProviders({ providers: { openai: { apiKey: 'sk-openai' } } });
    vi.stubEnv('DEFAULT_MODEL', 'openai:gpt-5.6');
    vi.stubEnv('MODEL_ROUTES', '{"scene-content":{"model":"openai:gpt-5.6"}}');
    const { layer } = loadDeploymentLayer();
    expect(layer?.config.slots).toBeUndefined();
  });

  it('turns each stage route into the assignment of its slot, in the deployment layer', () => {
    useProviders({
      providers: { openai: { apiKey: 'sk-openai' }, omniroute: { apiKey: 'sk-omni' } },
      routes: {
        'scene-content': { model: 'openai:gpt-5.4', thinking: { effort: 'high' } },
        'scene-content:quiz': 'openai:gpt-5.4-mini',
        'scene-outlines-stream': 'omniroute:auto/best-chat',
      },
    });
    const { layer } = loadDeploymentLayer();
    // The routes are fixed for everyone; the default model is not.
    expect([...(layer?.config.lock as string[])].sort()).toEqual([
      'agent',
      'course.content',
      'course.content.quiz',
      'course.outline',
    ]);
    expect(layer?.config.slots).toEqual({
      'course.content': { model: 'openai:gpt-5.4', thinking: { effort: 'high' } },
      'course.content.quiz': 'openai:gpt-5.4-mini',
      'course.outline': 'omniroute:auto/best-chat',
      // Without a route of its own the agent stays off, not the `llm` root's model.
      agent: null,
    });
  });

  it('takes the agent from the agent driver route, with its dialect and context window', () => {
    useProviders({
      providers: { omniroute: { apiKey: 'sk-omni' } },
      routes: {
        'maic-agent-driver': {
          model: 'omniroute:auto/best-chat',
          api: 'openai-completions',
          contextWindow: 65_536,
        },
        // Only the agent driver carries a dialect and a window.
        'chat-adapter': { model: 'omniroute:auto/best-chat', api: 'openai-completions' },
      },
    });
    expect(loadDeploymentLayer().layer?.config.slots).toEqual({
      agent: {
        model: 'omniroute:auto/best-chat',
        api: 'openai-completions',
        contextWindow: 65_536,
      },
      classroom: 'omniroute:auto/best-chat',
    });
  });

  it('keeps a route that shares its slot as an override for its own stage only', () => {
    useProviders({
      providers: { omniroute: { apiKey: 'sk-omni' } },
      routes: {
        'chat-adapter': 'omniroute:auto/best-chat',
        'quiz-grade': 'omniroute:auto/best-grader',
        'pbl-v2-runtime:evaluate': 'omniroute:auto/best-grader',
      },
    });
    const { layer, stageLayers } = loadDeploymentLayer();
    // chat-adapter is the first of the stages on `classroom`, so it fills the slot ...
    expect(layer?.config.slots?.classroom).toBe('omniroute:auto/best-chat');
    // ... and the other two keep their own models for their own stages.
    expect(Object.keys(stageLayers ?? {}).sort()).toEqual([
      'pbl-v2-runtime:evaluate',
      'quiz-grade',
    ]);
    expect(stageLayers?.['quiz-grade']?.config.slots?.classroom).toBe('omniroute:auto/best-grader');
  });

  it('leaves out a route whose provider is not configured, a retired stage, and an unknown one', () => {
    useProviders({
      providers: { openai: { apiKey: 'sk-openai' } },
      routes: {
        'scene-content': 'anthropic:claude-sonnet-4',
        'pbl-chat': 'openai:gpt-5.4',
        'maic-agent': 'openai:gpt-5.4',
        'no-such-stage': 'openai:gpt-5.4',
        'scene-actions': 'openai:gpt-5.4',
      },
    });
    const { layer, notices } = loadDeploymentLayer();
    expect(layer?.config.slots).toEqual({ 'course.actions': 'openai:gpt-5.4', agent: null });
    expect(notices).toContain(
      'The route for stage scene-content names a provider without server configuration',
    );
    expect(notices.join('\n')).not.toContain('pbl-chat');
    expect(notices.join('\n')).toContain('unknown stage');
  });

  it('attaches the route fallback only when its provider is declared', () => {
    useProviders({
      providers: { openai: { apiKey: 'sk-openai' }, deepseek: { apiKey: 'sk-ds' } },
      routes: {
        'scene-content': { model: 'openai:gpt-5.4', fallback: 'deepseek:deepseek-v4-pro' },
        'scene-actions': { model: 'openai:gpt-5.4', fallback: 'ghost:model' },
      },
    });
    const slots = loadDeploymentLayer().layer?.config.slots;
    expect(slots?.['course.content']).toEqual({
      model: 'openai:gpt-5.4',
      fallback: 'deepseek:deepseek-v4-pro',
    });
    expect(slots?.['course.actions']).toBe('openai:gpt-5.4');
  });

  it('reports a configuration that only switches providers off', () => {
    useProviders({ disabled: { tts: ['browser-native-tts'] } });
    const { layer, notices } = loadDeploymentLayer();
    expect(layer).toBeNull();
    expect(notices.join('\n')).toMatch(/tts\.browser-native-tts is switched off by the operator/);
  });
});

describe('openmaic.yml over the provider store', () => {
  it('wins, and says so when the store holds settings too', () => {
    useProviders({ providers: { openai: { apiKey: 'sk-openai' } } });
    vi.stubEnv('DS_KEY', 'sk-ds');
    fs.writeFileSync(
      path.join(dir, 'openmaic.yml'),
      'providers:\n  ds:\n    preset: deepseek\n    apiKey: ${DS_KEY}\nslots:\n  llm: ds:deepseek-v4-pro\n',
    );
    const { layer, stageLayers, notices } = loadDeploymentLayer();
    expect(layer?.config.slots).toEqual({ llm: 'ds:deepseek-v4-pro' });
    expect(layer?.config.providers).toEqual({ ds: { preset: 'deepseek', apiKey: 'sk-ds' } });
    expect(stageLayers).toBeUndefined();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/^openmaic\.yml is present/);
  });

  it('is read without the provider settings (a file validates before they load)', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test');
    fs.writeFileSync(path.join(dir, 'custom.yml'), 'slots:\n  video: null\n');
    vi.stubEnv('OPENMAIC_CONFIG', 'custom.yml');
    expect(loadDeploymentLayer()).toEqual({
      layer: { source: 'deployment', config: { slots: { video: null } } },
      legacy: false,
      notices: [],
    });
  });
});
