/**
 * The catalog as the manim-service sees it (task 3C-01): per template its revision, whether text is baked into the picture
 * and the `inputSpec` of its parameters. Constraints between parameters (`check`) are functions and stay with the app,
 * which applies them before it submits a job.
 */
import { CLIP_PROFILE } from '@/lib/clips/assets';
import { mathClipModules } from '@/lib/subjects/math/clips';
import type { InputSpec } from '@/lib/tutor/input-spec';

export interface ClipSpecs {
  profile: string;
  templates: Record<string, { templateRev: number; bakedText: boolean; inputSpec: InputSpec }>;
}

export function clipSpecs(): ClipSpecs {
  const templates: ClipSpecs['templates'] = {};
  for (const { entry } of [...mathClipModules].sort((a, b) => (a.entry.id < b.entry.id ? -1 : 1))) {
    templates[entry.id] = {
      templateRev: entry.engine.templateRev,
      bakedText: entry.bakedText,
      inputSpec: entry.inputSpec,
    };
  }
  return { profile: CLIP_PROFILE, templates };
}
