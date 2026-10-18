import { isLLMProviderConfigured } from '@/lib/store/settings-validation';
import { modelIdsMatch } from '@/lib/ai/model-aliases';
import type { AccountSession } from '@/components/account/account-api';

/**
 * Defaults for the learner's plain composer. The learner states a topic; the app picks the model
 * by how demanding the request looks, so a one-line question does not run on the most expensive
 * model while a long or document-backed request does.
 */
export type ModelTier = 'fast' | 'balanced' | 'strong';

// Words that mark work needing step-by-step reasoning or breadth (Vietnamese and English).
const HEAVY =
  /chứng minh|phân tích|so sánh|tổng hợp|thuật toán|lập trình|đạo hàm|tích phân|phương trình|bài toán|bài tập|đề thi|ôn thi|olympiad|prove|derive|algorithm|analy[sz]e|compare|calculus|equation/gi;

/** [Inference] A heuristic on the request text, not a measured difficulty. */
export function estimateTier(requirement: string, hasMaterials: boolean): ModelTier {
  const text = requirement.trim();
  const heavy = text.match(HEAVY)?.length ?? 0;
  const score =
    heavy * 2 +
    (text.length >= 120 ? 1 : 0) +
    (text.length >= 240 ? 2 : 0) +
    (hasMaterials ? 3 : 0);
  if (score >= 3) return 'strong';
  if (score === 0 && text.length < 50) return 'fast';
  return 'balanced';
}

/**
 * Preferred models per tier, best fit first. Ids a deployment does not offer are skipped.
 * [Unverified] Placement of the gpt-5.6 family relative to the others is a guess; edit here.
 */
export const TIER_MODELS: Record<ModelTier, readonly string[]> = {
  fast: ['deepseek-flash', 'gpt-5.4-mini', 'claude-haiku-4-5', 'gpt-5.4-nano'],
  balanced: ['claude-sonnet-5', 'gpt-5.5', 'gpt-5.4', 'deepseek-v4-pro', 'claude-sonnet-4-6'],
  strong: ['claude-opus-5', 'gpt-5.6', 'gpt-5.4-pro', 'claude-opus-4-8'],
};

// Fall back to the nearest tier that has an offered model: up first for a hard request (quality
// matters more), down first for an easy one (cost matters more).
const FALLBACK: Record<ModelTier, readonly ModelTier[]> = {
  fast: ['fast', 'balanced', 'strong'],
  balanced: ['balanced', 'fast', 'strong'],
  strong: ['strong', 'balanced', 'fast'],
};

export interface ModelChoice {
  providerId: string;
  modelId: string;
}

type ProviderCfg = Parameters<typeof isLLMProviderConfigured>[0] & {
  serverModels?: string[];
};

/** The models a learner may use: those of usable providers, narrowed to the server's list. */
export function usableModels(providersConfig: Record<string, ProviderCfg>): ModelChoice[] {
  const out: ModelChoice[] = [];
  for (const [providerId, config] of Object.entries(providersConfig)) {
    if (!isLLMProviderConfigured(config)) continue;
    const limited = config.isServerConfigured && !config.apiKey && config.serverModels?.length;
    for (const model of config.models) {
      if (limited && !config.serverModels!.some((id) => modelIdsMatch(providerId, model.id, id))) {
        continue;
      }
      out.push({ providerId, modelId: model.id });
    }
  }
  return out;
}

/** The model for a tier among `available`, or `current` when none of the preferred ones is offered. */
export function pickModel(
  tier: ModelTier,
  available: readonly ModelChoice[],
  current: ModelChoice,
): ModelChoice {
  for (const candidateTier of FALLBACK[tier]) {
    for (const id of TIER_MODELS[candidateTier]) {
      const hit = available.find((m) => m.modelId === id);
      if (hit) return hit;
    }
  }
  return current;
}

const workingImageProviders = new Set<string>();

/**
 * Whether the selected image provider passes the server's connectivity check. A deployment can list
 * a provider whose credentials or endpoint are wrong (a 401 from another vendor's endpoint, say), and
 * enabling illustrations then makes every image in the lesson fail. Only a pass is remembered, so a
 * provider that was down is checked again on the next send.
 */
export async function imageProviderWorks(
  providerId: string,
  modelId: string,
  config?: { apiKey?: string; baseUrl?: string },
): Promise<boolean> {
  const key = `${providerId}:${modelId}`;
  if (workingImageProviders.has(key)) return true;
  try {
    const response = await fetch('/api/verify-image-provider', {
      method: 'POST',
      headers: {
        'x-image-provider': providerId,
        'x-image-model': modelId,
        'x-api-key': config?.apiKey || '',
        'x-base-url': config?.baseUrl || '',
      },
    });
    const body = await response.json();
    if (body?.success !== true) return false;
    workingImageProviders.add(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Provider and model choices in the composer are for operators and administrators. With accounts
 * off there is one local user, who keeps them. False while the session is unknown.
 */
export function canChooseProvider(session: AccountSession | null | undefined): boolean {
  return session?.enabled === false || session?.role === 'operator' || session?.role === 'admin';
}
