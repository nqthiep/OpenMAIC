/**
 * Diagram-generation switches, read from the environment on each call. Every path that generates
 * scenes takes them from here, so one setting means the same thing in the classroom generator and
 * in the agent runtime.
 *
 * - OPENMAIC_DIAGRAM_OUTPUT=graph: flowcharts come back as nodes and edges, drawn by the platform.
 * - OPENMAIC_DIAGRAM_VISUAL_RULES=off (or false, 0): leave the visual rules out of HTML diagrams.
 */
export interface DiagramGenerationOptions {
  diagramOutput: 'html' | 'graph';
  diagramVisualRules: boolean;
}

const VISUAL_RULES_OFF = ['off', 'false', '0'];

export function diagramGenerationOptions(
  env: Partial<Record<string, string | undefined>> = process.env,
): DiagramGenerationOptions {
  return {
    diagramOutput: env.OPENMAIC_DIAGRAM_OUTPUT === 'graph' ? 'graph' : 'html',
    diagramVisualRules: !VISUAL_RULES_OFF.includes(env.OPENMAIC_DIAGRAM_VISUAL_RULES ?? ''),
  };
}
