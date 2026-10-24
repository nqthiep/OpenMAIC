import { requireSpender } from '@/lib/server/authz/viewer';
/**
 * Scene Actions Generation API
 *
 * Generates actions for a scene given its outline and content,
 * then assembles the complete Scene object.
 * This is the second half of the two-step scene generation pipeline.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  generateSceneActions,
  buildCompleteScene,
  buildVisionUserContent,
  type SceneGenerationContext,
  type AgentInfo,
} from '@openmaic/generation';
import type { SceneOutline } from '@/lib/types/generation';
import type {
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
} from '@/lib/types/generation';
import type { SpeechAction } from '@/lib/types/action';
import type { PBLContent } from '@/lib/types/stage';
import { createLogger } from '@/lib/logger';
import { normalizeLegacyPBLContent } from '@/lib/pbl/legacy/read';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { llmApiError } from '@/lib/server/llm-error-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { readBoundedJson } from '@/lib/server/bounded-json';

const log = createLogger('Scene Actions API');

export const maxDuration = 60;

/** Largest scene-actions request body, refused before it is buffered. One outline plus its generated content. */
const SCENE_ACTIONS_MAX_BYTES = 1024 * 1024;

export async function POST(req: NextRequest) {
  const denied = await requireSpender(req.headers);
  if (denied) return denied;

  let outlineTitle: string | undefined;
  let resolvedModelString: string | undefined;
  try {
    const read = await readBoundedJson(req, SCENE_ACTIONS_MAX_BYTES);
    if (!read.ok) {
      return read.code === 'PAYLOAD_TOO_LARGE'
        ? apiError(
            'PAYLOAD_TOO_LARGE',
            413,
            `request body exceeds ${SCENE_ACTIONS_MAX_BYTES} bytes`,
          )
        : apiError('INVALID_REQUEST', 400, 'request body must be valid JSON');
    }
    const body = read.value;
    const {
      outline,
      allOutlines,
      content,
      stageId,
      agents,
      previousSpeeches: incomingPreviousSpeeches,
      userProfile,
      languageDirective,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      content:
        | GeneratedSlideContent
        | GeneratedQuizContent
        | GeneratedInteractiveContent
        | GeneratedPBLContent
        | PBLContent;
      stageId: string;
      agents?: AgentInfo[];
      previousSpeeches?: string[];
      userProfile?: string;
      languageDirective?: string;
    };

    // Validate required fields
    if (!outline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!content) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'content is required');
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    // ── Model resolution from request headers/body ──
    const {
      model: languageModel,
      modelInfo,
      modelString,
      thinkingConfig,
      serverManaged,
    } = await resolveModelFromRequest(req, body, 'scene-actions');
    outlineTitle = outline?.title;
    resolvedModelString = modelString;

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // AI call function (actions typically don't use vision, but kept for consistency)
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
            maxRetries: 0,
          },
          'scene-actions',
          undefined,
          thinkingConfig,
          { serverManaged },
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
          maxRetries: 0,
        },
        'scene-actions',
        undefined,
        thinkingConfig,
        { serverManaged },
      );
      return result.text;
    };

    // ── Build cross-scene context ──
    const allTitles = allOutlines.map((o) => o.title);
    const pageIndex = allOutlines.findIndex((o) => o.id === outline.id);
    const ctx: SceneGenerationContext = {
      pageIndex: (pageIndex >= 0 ? pageIndex : 0) + 1,
      totalPages: allOutlines.length,
      allTitles,
      previousSpeeches: incomingPreviousSpeeches ?? [],
    };

    // ── Generate actions ──
    log.info(`Generating actions: type=${outline.type} [model=${modelString}]`);

    const generationContent = (
      'type' in content && content.type === 'pbl' ? normalizeLegacyPBLContent(content) : content
    ) as
      | GeneratedSlideContent
      | GeneratedQuizContent
      | GeneratedInteractiveContent
      | GeneratedPBLContent;

    const actions = await generateSceneActions(outline, generationContent, aiCall, {
      ctx,
      agents,
      userProfile,
      languageDirective,
    });

    log.info(`Generated ${actions.length} actions`);

    // ── Build complete scene ──
    const scene = buildCompleteScene(outline, generationContent, actions, stageId);

    if (!scene) {
      log.error(`Failed to build scene: "${outline.title}"`);

      return apiError('GENERATION_FAILED', 500, `Failed to build scene: ${outline.title}`);
    }

    // ── Extract speeches for cross-scene coherence ──
    const outputPreviousSpeeches = (scene.actions || [])
      .filter((a): a is SpeechAction => a.type === 'speech')
      .map((a) => a.text);

    log.info(
      `Scene assembled successfully: "${outline.title}" — ${scene.actions?.length ?? 0} actions`,
    );

    return apiSuccess({ scene, previousSpeeches: outputPreviousSpeeches });
  } catch (error) {
    log.error(
      `Scene actions generation failed [scene="${outlineTitle ?? 'unknown'}", model=${resolvedModelString ?? 'unknown'}]:`,
      error,
    );
    return llmApiError(error);
  }
}
