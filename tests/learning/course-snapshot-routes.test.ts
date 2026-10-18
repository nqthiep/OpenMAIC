import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const ROUTE_TIMEOUT_MS = 60_000;
const COURSE = 'course-alice-fractions';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 4, 5, 6]);

class PGlitePool {
  constructor(private readonly database: PGlite) {}
  query(text: string, params?: unknown[]) {
    return this.database.query(text, params);
  }
}

let db: PGlite | undefined;
let workDir = '';

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await ensureAccountSchema(new PGlitePool(db));
  await ensureLearningSchema(new PGlitePool(db));
}, ROUTE_TIMEOUT_MS);

beforeEach(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'));
  // Classroom files and snapshots live under `<cwd>/data`; keep them in a scratch folder.
  vi.spyOn(process, 'cwd').mockReturnValue(workDir);
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://snapshot-route-test');
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  await db!.exec(
    'TRUNCATE course_snapshots, course_share_rejections, course_shares, memberships, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(workDir, { recursive: true, force: true });
  await db?.close();
  db = undefined;
});

async function loadRoutes() {
  const pool = new PGlitePool(db!);
  vi.doMock('@/lib/persistence/server-provider', () => ({
    getServerPersistenceProvider: async () => ({ pool }),
  }));
  const [register, share, list, decide, storage] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/courses/[id]/share/route'),
    import('@/app/api/admin/shares/route'),
    import('@/app/api/admin/shares/[id]/route'),
    import('@/lib/server/classroom-storage'),
  ]);
  return {
    register: register.POST,
    shareGet: share.GET,
    sharePost: share.POST,
    pending: list.GET,
    decide: decide.POST,
    storage,
  };
}

type Routes = Awaited<ReturnType<typeof loadRoutes>>;

