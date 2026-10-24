import { clientKeysAllowed } from '@/lib/server/authz/provider-keys';
import { requireSpender } from '@/lib/server/authz/viewer';
import { attachInteractiveState } from '@/lib/chat/pi/interactive-state-evidence';
/**
 * Pi Director Chat API Endpoint
 *
 * POST /api/chat/pi - default path for running the in-class multi-agent chain
 * as a single server-side Pi agent loop. The build-time flag can disable this
 * route together with the corresponding client path for legacy rollback.
 */

import { NextRequest } from 'next/server';
import { isProviderKeyRequired } from '@/lib/ai/providers';
import {
  isCoursewareReferenceEnabled,
  isPiChatEnabled,
  isPiNativeChildRuntimeEnabled,
  isPiNativeChildSpotlightEnabled,
} from '@/lib/config/feature-flags';
import { createLogger } from '@/lib/logger';
import {
  describeUnexpectedError,
  MODEL_FAILURE_TEXT,
  visitorErrorText,
} from '@/lib/server/error-summary';
import {
  getPiMaxActionsPerAgent,
  getPiMaxAgentTurns,
  resolveAgentConfigs,
} from '@/lib/chat/pi/config';
import { runPiDirectorLoop } from '@/lib/chat/pi/director-loop';
import type { SendEvent } from '@/lib/chat/pi/types';
import { resolveModel } from '@/lib/server/resolve-model';
import { parseUserStageRoutes } from '@/lib/server/model-routes';
import { apiError } from '@/lib/server/api-response';
import type { ThinkingConfig } from '@/lib/types/provider';
import type { StatelessChatRequest } from '@/lib/types/chat';
import { resolveClassroomWebSearchConfig } from '@/lib/server/web-search-config';
import { resolveLearnerKeyForRequest } from '@/lib/persistence/server-auth';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { createWhiteboardRuntimeService } from '@/lib/whiteboard/runtime/store';
import { hasNativeWhiteboardAction } from '@/lib/chat/pi/tools/native-whiteboard';
import {
  ELEMENT_REFERENCE_ACCEPTED_HEADER,
  ElementReferenceValidationError,
  resolveElementReference,
} from '@/lib/chat/pi/element-reference';
import { readBoundedJson } from '@/lib/server/bounded-json';

const log = createLogger('Pi Chat API');

export const maxDuration = 300;

/**
 * Largest chat request body, refused before it is buffered. The client sends
 * the message history, which may carry attached images as data URLs.
 */
