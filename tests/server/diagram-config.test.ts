import { describe, expect, it } from 'vitest';

import { diagramGenerationOptions } from '@/lib/server/diagram-config';

describe('diagramGenerationOptions', () => {
  it('defaults to HTML diagrams with the visual rules on', () => {
    expect(diagramGenerationOptions({})).toEqual({
      diagramOutput: 'html',
      diagramVisualRules: true,
    });
  });

  it('turns flowcharts into graphs only for the exact value "graph"', () => {
    expect(diagramGenerationOptions({ OPENMAIC_DIAGRAM_OUTPUT: 'graph' }).diagramOutput).toBe(
      'graph',
    );
    expect(diagramGenerationOptions({ OPENMAIC_DIAGRAM_OUTPUT: 'Graph' }).diagramOutput).toBe(
      'html',
    );
    expect(diagramGenerationOptions({ OPENMAIC_DIAGRAM_OUTPUT: 'html' }).diagramOutput).toBe(
      'html',
    );
  });

  it.each(['off', 'false', '0'])('turns the visual rules off for %s', (value) => {
    expect(
      diagramGenerationOptions({ OPENMAIC_DIAGRAM_VISUAL_RULES: value }).diagramVisualRules,
    ).toBe(false);
  });

  it('keeps the visual rules on for any other value', () => {
    expect(
      diagramGenerationOptions({ OPENMAIC_DIAGRAM_VISUAL_RULES: 'on' }).diagramVisualRules,
    ).toBe(true);
    expect(diagramGenerationOptions({ OPENMAIC_DIAGRAM_VISUAL_RULES: '' }).diagramVisualRules).toBe(
      true,
    );
  });

  it('reads process.env when no environment is passed', () => {
    const before = process.env.OPENMAIC_DIAGRAM_VISUAL_RULES;
    process.env.OPENMAIC_DIAGRAM_VISUAL_RULES = 'off';
    try {
      expect(diagramGenerationOptions().diagramVisualRules).toBe(false);
    } finally {
      if (before === undefined) delete process.env.OPENMAIC_DIAGRAM_VISUAL_RULES;
      else process.env.OPENMAIC_DIAGRAM_VISUAL_RULES = before;
    }
  });
});
