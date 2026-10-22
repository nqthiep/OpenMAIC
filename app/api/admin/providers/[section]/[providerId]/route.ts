import { apiError, apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { applyChange } from '@/lib/server/provider-store/admin';
import {
  deleteCredential,
  listCredentialViews,
  MasterKeyMissingError,
  saveCredential,
  SecretUnreadableError,
  VersionConflictError,
} from '@/lib/server/provider-store/store';
import { isProviderSection } from '@/lib/server/provider-store/types';
import { isVersion, parseCredentialBody } from '@/lib/server/provider-store/validate';

export const runtime = 'nodejs';

type Params = { params: Promise<{ section: string; providerId: string }> };

/** Largest body accepted: a key, a few URLs and a model list. */
const BODY_MAX_BYTES = 64 * 1024;

/**
 * Saves one provider. Body: { expectedVersion, enabled?, baseUrl?, models?, secret? }. A field left
 * out keeps its stored value; `null` clears it. `secret` holds apiKey, accessKeyId, accessKeySecret
 * and proxy, each text or null. `expectedVersion` is the version the form was loaded with (0 for a
 * new provider); a stale one is refused with 409. Administrators only.
 */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const { section, providerId } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      if (!isProviderSection(section)) return invalid('Unknown section');
      const body = await bodyOf(request, BODY_MAX_BYTES);
      if (!body.ok) return body.response;
      const parsed = await parseCredentialBody(section, providerId, body.body);
      if (!parsed.ok) return invalid(parsed.message);
      try {
        await saveCredential(ctx.db, {
          ...parsed.save,
          actorId: ctx.viewer.accountId!,
          now: ctx.now,
        });
      } catch (error) {
        if (error instanceof VersionConflictError) {
          return apiError('VERSION_CONFLICT', 409, error.message);
        }
        if (error instanceof MasterKeyMissingError) {
          return apiError('MASTER_KEY_MISSING', 500, error.message);
        }
        if (error instanceof SecretUnreadableError) {
          return apiError('SECRET_UNREADABLE', 409, error.message);
        }
        throw error;
      }
      await applyChange(ctx.db);
      const row = (await listCredentialViews(ctx.db)).find(
        (view) => view.section === section && view.providerId === providerId,
      );
      return apiSuccess({ row });
    },
    { mutating: true },
  );
}

/** Removes one provider and its key. Optional `?version=` makes a stale delete fail. Administrators only. */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { section, providerId } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'provider.manage');
      if (refusal) return refusal;
      if (!isProviderSection(section)) return invalid('Unknown section');
      const versionText = new URL(request.url).searchParams.get('version');
      const expectedVersion = versionText === null ? undefined : Number(versionText);
      if (expectedVersion !== undefined && !isVersion(expectedVersion)) {
        return invalid('version must be a whole number');
      }
      const removed = await deleteCredential(ctx.db, {
        section,
        providerId,
        expectedVersion,
        actorId: ctx.viewer.accountId!,
        now: ctx.now,
      });
      if (!removed) return apiError('NOT_FOUND', 404, 'No such provider, or it was changed.');
      await applyChange(ctx.db);
      return apiSuccess({ removed: true });
    },
    { mutating: true },
  );
}
