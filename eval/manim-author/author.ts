/**
 * Pure core of the Manim author loop (card 3A-08, ADR 0014 decision 4, SCHEMA Phase 3 §6.1): the prompts, the extraction of
 * the Python file from the model's answer, the repair loop and the metrics. No file, process or network access: the runner
 * injects the model (`Llm`) and the check (`Check`: allowlist, render in a sandbox, QA gates, manifest check), so tests use
 * fakes. The model writes a TEMPLATE for a clip whose TypeScript entry already exists; it never writes anything that runs
 * on the serving host (that is ADR 0007's trigger).
 */
import type { ClipModule } from '@/lib/clips/types';

export const MAX_ROUNDS = 3;
/** ADR 0007 S9: RSR@3 at least 90%. */
export const TARGET_RSR3 = 0.9;

export interface Brief {
  /** unique */
  id: string;
  clipId: string;
  presetId: string;
  /** the request, in Vietnamese, as a teacher would phrase it */
  text: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}
export type Llm = (req: {
  system: string;
  prompt: string;
}) => Promise<{ text: string; usage?: Usage }>;
/** `code` is the whole template file; `problems` empty means the template passed every gate. */
export type Check = (code: string) => Promise<{ ok: boolean; problems: string[] }>;

/** The API of `manim/templates/_base.py` and the rules a template must follow. */
export function buildAuthorSystem(example: string): string {
  return [
    'You write ONE Manim Community 0.21 scene file (a "template") for a silent teaching clip. The clip is already specified in TypeScript: you are given its chapters (ids and planned times), the preset parameters and the numbers the scene must display. Reply with the Python file in one ```python fenced block and nothing else.',
    'Rules (a template that breaks one is rejected by an AST check before it runs):',
    '- Imports allowed: manim, numpy, math and `_base`. No os, sys, subprocess, open, eval, exec, getattr, setattr, files, network, or any name starting with double underscore.',
    '- One class that subclasses `_base.ClipScene`. Set `TEMPLATE_REV = 1` and `CHAPTERS = [(id, startSec, endSec), ...]` exactly as given. Read the parameters from `self.params` (a dict). Put the numbers the scene displays in `self.display` (a dict with exactly the keys you are given, computed by YOUR OWN formulas from the parameters, never copied).',
    '- Time: play the animations of a chapter with `self.sequence(chapter_id, [(animations, weight), ...], hold=2.0)`; the weights share the time up to the closing hold. A step is `(list_of_animations, weight)`, or `(lambda: [...], weight)` when it uses `.animate` (build it lazily: several `.animate` on one object created together break). The closing hold must be 1.5 to 4 seconds, and no picture may stand still for more than 4 seconds, so keep the steps moving (Create, Write, FadeIn, Indicate, Transform, trackers).',
    '- Text: only letters, formulas and numbers; no sentences. `tex(latex, size, color, tag)` makes a MathTex (size at least 28). At most 12 text objects at once, none overlapping, all inside the frame (14.2 x 8) with a 0.3 margin. Use one MathTex with several parts for a table of numbers. Fade a text out before another takes its place.',
    '- Do not use Create/FadeIn/Indicate on an object made by `always_redraw`: draw a static copy first, then swap in the live one.',
    '- Helpers: `P(x, y)` a scene point, `View(points, box=(cx, cy, w, h), cap)` maps problem coordinates into the picture, `line_in_box`, `plot`, colours WHITE BLUE_D GREEN_D RED_D YELLOW_D.',
    '- The scene must be correct mathematics: draw what the chapter says, with the real values of the parameters.',
    'A working template for another clip, as a model of the style:',
    '```python',
    example.trimEnd(),
    '```',
  ].join('\n');
}

export function buildAuthorPrompt(brief: Brief, mod: ClipModule): string {
  const preset = mod.entry.presets.find((p) => p.id === brief.presetId);
  if (!preset) throw new Error(`brief ${brief.id}: no preset ${brief.presetId} in ${mod.entry.id}`);
  const display = mod.expectedDisplay(preset.input as never);
  return [
    `Request: ${brief.text}`,
    '',
    `Clip id: ${mod.entry.id}. File name: ${mod.entry.id.replace(/-/g, '_')}.py. Class name: any.`,
    `Parameters (self.params) for the check render: ${JSON.stringify(preset.input)}`,
    `Input spec of all parameters: ${JSON.stringify(mod.entry.inputSpec)}`,
    `self.display must have exactly these keys; for this preset the values are: ${JSON.stringify(display)}`,
    'CHAPTERS = [',
    ...mod.entry.chapters.map(
      (c) =>
        `  (${JSON.stringify(c.id)}, ${c.startSec}, ${c.endSec}),  # ${c.label['en-US'] ?? ''}`,
    ),
    ']',
    '',
    'What the teacher says around each chapter (the picture must show what is said):',
    ...mod.entry.chapters.map(
      (c) =>
        `- ${c.id}: before "${c.before['en-US'] ?? ''}" / after "${c.after['en-US'] ?? ''}"${c.caption ? ` / caption "${c.caption['en-US']}"` : ''}`,
    ),
  ].join('\n');
}

