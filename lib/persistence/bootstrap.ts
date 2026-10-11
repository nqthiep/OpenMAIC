import {
  BrowserKVStore,
  HttpAssetStore,
  HttpDocumentStore,
  type HttpAssetHeadersHook,
  type HttpDocumentHeadersHook,
} from '@openmaic/storage';
import { HttpRuntimeStore, type HttpRuntimeHeadersHook } from '@openmaic/storage/runtime/http';
import { SESSION_ENDED_EVENT, watchForEndedSessions } from './session-end';

import {
  assertDocumentStorageConfigurable,
  configureDocumentStorage,
  type DocumentStorageOptions,
} from '@/lib/document-store/config';
import {
  assertAssetPoolStorageConfigurable,
  configureAssetPoolStorage,
  type AssetPoolStorageOptions,
} from '@/lib/media/asset-pool-config';
import { assertRuntimeStorageConfigurable, configureRuntimeStorage } from '@/lib/runtime/config';
import { getLearnerKey } from '@/lib/runtime/learner-key';

let deviceKv: BrowserKVStore | undefined;
let learnerKeyPromise: Promise<string> | undefined;
let learnerKeyReadAt = 0;

/**
 * A session can end while the page is open: signed out in another tab, or expired.
 * The memoised key is re-read after this long, and whenever the window regains focus,
 * so requests stop carrying a key the server no longer accepts.
 */
const LEARNER_KEY_MAX_AGE_MS = 5 * 60 * 1000;

export function isBrowserPersistenceEnabled(): boolean {
  return typeof window !== 'undefined' && process.env.NEXT_PUBLIC_PERSISTENCE === '1';
}

/** Same-origin account session route (app/api/auth/session). */
const ACCOUNT_SESSION_PATH = '/api/auth/session';

interface AccountSessionBody {
  readonly success: true;
  readonly enabled: boolean;
  readonly authenticated: boolean;
  readonly learnerKey?: unknown;
}

function isAccountSessionBody(value: unknown): value is AccountSessionBody {
  if (value === null || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return (
    body.success === true &&
    typeof body.enabled === 'boolean' &&
    typeof body.authenticated === 'boolean'
  );
}

/**
 * Reads the account session. A transport failure, a non-2xx status or a
 * malformed body rejects: the caller must not guess which learner this is.
 */
async function readAccountSession(): Promise<AccountSessionBody> {
  const response = await fetch(ACCOUNT_SESSION_PATH, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Account session request failed with HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isAccountSessionBody(body)) {
    throw new Error('Account session response is malformed');
  }
  return body;
}

/**
 * A signed-in account's partition key, otherwise the device key. A signed-in
 * learner never falls back to the device key: those writes would land in a
 * partition that the account cannot reach.
 */
async function resolveLearnerKey(): Promise<string> {
  const session = await readAccountSession();
  if (session.enabled && session.authenticated) {
    if (typeof session.learnerKey === 'string' && session.learnerKey.length > 0) {
      return session.learnerKey;
    }
    throw new Error('Signed-in account session carries no learner key');
  }
  return getLearnerKey((deviceKv ??= new BrowserKVStore()));
}

function forgetLearnerKey(): void {
  learnerKeyPromise = undefined;
}

export function getPersistenceLearnerKey(): Promise<string> {
  if (!isBrowserPersistenceEnabled()) {
    return Promise.reject(new Error('Browser persistence is not enabled'));
  }
  if (learnerKeyPromise && Date.now() - learnerKeyReadAt > LEARNER_KEY_MAX_AGE_MS) {
    forgetLearnerKey();
  }
  // Memoised until it goes stale. A rejection clears the memo so the next
  // caller retries the session read rather than inheriting the failure.
  if (!learnerKeyPromise) {
    learnerKeyReadAt = Date.now();
    learnerKeyPromise = resolveLearnerKey().catch((error) => {
      forgetLearnerKey();
      throw error;
    });
  }
  return learnerKeyPromise;
}

export async function getPersistenceRequestHeaders(): Promise<Record<string, string>> {
  if (!isBrowserPersistenceEnabled()) return {};
  const resolvedLearnerKey = await getPersistenceLearnerKey();
  const token = process.env.NEXT_PUBLIC_PERSISTENCE_TOKEN;
  return {
    'x-learner-key': resolvedLearnerKey,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

if (isBrowserPersistenceEnabled()) {
  const learnerKey = getPersistenceLearnerKey;
  const headers = getPersistenceRequestHeaders;

  // Returning to the page is when a sign-out made in another tab shows up, so the key is re-read then.
  if (typeof window !== 'undefined') {
    window.addEventListener?.('focus', forgetLearnerKey);
    // A server-reported end of session also drops the memoised key, and every API response is watched for it.
    window.addEventListener?.(SESSION_ENDED_EVENT, forgetLearnerKey);
    if (typeof window.fetch === 'function') watchForEndedSessions(window);
  }

  const runtimeOptions = {
    store: () =>
      new HttpRuntimeStore({
        baseUrl: '/api/persistence',
        headers: headers satisfies HttpRuntimeHeadersHook,
      }),
    learnerKey,
  };
  const documentOptions: DocumentStorageOptions = {
    store: ({ validateScene, validateStage }) =>
      new HttpDocumentStore({
        baseUrl: '/api/persistence',
        headers: headers satisfies HttpDocumentHeadersHook,
        validateScene,
        validateStage,
      }),
  };
  // The document outlives the browser that produced it, so the media it
  // references must too: generated bytes go to the same endpoint under the
  // same credentials, and the document holds the id the pool allocated.
  // `serverBacked` is what tells local-cache cleanup that these refs are not
  // this browser's to delete.
  const assetOptions: AssetPoolStorageOptions = {
    store: () =>
      new HttpAssetStore({
        baseUrl: '/api/persistence',
        headers: headers satisfies HttpAssetHeadersHook,
      }),
    serverBacked: true,
  };
  try {
    // All checks are mutation-free. Once they pass, the synchronous configure
    // calls cannot leave only a subset of the persistence seams configured.
    assertRuntimeStorageConfigurable();
    assertDocumentStorageConfigurable();
    assertAssetPoolStorageConfigurable();
    configureRuntimeStorage(runtimeOptions);
    configureDocumentStorage(documentOptions);
    configureAssetPoolStorage(assetOptions);
  } catch (error) {
    console.error(
      'FATAL: server-backed persistence bootstrap failed; no storage seam changes were applied',
      error,
    );
  }
}
