'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createObservationSession } from '@/lib/interactive/observation-bridge';
import { createPortal } from 'react-dom';
import { useWidgetIframeStore } from '@/lib/store/widget-iframe';
import {
  useInteractiveIframePool,
  type IframePoolEntry,
} from '@/lib/store/interactive-iframe-pool';
import { useSceneRuntimeErrors } from '@/lib/store/scene-runtime-errors';
import { useStageStore } from '@/lib/store/stage';
import { useWidgetRuntimeState } from '@/lib/store/widget-runtime-state';
import { useTutorLearningLog } from '@/lib/tutor/use-learning-log';
import { parseInbound, parseWidgetEvent } from '@/lib/tutor/protocol/messages';
import type { Scene } from '@/lib/types/stage';
import { isWalkthroughContent } from '@/lib/widgets/policy';
import {
  GENUI_LOGICAL_HEIGHT,
  GENUI_LOGICAL_WIDTH,
  fitGenUiViewport,
} from '@/lib/interactive/logical-viewport';
import { intersectClientBoxes } from '@/lib/edit/visible-client-rect';
import { useCanvasStore } from '@/lib/store/canvas';
import { useElementRefsStore } from '@/lib/store/element-refs';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  ELEMENT_REF_SELECTOR_MAX,
  ELEMENT_SNAPSHOT_MAX,
  INTERACTIVE_OUTERHTML_MAX,
  makeInteractiveElementRef,
} from '@/lib/workbench/element-refs';
import { InteractiveRuntimeErrorBanner } from './InteractiveRuntimeErrorBanner';

type InteractivePickerMessage = {
  __maicInteractive?: boolean;
  kind?: string;
  mode?: unknown;
  selector?: unknown;
  outerHTML?: unknown;
  text?: unknown;
};

type ElementPickerMode = 'editor' | 'playback-stable-id';

export function resolveInteractivePickerMode(
  editorArmed: boolean,
  playbackArmed: boolean,
): ElementPickerMode | null {
  if (playbackArmed) return 'playback-stable-id';
  if (editorArmed) return 'editor';
  return null;
}

export type PlaybackInteractivePickerState = {
  readonly sceneId: string;
  readonly active: boolean;
  readonly selectedSelector?: string;
};

export type PlaybackInteractiveComponentPick = {
  readonly sceneId: string;
  readonly selector: string;
};

const PLAYBACK_STABLE_ID_SELECTOR = /^#[A-Za-z][A-Za-z0-9_-]{0,126}$/u;

export function handlePlaybackInteractivePickerMessage(
  sceneId: string,
  armed: boolean,
  data: InteractivePickerMessage | undefined,
  onPick: (pick: PlaybackInteractiveComponentPick) => void,
  onCancel: () => void,
): boolean {
  if (!armed || !data || data.__maicInteractive !== true || data.mode !== 'playback-stable-id') {
    return false;
  }
  if (data.kind === 'element-picker-disarmed') {
    onCancel();
    return true;
  }
  if (
    data.kind !== 'element-picked' ||
    typeof data.selector !== 'string' ||
    !PLAYBACK_STABLE_ID_SELECTOR.test(data.selector)
  ) {
    return false;
  }
  onPick({ sceneId, selector: data.selector });
  return true;
}