export function buildRepairPrompt(problems: readonly string[]): string {
  return [
    'The file you wrote failed the checks below. Fix every one and reply with the complete corrected file in one ```python block.',
    ...problems.slice(0, 12).map((p) => `- ${p}`),
  ].join('\n');
}

/** The first ```python fence of an answer (or the first fence), or null. */
export function extractPython(answer: string): string | null {
  const m =
    answer.match(/```(?:python|py)\s*\n([\s\S]*?)```/) ?? answer.match(/```\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() + '\n' : null;
}

export interface BriefResult {
  brief: string;
  clipId: string;
  /** round (1-based) of the first success, or null */
  solvedAt: number | null;
  rounds: { problems: string[] }[];
  usage: Usage;
}

export async function authorOne(
  brief: Brief,
  mod: ClipModule,
  deps: { llm: Llm; check: Check; example: string; maxRounds?: number },
): Promise<BriefResult> {
  const system = buildAuthorSystem(deps.example);
  const first = buildAuthorPrompt(brief, mod);
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const rounds: { problems: string[] }[] = [];
  let transcript = first;
  for (let round = 1; round <= (deps.maxRounds ?? MAX_ROUNDS); round++) {
    const out = await deps.llm({ system, prompt: transcript });
    usage.inputTokens += out.usage?.inputTokens ?? 0;
    usage.outputTokens += out.usage?.outputTokens ?? 0;
    const code = extractPython(out.text);
    const verdict =
      code === null
        ? { ok: false, problems: ['the answer has no ```python block'] }
        : await deps.check(code);
    rounds.push({ problems: verdict.ok ? [] : verdict.problems });
    if (verdict.ok)
      return { brief: brief.id, clipId: brief.clipId, solvedAt: round, rounds, usage };
    transcript = `${first}\n\nYour previous attempt:\n\`\`\`python\n${code ?? out.text}\n\`\`\`\n\n${buildRepairPrompt(verdict.problems)}`;
  }
  return { brief: brief.id, clipId: brief.clipId, solvedAt: null, rounds, usage };
}

export interface Report {
  briefs: number;
  rsr1: number;
  rsr3: number;
  tokens: Usage;
  tokensPerSolved: number | null;
  failed: string[];
  pass: boolean;
}

/** RSR@k = share of briefs solved in at most k rounds. A partial run (fewer briefs than planned) can never pass. */
export function summarise(results: readonly BriefResult[], planned: number): Report {
  const n = results.length;
  const within = (k: number) =>
    results.filter((r) => r.solvedAt !== null && r.solvedAt <= k).length;
  const tokens = results.reduce(
    (a, r) => ({
      inputTokens: a.inputTokens + r.usage.inputTokens,
      outputTokens: a.outputTokens + r.usage.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
  const solved = within(MAX_ROUNDS);
  const rsr3 = n === 0 ? 0 : solved / n;
  return {
    briefs: n,
    rsr1: n === 0 ? 0 : within(1) / n,
    rsr3,
    tokens,
    tokensPerSolved:
      solved === 0 ? null : Math.round((tokens.inputTokens + tokens.outputTokens) / solved),
    failed: results.filter((r) => r.solvedAt === null).map((r) => r.brief),
    pass: n === planned && rsr3 >= TARGET_RSR3,
  };
}

export const formatReport = (r: Report): string =>
  [
    `Briefs: ${r.briefs}`,
    `RSR@1: ${(r.rsr1 * 100).toFixed(1)}%   RSR@3: ${(r.rsr3 * 100).toFixed(1)}% (target ${TARGET_RSR3 * 100}%)`,
    `Tokens: ${r.tokens.inputTokens} in, ${r.tokens.outputTokens} out; per solved brief: ${r.tokensPerSolved ?? 'n/a'}`,
    r.failed.length ? `Not solved: ${r.failed.join(', ')}` : 'Every brief was solved.',
    `RESULT: ${r.pass ? 'PASS' : 'FAIL'} (the mathematical correctness of the solved ones still needs the math panel: card 3A-17)`,
  ].join('\n');