const PI_CHAT_REQUEST_MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const denied = await requireSpender(req.headers);
  if (denied) return denied;

  if (!isPiChatEnabled()) {
    return apiError('INVALID_REQUEST', 404, 'Pi chat runtime is disabled');
  }

  const encoder = new TextEncoder();
  let chatModel: string | undefined;
  let chatMessageCount: number | undefined;
  let managedKey = false;

  try {
    const read = await readBoundedJson(req, PI_CHAT_REQUEST_MAX_BYTES);
    if (!read.ok) {
      return read.code === 'PAYLOAD_TOO_LARGE'
        ? apiError(
            'PAYLOAD_TOO_LARGE',
            413,
            `request body exceeds ${PI_CHAT_REQUEST_MAX_BYTES} bytes`,
          )
        : apiError('INVALID_REQUEST', 400, 'request body must be valid JSON');
    }
    const body: StatelessChatRequest = read.value as StatelessChatRequest;
    chatModel = body.model;
    chatMessageCount = body.messages?.length;

    if (!body.messages || !Array.isArray(body.messages)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: messages');
    }

    if (!body.storeState) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: storeState');
    }

    if (!body.config || body.config.agentIds == null) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: config.agentIds');
    }

    if (
      (body.elementReference !== undefined || body.interactiveState !== undefined) &&
      !isCoursewareReferenceEnabled()
    ) {
      return apiError('INVALID_REQUEST', 400, 'Courseware references are disabled');
    }

    let elementReference;
    let interactiveStateNote;
    try {
      ({ elementReference, stateNote: interactiveStateNote } = attachInteractiveState(
        body,
        resolveElementReference(body),
      ));
    } catch (error) {
      if (error instanceof ElementReferenceValidationError) {
        return apiError(
          'INVALID_REQUEST',
          400,
          error.message,
          undefined,
          body.elementReference?.kind === 'whiteboard_element'
            ? 'whiteboard_reference_changed'
            : undefined,
        );
      }
      throw error;
    }

    const agentIds = body.config.agentIds;
    if (
      !Array.isArray(agentIds) ||
      agentIds.length === 0 ||
      agentIds.some((id) => typeof id !== 'string' || id.trim().length === 0 || id !== id.trim()) ||
      new Set(agentIds).size !== agentIds.length
    ) {
      return apiError(
        'INVALID_REQUEST',
        400,
        'config.agentIds must be a non-empty array of unique, non-empty strings',
      );
    }

    const keysAllowed = await clientKeysAllowed(req.headers);
    const {
      model: languageModel,
      apiKey: resolvedApiKey,
      providerId,
      modelInfo,
      thinkingConfig: resolvedThinkingConfig,
      managedKey: operatorKeyUsed,
    } = await resolveModel({
      modelString: body.model,
      stage: 'chat-adapter',
      userRoutes: keysAllowed ? parseUserStageRoutes(req.headers.get('x-model-routes')) : undefined,
      apiKey: keysAllowed ? body.apiKey : undefined,
      baseUrl: keysAllowed ? body.baseUrl : undefined,
      providerType: body.providerType,
      // Let resolveModel arbitrate thinking too: a routed chat-adapter's thinking
      // wins, an unrouted one honors this client thinking (see resolve-model.ts).
      thinkingConfig: body.thinkingConfig ?? body.thinking,
    });
    managedKey = operatorKeyUsed;

    if (isProviderKeyRequired(providerId) && !resolvedApiKey) {
      return apiError('MISSING_API_KEY', 401, 'API Key is required');
    }

    const agentConfigs = resolveAgentConfigs(body);
    const resolvedAgentIds = new Set(agentConfigs.map((agent) => agent.id));
    const unresolvedAgentIds = agentIds.filter((id) => !resolvedAgentIds.has(id));
    if (unresolvedAgentIds.length > 0) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `Unknown classroom agents in config.agentIds: ${unresolvedAgentIds.join(', ')}`,
      );
    }
    if (agentConfigs.length === 0) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `No valid classroom agents found for config.agentIds: ${body.config.agentIds.join(', ')}`,
      );
    }

    const signal = req.signal;
    const abortController = new AbortController();
    signal.addEventListener('abort', () => abortController.abort(), { once: true });

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const send: SendEvent = async (event) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    };

    const thinkingConfig: ThinkingConfig = resolvedThinkingConfig ?? {
      mode: 'disabled',
      enabled: false,
    };

    const maxAgentTurns = getPiMaxAgentTurns(body);
    const maxActionsPerAgent = getPiMaxActionsPerAgent(body);
    const enableWhiteboardTools = body.config.piEnableWhiteboardTools === true;
    const childRuntimeMode = isPiNativeChildRuntimeEnabled() ? 'native' : 'legacy';
    const enableNativeChildSpotlight = isPiNativeChildSpotlightEnabled();
    const requestStartStageId = body.storeState.stage?.id;
    const validRequestStartStageId =
      typeof requestStartStageId === 'string' &&
      requestStartStageId.length > 0 &&
      requestStartStageId === requestStartStageId.trim()
        ? requestStartStageId
        : undefined;
    const nativeWhiteboardRequested = agentConfigs.some((agent) =>
      hasNativeWhiteboardAction(agent.allowedActions),
    );
    let nativeWhiteboardService: ReturnType<typeof createWhiteboardRuntimeService> | undefined;
    let nativeWhiteboardLearnerKey: string | undefined;
    if (
      childRuntimeMode === 'native' &&
      enableWhiteboardTools &&
      nativeWhiteboardRequested &&
      validRequestStartStageId &&
      process.env.NEXT_PUBLIC_PERSISTENCE === '1' &&
      process.env.DATABASE_URL
    ) {
      try {
        // A signed-in request is partitioned by its session and never by the
        // x-learner-key header. Anonymous requests keep the development binding,
        // which still needs its token. A session that cannot be checked throws
        // here, so the whiteboard is left out and no partition is taken from the header.
        const learnerKey = await resolveLearnerKeyForRequest(req.headers);
        if (learnerKey) {
          const provider = await getServerPersistenceProvider(process.env.DATABASE_URL);
          nativeWhiteboardLearnerKey = learnerKey;
          nativeWhiteboardService = createWhiteboardRuntimeService({
            store: provider.runtimeStore,
            resolveLearnerKey: () => learnerKey,
          });
        }
      } catch {
        log.warn('Native whiteboard capability unavailable: persistence or session check failed');
      }
    }
    let nativeWebSearchConfig: ReturnType<typeof resolveClassroomWebSearchConfig>;
    try {
      nativeWebSearchConfig =
        childRuntimeMode === 'native'
          ? resolveClassroomWebSearchConfig({
              webSearchProviderId: body.webSearchProviderId,
              webSearchApiKey: keysAllowed ? body.webSearchApiKey : undefined,
              webSearchBaseUrl: keysAllowed ? body.webSearchBaseUrl : undefined,
              webSearchModelId: body.webSearchModelId,
              baiduSubSources: body.baiduSubSources,
            })
          : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid Web Search configuration';
      return apiError('INVALID_REQUEST', 400, message);
    }

    log.info(
      `Pi request agents=${body.config.agentIds.join(', ')} messages=${body.messages.length} maxAgentTurns=${maxAgentTurns}`,
    );

    (async () => {
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const startHeartbeat = () => {
        heartbeatTimer = setInterval(() => {
          writer.write(encoder.encode(`:heartbeat\n\n`)).catch(() => stopHeartbeat());
        }, 15_000);
      };
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      try {
        startHeartbeat();

        await runPiDirectorLoop({
          body,
          elementReference,
          interactiveStateNote,
          agentConfigs,
          send,
          languageModel,
          thinkingConfig,
          maxOutputTokens: modelInfo?.outputWindow,
          contextWindow: modelInfo?.contextWindow,
          abortSignal: abortController.signal,
          signal,
          maxAgentTurns,
          maxActionsPerAgent,
          enableWhiteboardTools,
          childRuntimeMode,
          enableNativeChildSpotlight,
          nativeWebSearchConfig,
          nativeWhiteboardService,
          nativeWhiteboardStageId: nativeWhiteboardService ? validRequestStartStageId : undefined,
          nativeWhiteboardLearnerKey,
          requestStartManualVisibilityRevision:
            Number.isSafeInteger(body.storeState.whiteboardManualVisibilityRevision) &&
            (body.storeState.whiteboardManualVisibilityRevision ?? -1) >= 0
              ? body.storeState.whiteboardManualVisibilityRevision
              : 0,
        });

        if (signal.aborted) {
          stopHeartbeat();
          await writer.close();
          return;
        }

        stopHeartbeat();
        await writer.close();
      } catch (error) {
        stopHeartbeat();

        if (signal.aborted) {
          try {
            await writer.close();
          } catch {
            /* already closed */
          }
          return;
        }

        log.error(`Pi chat stream error: ${describeUnexpectedError(error)}`);
        try {
          await send({
            type: 'error',
            data: { message: visitorErrorText(error, managedKey, MODEL_FAILURE_TEXT) },
          });
          await writer.close();
        } catch {
          /* writer may already be closed */
        }
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...(elementReference ? { [ELEMENT_REFERENCE_ACCEPTED_HEADER]: '1' } : {}),
      },
    });
  } catch (error) {
    log.error(
      `Pi chat request failed [model=${chatModel ?? 'unknown'}, messages=${chatMessageCount ?? 0}]: ${describeUnexpectedError(error)}`,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      visitorErrorText(error, managedKey, 'Failed to process request'),
    );
  }
}
