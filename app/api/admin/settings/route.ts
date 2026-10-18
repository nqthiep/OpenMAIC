import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import {
  APP_SETTINGS,
  canChangeSetting,
  isAppSettingKey,
  parseSettingValue,
  readAllSettings,
  writeSetting,
  type AppSettingKey,
} from '@/lib/server/learning/settings';

export const runtime = 'nodejs';

/**
 * Deployment settings, and which of them the viewer may change (`changeable`). Staff read.
 * `canChange` is kept for the administrator-only settings.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'dashboard.view');
    if (refusal) return refusal;
    const keys = Object.keys(APP_SETTINGS) as AppSettingKey[];
    return apiSuccess({
      settings: await readAllSettings(ctx.db),
      changeable: Object.fromEntries(keys.map((key) => [key, canChangeSetting(ctx.viewer, key)])),
      canChange: can(ctx.viewer, 'settings.manage'),
    });
  });
}

/**
 * Changes one setting. Body: { key, value }. Administrator settings need an administrator, the
 * others any staff. Written to the audit log.
 */
export async function PATCH(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'dashboard.view');
      if (refusal) return refusal;
      const read = await bodyOf(request);
      if (!read.ok) return read.response;
      const { key, value } = read.body;
      if (!isAppSettingKey(key)) return invalid('Unknown setting');
      if (!canChangeSetting(ctx.viewer, key)) {
        return apiError('FORBIDDEN', 403, 'You do not have permission for this.');
      }
      const parsed = parseSettingValue(key, value);
      if (parsed === undefined) return invalid('Value not allowed for this setting');
      await writeSetting(ctx.db, {
        key,
        value: parsed,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      return apiSuccess({ key, value: parsed });
    },
    { mutating: true },
  );
}
