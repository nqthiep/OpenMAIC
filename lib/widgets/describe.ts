/**
 * Static digest of a walkthrough scene for the tutor prompt (ADR 0013 decisions 6 and 8).
 * From the scene we read only keys and numbers (`walkthroughId`, `presetId`, `locale`, hashes);
 * every word in the digest is looked up in the catalog, never taken from html or `widgetConfig`.
 * Per-frame description arrives with task 1c-02.
 */
import { msg } from '@/lib/tutor/catalog/messages';
import type { AnyWalkthroughEntry, WidgetRuntimeState } from '@/lib/widgets/types';

export const MAX_DIGEST_CHARS = 2000;

export interface DescribeDeps {
  findWalkthrough(id: string): AnyWalkthroughEntry | undefined;
}

/** The keys and numbers of `widgetConfig` that identify a walkthrough scene. */
export interface WalkthroughRef {
  readonly walkthroughId: string;
  readonly entryRev: number;
  readonly contentHash: string;
  readonly presetId: string;
  readonly locale: string;
  readonly presets: readonly { readonly id: string; readonly framesHash: string }[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/** null when the scene is not a walkthrough or its config lacks any identifying key. */
export function readWalkthroughRef(scene: unknown): WalkthroughRef | null {
  const content = asRecord(asRecord(scene)?.content);
  const cfg = asRecord(content?.widgetConfig);
  if (!cfg || cfg.kind !== 'walkthrough' || !Array.isArray(cfg.presets)) return null;
  const { walkthroughId, entryRev, contentHash, presetId, locale } = cfg;
  if (
    typeof walkthroughId !== 'string' ||
    !Number.isInteger(entryRev) ||
    typeof contentHash !== 'string' ||
    typeof presetId !== 'string' ||
    typeof locale !== 'string'
  ) {
    return null;
  }
  const presets: { id: string; framesHash: string }[] = [];
  for (const p of cfg.presets) {
    const r = asRecord(p);
    if (typeof r?.id !== 'string' || typeof r.framesHash !== 'string') return null;
    presets.push({ id: r.id, framesHash: r.framesHash });
  }
  return { walkthroughId, entryRev: entryRev as number, contentHash, presetId, locale, presets };
}

export function describeWalkthrough(
  scene: unknown,
  _runtime: WidgetRuntimeState | undefined,
  deps: DescribeDeps,
): string {
  const ref = readWalkthroughRef(scene);
  const entry = ref && deps.findWalkthrough(ref.walkthroughId);
  if (!ref || !entry) return 'Interactive walkthrough (no longer in the catalog).';

  const t = (m: Parameters<typeof msg>[0]) => msg(m, ref.locale);
  const current = entry.presets.find((p) => p.id === ref.presetId);
  const lines = [
    `Walkthrough: ${t(entry.title)} (${entry.id})`,
    ...(current ? [`Current preset: ${t(current.label)}`] : []),
    `Presets: ${entry.presets.map((p) => t(p.label)).join('; ')}`,
    `Key steps: ${entry.beatDefs.map((b) => t(b.label)).join('; ')}`,
  ];
  return lines.join('\n').slice(0, MAX_DIGEST_CHARS);
}