function jsonRequest(body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}/api/x`, { method: 'POST', headers, body: JSON.stringify(body) });
}

function zipRequest(bytes: Uint8Array, cookie: string): Request {
  return new Request(`${ORIGIN}/api/x`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip', cookie },
    body: new Blob([bytes as BlobPart]),
  });
}

async function signUp(routes: Routes, username: string, member = false) {
  const response = await routes.register(jsonRequest({ username, password: PASSWORD }));
  const id = (
    await db!.query<{ id: string }>('SELECT id FROM accounts WHERE username = $1', [username])
  ).rows[0]!.id;
  if (member) {
    await db!.query(
      `INSERT INTO memberships (account_id, status, expires_at, monthly_token_quota, granted_by)
       VALUES ($1, 'active', now() + interval '30 days', 1000000, 'root')`,
      [id],
    );
  }
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='))!
    .split(';')[0]!;
  return { cookie, ownerId: `acct:${id}` };
}

function slide(elements: unknown[]) {
  return {
    id: 'canvas',
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: { backgroundColor: '#fff', themeColors: ['#000'], fontColor: '#000', fontName: 'Inter' },
    elements,
  };
}

async function packageZip(name: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      formatVersion: 1,
      exportedAt: '2026-10-18T00:00:00.000Z',
      appVersion: 'test',
      stage: { name, createdAt: 1, updatedAt: 2 },
      agents: [],
      scenes: [
        {
          type: 'slide',
          title: 'Intro',
          order: 0,
          content: {
            type: 'slide',
            canvas: slide([
              {
                type: 'image',
                id: 'img-1',
                src: 'asset-private-1',
                left: 0,
                top: 0,
                width: 10,
                height: 10,
              },
              {
                type: 'image',
                id: 'img-2',
                src: 'asset-missing',
                left: 0,
                top: 0,
                width: 10,
                height: 10,
              },
              {
                type: 'image',
                id: 'img-3',
                src: 'https://example.com/a.png',
                left: 0,
                top: 0,
                width: 10,
                height: 10,
              },
            ]),
          },
          actions: [
            { id: 'speech-1', type: 'speech', text: 'Hello', audioRef: 'audio/audio-1.mp3' },
          ],
        },
        {
          type: 'slide',
          title: 'New part',
          order: 1,
          content: { type: 'slide', canvas: slide([]) },
        },
      ],
      mediaIndex: {
        'media/asset-1.png': { type: 'image', sourceRef: 'asset-private-1', mimeType: 'image/png' },
        'audio/audio-1.mp3': { type: 'audio', sourceRef: 'audio-ref-1', mimeType: 'audio/mpeg' },
      },
    }),
  );
  zip.file('media/asset-1.png', PNG);
  zip.file('audio/audio-1.mp3', MP3);
  return zip.generateAsync({ type: 'uint8array' });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route bodies vary
async function json(response: Response): Promise<{ status: number; body: any }> {
  return { status: response.status, body: await response.clone().json() };
}

describe('sharing an edited course as a package', () => {
  it(
    'keeps the package for review, publishes it on approval, and handles an update',
    async () => {
      const routes = await loadRoutes();
      const root = await signUp(routes, 'root');
      const alice = await signUp(routes, 'alice', true);
      const bob = await signUp(routes, 'bob', true);
      await routes.storage.persistClassroom(
        {
          id: COURSE,
          stage: { id: COURSE, name: 'Fractions', createdAt: 1, updatedAt: 1 },
          scenes: [
            {
              id: 'scene-intro',
              stageId: COURSE,
              type: 'slide',
              title: 'Intro',
              order: 0,
              content: { type: 'slide', canvas: slide([]) },
            },
          ] as never,
        },
        '',
        { ownerId: alice.ownerId },
      );

      const v2 = await packageZip('Fractions v2');
      expect((await routes.sharePost(zipRequest(v2, bob.cookie), params(COURSE))).status).toBe(403);
      const notZip = await routes.sharePost(
        zipRequest(new TextEncoder().encode('nope'), alice.cookie),
        params(COURSE),
      );
      expect(notZip.status).toBe(400);

      const sent = await json(await routes.sharePost(zipRequest(v2, alice.cookie), params(COURSE)));
      expect(sent.body).toMatchObject({ state: 'pending', updatePending: false });
      const queue = await json(
        await routes.pending(
          new NextRequest(`${ORIGIN}/api/admin/shares?state=pending`, {
            headers: { cookie: root.cookie },
          }),
        ),
      );
      expect(queue.body.shares).toMatchObject([
        {
          courseId: COURSE,
          update: false,
          snapshot: { name: 'Fractions v2', sceneCount: 2, mediaCount: 2 },
        },
      ]);
      // Nothing reaches readers before approval.
      expect((await routes.storage.readClassroom(COURSE))!.stage.name).toBe('Fractions');

      const approved = await routes.decide(
        jsonRequest({ decision: 'approve' }, root.cookie),
        params(COURSE),
      );
      expect(approved.status).toBe(200);
      const published = (await routes.storage.readClassroom(COURSE))!;
      expect(published.stage.name).toBe('Fractions v2');
      expect(published.scenes.map((s) => [s.id === 'scene-intro', s.title])).toEqual([
        [true, 'Intro'],
        [false, 'New part'],
      ]);
      const elements = (published.scenes[0]!.content as { canvas: { elements: { src: string }[] } })
        .canvas.elements;
      expect(elements[0]!.src).toMatch(
        new RegExp(`^/api/classroom-media/${COURSE}/media/snap-[0-9a-f]{64}\\.png$`),
      );
      expect(elements[1]!.src).toBe('');
      expect(elements[2]!.src).toBe('https://example.com/a.png');
      const speech = published.scenes[0]!.actions![0] as { audioUrl?: string };
      expect(speech.audioUrl).toMatch(
        new RegExp(`^/api/classroom-media/${COURSE}/audio/snap-[0-9a-f]{64}\\.mp3$`),
      );
      const imageFile = path.join(
        workDir,
        'data',
        'classrooms',
        COURSE,
        'media',
        path.basename(elements[0]!.src),
      );
      expect(new Uint8Array(await readFile(imageFile))).toEqual(PNG);
      await expect(
        stat(path.join(workDir, 'data', 'course-snapshots', `${COURSE}.maic.zip`)),
      ).rejects.toThrow();

      // An update waits for review while readers keep the approved version; a rejection says why.
      const v3 = await packageZip('Fractions v3');
      const update = await json(
        await routes.sharePost(zipRequest(v3, alice.cookie), params(COURSE)),
      );
      expect(update.body).toMatchObject({ state: 'shared', updatePending: true });
      const updates = await json(
        await routes.pending(
          new NextRequest(`${ORIGIN}/api/admin/shares?state=pending`, {
            headers: { cookie: root.cookie },
          }),
        ),
      );
      expect(updates.body.shares).toMatchObject([{ courseId: COURSE, update: true }]);
      await routes.decide(
        jsonRequest({ decision: 'reject', reason: 'Scene 2 is empty' }, root.cookie),
        params(COURSE),
      );
      expect((await routes.storage.readClassroom(COURSE))!.stage.name).toBe('Fractions v2');
      const ownerView = await json(
        await routes.shareGet(
          new Request(`${ORIGIN}/x`, { headers: { cookie: alice.cookie } }),
          params(COURSE),
        ),
      );
      expect(ownerView.body).toMatchObject({
        state: 'shared',
        updatePending: false,
        rejection: { reason: 'Scene 2 is empty' },
      });
      const audit = await db!.query<{ action: string }>(
        `SELECT action FROM account_admin_audit ORDER BY id`,
      );
      expect(audit.rows.map((r) => r.action)).toEqual(['share:approve', 'share:update-reject']);
    },
    ROUTE_TIMEOUT_MS,
  );
});
