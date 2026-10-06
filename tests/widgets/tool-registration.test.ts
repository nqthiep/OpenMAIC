import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCourseAllowlist,
  buildDslCourseToolset,
} from '@/lib/server/agent-runtime/course-tools';
import { widgetRegistry } from '@/lib/widgets';
import { STAGE_WRITER_TOOL_NAMES } from '@/lib/agent-runtime/stage-writer-tools';

const deps = {
  ownerId: 'o1',
  sessionId: 's1',
  store: {} as never,
  aiCall: async () => {
    throw new Error('no LLM in tests');
  },
} as never;

describe('generate_walkthrough registration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is in the toolset, the allowlist and the sequential writers', () => {
    const names = buildDslCourseToolset(deps).map((t) => t.name);
    expect(names).toContain('generate_walkthrough');
    expect(buildCourseAllowlist().has('generate_walkthrough')).toBe(true);
    expect(STAGE_WRITER_TOOL_NAMES.has('generate_walkthrough')).toBe(true);
  });

  it('is absent when widget providers are disabled', () => {
    vi.stubEnv('OPENMAIC_DISABLE_WIDGET_PROVIDERS', 'true');
    expect(buildDslCourseToolset(deps).map((t) => t.name)).not.toContain('generate_walkthrough');
    expect(buildCourseAllowlist().has('generate_walkthrough')).toBe(false);
  });

  it('is absent when the catalog has no walkthrough id (no empty union)', () => {
    vi.spyOn(widgetRegistry, 'walkthroughIds').mockReturnValue([]);
    expect(() => buildDslCourseToolset(deps)).not.toThrow();
    expect(buildDslCourseToolset(deps).map((t) => t.name)).not.toContain('generate_walkthrough');
    expect(buildCourseAllowlist().has('generate_walkthrough')).toBe(false);
  });
});