/** Validate an untrusted iframe picker message and apply it to host-owned state. */
export function handleInteractivePickerMessage(
  sceneId: string,
  data: InteractivePickerMessage | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): boolean {
  if (!data || data.__maicInteractive !== true || data.mode !== 'editor') return false;
  const target = useCanvasStore.getState().pickTarget;
  const armed = target?.purpose === 'element-ref' && target.sceneId === sceneId;
  if (data.kind === 'element-picker-disarmed') {
    if (armed) useCanvasStore.getState().setPickTarget(null);
    return armed;
  }
  if (data.kind !== 'element-picked' || !armed) return false;
  if (
    typeof data.selector !== 'string' ||
    typeof data.outerHTML !== 'string' ||
    typeof data.text !== 'string'
  ) {
    return false;
  }
  const selector = data.selector.slice(0, ELEMENT_REF_SELECTOR_MAX);
  const outerHTML = data.outerHTML.slice(0, INTERACTIVE_OUTERHTML_MAX);
  const text = data.text.slice(0, ELEMENT_SNAPSHOT_MAX);
  if (!selector.trim() || !outerHTML.trim()) return false;
  const refsStore = useElementRefsStore.getState();
  if (refsStore.ownerSessionId !== target.ownerSessionId) return false;
  refsStore.toggle(
    makeInteractiveElementRef(target.stageId, sceneId, { selector, outerHTML, text }, t),
  );
  return true;
}

/** `walkthroughId` of a scene whose `widgetConfig.kind === 'walkthrough'`, else null. */
export function walkthroughIdOf(scene: Scene | undefined): string | null {
  if (!scene || !isWalkthroughContent(scene.content)) return null;
  const id = (scene.content as { widgetConfig?: { walkthroughId?: unknown } }).widgetConfig
    ?.walkthroughId;
  return typeof id === 'string' ? id : null;
}

/** `widgetConfig.presets` (id, total) of a walkthrough scene, or undefined when absent. */
export function walkthroughPresetsOf(
  scene: Scene | undefined,
): { id: string; total: number }[] | undefined {
  if (walkthroughIdOf(scene) === null) return undefined;
  const presets = (scene?.content as { widgetConfig?: { presets?: unknown } }).widgetConfig
    ?.presets;
  if (!Array.isArray(presets)) return undefined;
  return presets.flatMap((p) =>
    typeof p?.id === 'string' && Number.isInteger(p.total) && p.total >= 0
      ? [{ id: p.id as string, total: p.total as number }]
      : [],
  );
}

/**
 * Handle a `widget-ready` / `widget-state` message from a walkthrough iframe (INTERFACES §2).
 * The caller has already checked `e.source`. `ready` re-sends the last desired state via `post`.
 */
export function handleWidgetEvent(
  sceneId: string,
  walkthroughId: string,
  data: unknown,
  post: (type: string, payload: Record<string, unknown>) => void,
  configPresets?: readonly { id: string; total: number }[],
): boolean {
  const ev = parseWidgetEvent(data);
  if (!ev || ev.walkthroughId !== walkthroughId) return false;
  const runtime = useWidgetRuntimeState.getState();
  if (ev.kind === 'widget-ready') {
    const desired = runtime.markReady(sceneId, ev.presets, configPresets);
    if (desired) {
      post('SET_WIDGET_STATE', {
        state: desired.state,
        ...(desired.content !== undefined ? { content: desired.content } : {}),
      });
    }
  } else {
    runtime.recordState(sceneId, ev);
  }
  return true;
}

/**
 * Stable host for interactive scene iframes (#619).
 *
 * Mounted once at the `Stage` root — outside the mode-swap / scene subtree that
 * unmounts and remounts — so the iframe elements it renders survive Pro mode
 * toggles, scene switches, and any PlaybackChromeRoot remount. The in-tree
 * `InteractiveRenderer` is only a placeholder that registers content and reports
 * the on-screen rect; the actual iframes live here, portaled into a stable host
 * node and positioned over each scene's rect via `position: fixed`.
 *
 * Portal target follows `document.fullscreenElement` so the iframe stays inside
 * the fullscreen subtree during presentation mode (which calls requestFullscreen
 * on the playback stage, not on body); otherwise it lives on `document.body`.
 * A low z-index keeps it under Radix dialogs (e.g. the scene-switch confirm)
 * while still covering the canvas box during interactive playback AND Pro-mode
 * editing — the editor agent fixes interactive HTML, so the teacher must see the
 * live page while editing. Visibility is driven by the placeholder's ownership
 * (gone → hidden, never unmounted), so the document is preserved for a
 * zero-reload return.
 */
