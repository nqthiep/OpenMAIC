/**
 * Turns what OmniRoute lists at `/v1/models` into what the role pickers show, and builds the
 * suggested sets of four. OmniRoute lists models for providers nobody connected too (web and CLI
 * ones that need no key), so single models are kept only for the providers of the connections the
 * key may use. Combos and `auto/*` are always kept: they only route to those connections.
 */
import type { ModelGroup, OmniRouteModelItem, PresetId, RoleChoice, RoleId } from './contract';
import { ROLE_IDS } from './contract';

const MAX_SINGLE_MODELS = 400;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;

function groupOf(id: string, owner: string): ModelGroup {
  if (id === 'auto' || id.startsWith('auto/')) return 'auto';
  return owner === 'combo' ? 'combo' : 'model';
}

function toItem(raw: Record<string, unknown>): OmniRouteModelItem | undefined {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return undefined;
  const owner = typeof raw.owned_by === 'string' ? raw.owned_by : '';
  const group = groupOf(id, owner);
  const base = {
    id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : id,
    group,
    owner: group === 'model' ? owner : 'combo',
    contextWindow: positive(raw.context_length),
    outputWindow: positive(raw.max_output_tokens),
  };
  if (group === 'model') {
    const capabilities = record(raw.capabilities);
    const modalities = Array.isArray(raw.input_modalities) ? raw.input_modalities : [];
    return {
      ...base,
      // OmniRoute states ability in two places that do not always agree; either one counts.
      vision: capabilities.vision === true || modalities.includes('image'),
      tools: capabilities.tool_calling === true,
    };
  }
  // A combo or `auto/*` has no capabilities of its own: the name can say images, nothing more.
  return {
    ...base,
    vision: group === 'auto' && /vision|multimodal/i.test(id) ? true : null,
    tools: null,
  };
}

/**
 * The picker list: `auto/*`, then combos, then the single models of `providers` (the providers of
 * the connections the key may use). `models` is OmniRoute's own list.
 */
export function buildItems(
  models: readonly Record<string, unknown>[],
  providers: ReadonlySet<string>,
): OmniRouteModelItem[] {
  const items = models.flatMap((raw) => toItem(raw) ?? []);
  const keep = (item: OmniRouteModelItem) => item.group !== 'model' || providers.has(item.owner);
  const kept = items.filter(keep);
  const single = kept.filter((item) => item.group === 'model').slice(0, MAX_SINGLE_MODELS);
  return [
    ...kept.filter((item) => item.group === 'auto'),
    ...kept.filter((item) => item.group === 'combo'),
    ...single,
  ];
}

/**
 * Ids tried in order for each role in each suggestion. They are names OmniRoute 3.8.52 lists for
 * `auto/*`; a name it does not list is skipped, and a suggestion that cannot fill all four roles
 * is not offered.
 */
const PRESET_IDS: Record<PresetId, Record<RoleId, readonly string[]>> = {
  balanced: {
    generate: ['auto/best-vision', 'auto/vision', 'auto/multimodal'],
    chat: ['auto/best-chat', 'auto/chat', 'auto'],
    grade: ['auto/best-reasoning', 'auto/smart', 'auto/reasoning'],
    utility: ['auto/cheap', 'auto/thrifty', 'auto/best-fast'],
  },
  economy: {
    generate: ['auto/best-vision', 'auto/vision', 'auto/multimodal'],
    chat: ['auto/cheap', 'auto/thrifty', 'auto/fast'],
    grade: ['auto/cheap', 'auto/thrifty', 'auto/best-reasoning'],
    utility: ['auto/cheap', 'auto/thrifty', 'auto/best-fast'],
  },
  quality: {
    generate: ['auto/best-vision', 'auto/vision', 'auto/multimodal'],
    chat: ['auto/pro-chat', 'auto/best-chat', 'auto/chat'],
    grade: ['auto/pro-reasoning', 'auto/best-reasoning', 'auto/reasoning'],
    utility: ['auto/best-fast', 'auto/fast', 'auto/cheap'],
  },
};

/** What an item implies for a role: images only when its name says so, tools assumed. */
export function choiceFor(item: OmniRouteModelItem): RoleChoice {
  return {
    model: item.id,
    vision: item.vision === true,
    tools: item.tools !== false,
    ...(item.contextWindow ? { contextWindow: item.contextWindow } : {}),
  };
}

export function buildPresets(
  items: readonly OmniRouteModelItem[],
): Partial<Record<PresetId, Record<RoleId, RoleChoice>>> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const presets: Partial<Record<PresetId, Record<RoleId, RoleChoice>>> = {};
  for (const [preset, roles] of Object.entries(PRESET_IDS) as [
    PresetId,
    (typeof PRESET_IDS)[PresetId],
  ][]) {
    const filled: Partial<Record<RoleId, RoleChoice>> = {};
    for (const role of ROLE_IDS) {
      const found = roles[role].map((id) => byId.get(id)).find((item) => item !== undefined);
      if (found) filled[role] = choiceFor(found);
    }
    if (ROLE_IDS.every((role) => filled[role]))
      presets[preset] = filled as Record<RoleId, RoleChoice>;
  }
  return presets;
}
