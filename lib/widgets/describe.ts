/**
 * Static digest of a walkthrough scene for the tutor prompt (ADR 0013 decisions 6 and 8).
 * From the scene we read only keys and numbers (`walkthroughId`, `presetId`, `locale`, hashes);
 * every word in the digest is looked up in the catalog, never taken from html or `widgetConfig`.
 * With a runtime state {preset, frame} and a scene that is not stale vs the catalog, the digest
 * describes that frame, rebuilt from the catalog via `steps` (task 1c-02).
 * Server-side only: the staleness check hashes with node:crypto.
 */
import { entryContentHash, framesHash } from '@/lib/tutor/catalog/hash';
import { msg } from '@/lib/tutor/catalog/messages';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
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

type Msgs = Parameters<typeof msg>[0];

/**
 * Same comparison as `provider.isStale` (entryRev, contentHash, per-preset framesHash), but
 * returns the frames of `presetId` on the way; null when stale or when `steps` throws.
 */
function freshFrames(
  ref: WalkthroughRef,
  entry: AnyWalkthroughEntry,
  presetId: string,
): readonly Frame<unknown>[] | null {
  if (ref.entryRev !== entry.entryRev || ref.contentHash !== entryContentHash(entry)) return null;
  if (ref.presets.length !== entry.presets.length) return null;
  let wanted: readonly Frame<unknown>[] | null = null;
  for (const p of entry.presets) {
    const frames = steps(entry, p.input, { locale: ref.locale });
    if (ref.presets.find((r) => r.id === p.id)?.framesHash !== framesHash(frames)) return null;
    if (p.id === presetId) wanted = frames;
  }
  return wanted;
}

function describeFrame(
  entry: AnyWalkthroughEntry,
  presetId: string,
  frames: readonly Frame<unknown>[],
  requested: number,
  locale: string,
): string[] {
  const t = (m: Msgs) => msg(m, locale);
  const k = Math.min(
    Math.max(Number.isFinite(requested) ? Math.trunc(requested) : 0, 0),
    frames.length - 1,
  );
  const { meta } = frames[k];
  const preset = entry.presets.find((p) => p.id === presetId)!;
  const lines = [
    `Walkthrough: ${t(entry.title)} (${entry.id})`,
    `Preset: ${t(preset.label)}; frame ${k + 1} of ${frames.length}`,
    `Explanation: ${meta.explanation}`,
  ];
  const { pseudo, impl, map } = entry.code;
  const line = meta.codeLine;
  if (line !== undefined && pseudo[line - 1] !== undefined) {
    lines.push(`Pseudocode line ${line}: ${pseudo[line - 1]}`);
    for (const [name, lang] of [
      ['C++', 'cpp'],
      ['Python', 'py'],
    ] as const) {
      const code = (map[lang][line] ?? [])
        .filter((n) => impl[lang][n - 1] !== undefined)
        .map((n) => `${n}: ${impl[lang][n - 1]}`);
      if (code.length) lines.push(`${name} ${code.join(' | ')}`);
    }
  }
  const vars = Object.entries(meta.vars ?? {}).map(([n, v]) => `${n}=${v}`);
  if (vars.length) lines.push(`Variables: ${vars.join(', ')}`);

  // nearest beat at or before frame k (the last beat tag of the nearest tagged frame)
  const defs = new Map(entry.beatDefs.map((d) => [d.id, d]));
  for (let i = k; i >= 0; i--) {
    const tags = (frames[i].meta.tags ?? []).filter((x) => x.startsWith('beat:'));
    const def = tags.length ? defs.get(tags[tags.length - 1].slice('beat:'.length)) : undefined;
    if (!def) continue;
    lines.push(`Beat: ${t(def.label)}`);
    (def.hints ?? []).forEach((h, n) => lines.push(`Hint ${n + 1}: ${t(h)}`));
    for (const x of def.misconceptions ?? []) lines.push(`Common mistake: ${t(x)}`);
    break;
  }
  return lines;
}

export function describeWalkthrough(
  scene: unknown,
  runtime: WidgetRuntimeState | undefined,
  deps: DescribeDeps,
): string {
  const ref = readWalkthroughRef(scene);
  const entry = ref && deps.findWalkthrough(ref.walkthroughId);
  if (!ref || !entry) return 'Interactive walkthrough (no longer in the catalog).';

  const t = (m: Msgs) => msg(m, ref.locale);
  if (
    runtime &&
    runtime.preset !== 'student' &&
    entry.presets.some((p) => p.id === runtime.preset)
  ) {
    let frames: readonly Frame<unknown>[] | null = null;
    try {
      frames = freshFrames(ref, entry, runtime.preset);
    } catch {
      // a catalog entry that cannot run: fall back to the static digest
    }
    if (frames?.length) {
      return describeFrame(entry, runtime.preset, frames, runtime.frame, ref.locale)
        .join('\n')
        .slice(0, MAX_DIGEST_CHARS);
    }
  }

  const current = entry.presets.find((p) => p.id === ref.presetId);
  const lines = [
    `Walkthrough: ${t(entry.title)} (${entry.id})`,
    ...(current ? [`Current preset: ${t(current.label)}`] : []),
    `Presets: ${entry.presets.map((p) => t(p.label)).join('; ')}`,
    'Key steps:',
    ...entry.beatDefs.map((b) => {
      const hint = b.hints?.[0];
      return `- ${t(b.label)}${hint ? ` (hint: ${t(hint)})` : ''}`;
    }),
  ];
  return lines.join('\n').slice(0, MAX_DIGEST_CHARS);
}