export function InteractiveIframeHost({
  playbackPicker,
  onPlaybackPick,
  onPlaybackCancel,
}: {
  readonly playbackPicker?: PlaybackInteractivePickerState | null;
  readonly onPlaybackPick?: (pick: PlaybackInteractiveComponentPick) => void;
  readonly onPlaybackCancel?: () => void;
}) {
  useTutorLearningLog();
  const entries = useInteractiveIframePool((s) => s.entries);
  const activeSceneId = useInteractiveIframePool((s) => s.activeSceneId);
  const reset = useInteractiveIframePool((s) => s.reset);
  const setActiveScene = useWidgetIframeStore((s) => s.setActiveScene);

  // Portal into the fullscreen element when one is active (presentation mode
  // fullscreens the stage, and a body-portaled iframe would not be part of that
  // subtree, so it would vanish). Falls back to body otherwise.
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  useEffect(() => {
    const sync = () => setPortalTarget(document.fullscreenElement ?? document.body);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // Keep the messaging store's active scene in lock-step (its legacy fallback
  // path resolves the current widget by active scene when no id is passed).
  useEffect(() => {
    setActiveScene(activeSceneId);
  }, [activeSceneId, setActiveScene]);

  // The host is mounted once per classroom (inside Stage). When it unmounts —
  // e.g. on classroom switch — drop the pool so a new classroom doesn't briefly
  // render the previous one's stale iframes.
  useEffect(() => reset, [reset]);

  if (!portalTarget) return null;

  return createPortal(
    <>
      {Object.entries(entries).map(([sceneId, entry]) => (
        <PooledIframe
          key={sceneId}
          sceneId={sceneId}
          entry={entry}
          visible={entry.owner !== null && sceneId === activeSceneId}
          playbackArmed={Boolean(playbackPicker?.active && playbackPicker.sceneId === sceneId)}
          playbackSelectedSelector={
            playbackPicker?.sceneId === sceneId ? playbackPicker.selectedSelector : undefined
          }
          onPlaybackPick={onPlaybackPick}
          onPlaybackCancel={onPlaybackCancel}
        />
      ))}
    </>,
    portalTarget,
  );
}

interface PooledIframeProps {
  readonly sceneId: string;
  readonly entry: IframePoolEntry;
  readonly visible: boolean;
  readonly playbackArmed: boolean;
  readonly playbackSelectedSelector?: string;
  readonly onPlaybackPick?: (pick: PlaybackInteractiveComponentPick) => void;
  readonly onPlaybackCancel?: () => void;
}

/**
 * One persisted iframe. Stays mounted as long as its pool entry exists (only
 * evicted by LRU), so its document is preserved across scene/mode changes.
 * `srcDoc` / `src` come straight from the entry and only change when the
 * content changes — that is the single intended reload path.
 *
 * Security: the sandbox intentionally omits `allow-same-origin`.
 * Combining `allow-scripts` with `allow-same-origin` on a srcDoc iframe
 * effectively negates sandbox protections — the embedded document is treated
 * as same-origin with the parent and can access cookies, localStorage, and
 * the parent DOM. Since the HTML may originate from LLM output or imported
 * classroom JSON, keeping the iframe in a unique (null) origin prevents
 * any embedded script from reaching the host application's state.
 * postMessage communication (the only parent↔iframe channel used here)
 * works correctly with a null origin because the host sends with
 * targetOrigin='*'.
 */
function PooledIframe({
  sceneId,
  entry,
  visible,
  playbackArmed,
  playbackSelectedSelector,
  onPlaybackPick,
  onPlaybackCancel,
}: PooledIframeProps) {
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const runtimeErrors = useSceneRuntimeErrors((state) => state.errors[sceneId]);
  const runtimeErrorSignature = runtimeErrors?.join('\n') ?? '';
  const [dismissedRuntimeSignature, setDismissedRuntimeSignature] = useState<string | null>(null);
  // `srcDoc` already carries every shim, the observation reader included; the
  // reader is installed for each pooled document and one that publishes no
  // outlet answers `no-interface`. This reads the identity baked into that
  // document rather than minting a second, disagreeing one.
  const observation = { html: entry.srcDoc, identity: entry.observationIdentity };
  const observationSession = useRef<ReturnType<typeof createObservationSession> | null>(null);
  const registerObservation = useWidgetIframeStore((s) => s.registerObservation);
  useLayoutEffect(() => {
    observationSession.current?.dispose();
    observationSession.current = null;
    registerObservation(sceneId, async (sourceHtml, signal) => {
      const pool = useInteractiveIframePool.getState();
      const current = pool.entries[sceneId];
      if (
        pool.activeSceneId !== sceneId ||
        !current?.owner ||
        current.sourceHtml !== sourceHtml ||
        current.srcDoc !== entry.srcDoc
      )
        return undefined;
      const session = observationSession.current;
      if (!session) return undefined;
      const moved = new AbortController();
      const unsubscribe = useInteractiveIframePool.subscribe((next) => {
        if (
          next.activeSceneId !== sceneId ||
          next.entries[sceneId]?.owner !== current.owner ||
          next.entries[sceneId]?.srcDoc !== entry.srcDoc
        )
          moved.abort();
      });
      let result;
      try {
        result = await session.capture({ signal: AbortSignal.any([signal, moved.signal]) });
      } finally {
        unsubscribe();
      }
      if (moved.signal.aborted) return undefined;
      const latest = useInteractiveIframePool.getState();
      if (
        latest.activeSceneId !== sceneId ||
        !latest.entries[sceneId]?.owner ||
        latest.entries[sceneId]?.srcDoc !== entry.srcDoc ||
        observationSession.current !== session ||
        !session.isActive()
      )
        return undefined;
      return result;
    });
    return () => {
      observationSession.current?.dispose();
      observationSession.current = null;
      registerObservation(sceneId, null);
    };
  }, [sceneId, entry.srcDoc, registerObservation]);
  /** The latest `HIGHLIGHT_ELEMENT` asked before the walkthrough said `widget-ready`. */
  const pendingHighlight = useRef<Record<string, unknown> | null>(null);
  // Only walkthrough scenes use the ready handshake; every other widget is unchanged.
  const walkthroughId = useStageStore((s) =>
    walkthroughIdOf(s.scenes.find((x) => x.id === sceneId)),
  );
  const registerIframe = useWidgetIframeStore((s) => s.registerIframe);
  const markIframeReady = useWidgetIframeStore((s) => s.markIframeReady);
  const getSendMessage = useWidgetIframeStore((s) => s.getSendMessage);
  const pickTarget = useCanvasStore.use.pickTarget();
  const refs = useElementRefsStore.use.refs();
  const editorArmed = pickTarget?.purpose === 'element-ref' && pickTarget.sceneId === sceneId;
  const effectiveMode = resolveInteractivePickerMode(editorArmed, playbackArmed);
  const selectors = useMemo(
    () =>
      refs.flatMap((ref) =>
        ref.kind === 'interactive-element' && ref.sceneId === sceneId ? [ref.selector] : [],
      ),
    [refs, sceneId],
  );
  const documentToken = entry.srcDoc ? `srcDoc:${entry.srcDoc}` : `src:${entry.src ?? ''}`;

  // Register the postMessage callback for this scene (moved here from the
  // placeholder, since the iframe now lives in the host). Stable per scene:
  // the callback reads contentWindow lazily at send time.
  useLayoutEffect(() => {
    const post = (type: string, payload: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage({ type, ...payload }, '*');
    };
    const send = (type: string, payload: Record<string, unknown>) => {
      if (walkthroughId && type === 'SET_WIDGET_STATE') {
        // Walkthrough: remember the last request; hold it until the iframe says `widget-ready`.
        const msg = parseInbound({ type, ...payload });
        if (msg?.type !== 'SET_WIDGET_STATE') return;
        useWidgetRuntimeState.getState().setDesired(sceneId, msg);
        if (!useWidgetRuntimeState.getState().byScene[sceneId]?.ready) {
          // a question asked now would be lost (one-shot): keep it for `widget-ready`, the engine is waiting for its answer
          if (msg.state.predict)
            useWidgetRuntimeState.getState().holdPredict(sceneId, msg.state.predict.beatId);
          return;
        }
      }
      if (walkthroughId && type === 'HIGHLIGHT_ELEMENT') {
        // a flash sent before the page listens would be dropped: keep the latest one for `widget-ready`
        if (!useWidgetRuntimeState.getState().byScene[sceneId]?.ready) {
          pendingHighlight.current = payload;
          return;
        }
      }
      post(type, payload);
    };
    return registerIframe(sceneId, send, documentToken);
  }, [documentToken, sceneId, registerIframe, walkthroughId]);

  useEffect(() => {
    const send = getSendMessage(sceneId);
    if (!send) return;
    send(effectiveMode ? 'element-picker:arm' : 'element-picker:disarm', {
      mode: effectiveMode,
    });
    return () => {
      if (effectiveMode) send('element-picker:disarm', { mode: effectiveMode });
    };
  }, [effectiveMode, entry.srcDoc, getSendMessage, sceneId]);

  useEffect(() => {
    getSendMessage(sceneId)?.('element-picker:sync', {
      mode: playbackSelectedSelector ? 'playback-stable-id' : effectiveMode,
      selectors: effectiveMode === 'editor' ? selectors : [],
      selectedSelector: playbackSelectedSelector ?? null,
    });
  }, [effectiveMode, entry.srcDoc, getSendMessage, playbackSelectedSelector, sceneId, selectors]);

  // Capture runtime errors the iframe's error shim posts out (see iframe.ts).
  // The active scene's banner reads this store. Matched to THIS iframe by
  // event.source (sandboxed null-origin iframes still postMessage to the parent).
  //
  // The errors that matter most (a JSON.parse that aborts setup) fire while srcDoc
  // parses — possibly BEFORE this passive effect subscribes. The shim buffers every
  // error and re-emits it on request, so after subscribing we ask for a replay to
  // recover anything posted pre-subscription. Re-subscribed per document version
  // (entry.srcDoc) so each fresh page gets its own replay request; addError dedups
  // the live + replayed copies. iframeRef is read lazily, so the handler is stable.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as
        | (InteractivePickerMessage & { errorKind?: string; message?: unknown })
        | undefined;
      if (!d || d.__maicInteractive !== true) return;
      if (walkthroughId && (d.kind === 'widget-ready' || d.kind === 'widget-state')) {
        handleWidgetEvent(
          sceneId,
          walkthroughId,
          d,
          (type, payload) =>
            iframeRef.current?.contentWindow?.postMessage({ type, ...payload }, '*'),
          walkthroughPresetsOf(useStageStore.getState().scenes.find((x) => x.id === sceneId)),
        );
        if (d.kind === 'widget-ready' && pendingHighlight.current) {
          const held = pendingHighlight.current;
          pendingHighlight.current = null;
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'HIGHLIGHT_ELEMENT', ...held },
            '*',
          );
        }
        return;
      }
      if (d.kind === 'runtime-error') {
        const kind = typeof d.errorKind === 'string' ? d.errorKind : 'error';
        const msg = typeof d.message === 'string' ? d.message : String(d.message ?? '');
        useSceneRuntimeErrors.getState().addError(sceneId, `[${kind}] ${msg}`);
        return;
      }
      if (
        onPlaybackPick &&
        onPlaybackCancel &&
        handlePlaybackInteractivePickerMessage(
          sceneId,
          playbackArmed,
          d,
          onPlaybackPick,
          onPlaybackCancel,
        )
      ) {
        return;
      }
      if (effectiveMode === 'editor') handleInteractivePickerMessage(sceneId, d, t);
    };
    window.addEventListener('message', onMessage);
    iframeRef.current?.contentWindow?.postMessage({ __maicErrorReplayRequest: true }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [
    sceneId,
    walkthroughId,
    entry.srcDoc,
    effectiveMode,
    onPlaybackCancel,
    onPlaybackPick,
    playbackArmed,
    t,
  ]);

  // A content change reloads the iframe; drop the previous render's errors so the
  // captured set reflects the CURRENT page (e.g. after the agent applies a fix).
  // Same for the walkthrough handshake: a fresh document is not ready yet and has no
  // learner state (`desired` is kept and re-sent on its `widget-ready`).
  useEffect(() => {
    setDismissedRuntimeSignature(null);
    useSceneRuntimeErrors.getState().clearScene(sceneId);
    pendingHighlight.current = null;
    useWidgetRuntimeState.getState().resetIframe(sceneId);
  }, [sceneId, entry.srcDoc]);

  const rect = entry.rect;
  const clip = entry.clip ?? rect;
  const viewport = rect ? fitGenUiViewport(rect) : null;
  const visibleViewport = viewport && clip ? intersectClientBoxes(viewport.box, clip) : null;
  // Require a real measured box before showing — a null or zero-size rect means
  // the slot hasn't laid out yet; showing then would flash a 0x0 iframe pinned
  // at the viewport origin.
  const shown =
    visible &&
    rect !== null &&
    clip !== null &&
    viewport !== null &&
    visibleViewport !== null &&
    visibleViewport.width > 0 &&
    visibleViewport.height > 0 &&
    rect.width > 0 &&
    rect.height > 0;
  const latestRuntimeError = runtimeErrors?.[runtimeErrors.length - 1];
  const showRuntimeError =
    shown &&
    typeof latestRuntimeError === 'string' &&
    dismissedRuntimeSignature !== runtimeErrorSignature;
  const wrapStyle: CSSProperties = {
    position: 'fixed',
    left: visibleViewport?.left ?? 0,
    top: visibleViewport?.top ?? 0,
    width: visibleViewport?.width ?? 0,
    height: visibleViewport?.height ?? 0,
    overflow: 'hidden',
    borderRadius: '0.5rem',
    zIndex: 1,
    visibility: shown ? 'visible' : 'hidden',
    pointerEvents: shown ? 'auto' : 'none',
  };
  const iframeStyle: CSSProperties = {
    position: 'absolute',
    left: viewport && visibleViewport ? viewport.box.left - visibleViewport.left : 0,
    top: viewport && visibleViewport ? viewport.box.top - visibleViewport.top : 0,
    width: GENUI_LOGICAL_WIDTH,
    height: GENUI_LOGICAL_HEIGHT,
    border: 0,
    transform: `scale(${viewport?.scale ?? 0})`,
    transformOrigin: 'top left',
  };

  return (
    <div style={wrapStyle}>
      <iframe
        ref={iframeRef}
        srcDoc={observation.html}
        onLoad={() => {
          observationSession.current?.dispose();
          observationSession.current =
            iframeRef.current && observation.identity
              ? createObservationSession(iframeRef.current, observation.identity)
              : null;
          markIframeReady(sceneId);
        }}
        src={entry.srcDoc ? undefined : entry.src}
        style={iframeStyle}
        title={`Interactive Scene ${sceneId}`}
        sandbox="allow-scripts allow-forms allow-popups"
      />
      {showRuntimeError && latestRuntimeError ? (
        <InteractiveRuntimeErrorBanner
          message={latestRuntimeError}
          onDismiss={() => setDismissedRuntimeSignature(runtimeErrorSignature)}
        />
      ) : null}
      {playbackArmed && (
        <div
          data-testid="interactive-element-pick-instruction"
          className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gray-950/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          {t('chat.elementReference.instruction')}
        </div>
      )}
    </div>
  );
}
