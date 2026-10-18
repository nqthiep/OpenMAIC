/**
 * Shared-course snapshots. The owner's browser packs the course it edits (the same ZIP the
 * "export classroom" menu downloads) and uploads it with a share request. The ZIP waits outside
 * the served classroom folders until staff approve; approval turns it into the classroom file
 * readers load, with its media written next to it under `/api/classroom-media/<id>/...`.
 *
 * The rewrite of media references follows the client importer (`use-import-classroom.ts`), which
 * cannot run on the server: refs listed in the manifest's media index point at the written files,
 * concrete URLs and generation placeholders stay, anything else (a private asset id) is dropped.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { nanoid } from 'nanoid';
import type { Slide } from '@openmaic/dsl';
import type { AccountQueryable } from '@/lib/server/accounts/store';
import {
  agentConfigFromManifest,
  CLASSROOM_ZIP_FORMAT_VERSION,
  type ClassroomManifest,
  type ManifestScene,
} from '@/lib/export/classroom-zip-types';
import { isGeneratedMediaPlaceholder } from '@/lib/media/media-ref';
import { CLASSROOMS_DIR, persistClassroom, readClassroom } from '@/lib/server/classroom-storage';
import type { Action } from '@/lib/types/action';
import type { Scene, Stage } from '@/lib/types/stage';

/** Largest upload accepted. A course with long videos may need more; raise it with the proxy limit. */
export const SNAPSHOT_MAX_BYTES = 150 * 1024 * 1024;
/** Largest total after unzipping, so a small ZIP cannot expand into a disk-filling one. */
const SNAPSHOT_MAX_UNZIPPED_BYTES = 400 * 1024 * 1024;
const SNAPSHOT_MAX_ENTRIES = 3000;
const SNAPSHOT_MAX_SCENES = 500;
const MANIFEST_MAX_BYTES = 30 * 1024 * 1024;

export const SNAPSHOTS_DIR = path.join(path.dirname(CLASSROOMS_DIR), 'course-snapshots');

/** Extensions the classroom-media route serves, by MIME type. Other files are skipped. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
};
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export interface SnapshotSummary {
  name: string;
  sceneCount: number;
  sceneTitles: string[];
  mediaCount: number;
  bytes: number;
}

function pendingPath(courseId: string): string {
  return path.join(SNAPSHOTS_DIR, `${courseId}.maic.zip`);
}

/** The ZIP's entries after the size checks, without decompressing anything yet. */
async function openZip(bytes: Uint8Array): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new SnapshotError('Not a ZIP file');
  }
  const files = Object.values(zip.files).filter((f) => !f.dir);
  if (files.length > SNAPSHOT_MAX_ENTRIES) throw new SnapshotError('Too many files in the ZIP');
  // `_data.uncompressedSize` comes from the central directory; it is how JSZip exposes sizes
  // before inflating. Missing sizes count as zero here and are checked again while reading.
  const declared = files.reduce(
    (sum, f) =>
      sum +
      ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0),
    0,
  );
  if (declared > SNAPSHOT_MAX_UNZIPPED_BYTES) throw new SnapshotError('The ZIP expands too large');
  return zip;
}

async function readManifest(zip: JSZip): Promise<ClassroomManifest> {
  const file = zip.file('manifest.json');
  if (!file) throw new SnapshotError('manifest.json is missing');
  const text = await file.async('string');
  if (text.length > MANIFEST_MAX_BYTES) throw new SnapshotError('manifest.json is too large');
  let manifest: ClassroomManifest;
  try {
    manifest = JSON.parse(text) as ClassroomManifest;
  } catch {
    throw new SnapshotError('manifest.json is not JSON');
  }
  const ok =
    manifest &&
    manifest.formatVersion === CLASSROOM_ZIP_FORMAT_VERSION &&
    typeof manifest.stage?.name === 'string' &&
    Array.isArray(manifest.scenes) &&
    manifest.scenes.length > 0 &&
    manifest.scenes.length <= SNAPSHOT_MAX_SCENES &&
    manifest.scenes.every(
      (s) =>
        s &&
        typeof s.title === 'string' &&
        typeof s.type === 'string' &&
        s.content !== null &&
        typeof s.content === 'object' &&
        typeof (s.content as { type?: unknown }).type === 'string',
    ) &&
    (manifest.mediaIndex === undefined ||
      (typeof manifest.mediaIndex === 'object' && manifest.mediaIndex !== null));
  if (!ok) throw new SnapshotError('manifest.json is not a classroom export');
  manifest.mediaIndex ??= {};
  manifest.agents = Array.isArray(manifest.agents) ? manifest.agents : [];
  return manifest;
}

/** Checks an uploaded ZIP and says what it holds. Throws SnapshotError when it is not usable. */
export async function summarizeSnapshot(bytes: Uint8Array): Promise<SnapshotSummary> {
  if (bytes.byteLength > SNAPSHOT_MAX_BYTES) throw new SnapshotError('The ZIP is too large');
  const manifest = await readManifest(await openZip(bytes));
  return {
    name: manifest.stage.name.trim().slice(0, 200) || 'Untitled',
    sceneCount: manifest.scenes.length,
    sceneTitles: manifest.scenes.slice(0, 50).map((s) => s.title.slice(0, 200)),
    mediaCount: Object.values(manifest.mediaIndex).filter((e) => !e?.missing).length,
    bytes: bytes.byteLength,
  };
}

/** Keeps a ref the reader can load without the owner's private store. */
function keepableRef(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (/^(https?:|data:)/i.test(value) || value.startsWith('/api/classroom-media/')) return value;
  if (isGeneratedMediaPlaceholder(value)) return value;
  return undefined;
}

function rewriteRef(value: unknown, map: ReadonlyMap<string, string>): string | undefined {
  return (typeof value === 'string' ? map.get(value) : undefined) ?? keepableRef(value);
}

function rewriteSlide(
  slide: Slide,
  media: ReadonlyMap<string, string>,
  posters: ReadonlyMap<string, string>,
  audio: ReadonlyMap<string, string>,
): Slide {
  const background =
    slide.background?.type === 'image' && slide.background.image
      ? {
          ...slide.background,
          image: {
            ...slide.background.image,
            src: rewriteRef(slide.background.image.src, media) ?? '',
          },
        }
      : slide.background;
  return {
    ...slide,
    background,
    elements: slide.elements.map((element) => {
      if (element.type === 'image')
        return { ...element, src: rewriteRef(element.src, media) ?? '' };
      if (element.type === 'audio')
        return { ...element, src: rewriteRef(element.src, audio) ?? '' };
      if (element.type !== 'video') return element;
      const key = element.mediaRef || element.src || '';
      const next = { ...element, src: rewriteRef(element.src, media) ?? '' };
      const mediaRef = element.mediaRef ? rewriteRef(element.mediaRef, media) : undefined;
      if (mediaRef) next.mediaRef = mediaRef;
      else delete next.mediaRef;
      const poster =
        (element.poster ? rewriteRef(element.poster, media) : undefined) ?? posters.get(key);
      if (poster) next.poster = poster;
      else delete next.poster;
      return next;
    }) as Slide['elements'],
  };
}

/**
 * Turns a ZIP into the classroom file of `courseId`, with its media under the course's media
 * folders. Scene ids are kept for scenes whose title matches a scene of the current version, so
 * community questions pinned to a slide stay on it. Returns the number of media files written.
 */
export async function applySnapshot(input: {
  courseId: string;
  bytes: Uint8Array;
  ownerId: string;
  now: Date;
}): Promise<number> {
  const zip = await openZip(input.bytes);
  const manifest = await readManifest(zip);
  const base = `/api/classroom-media/${input.courseId}`;
  const mediaByRef = new Map<string, string>();
  const posterByRef = new Map<string, string>();
  const audioByPath = new Map<string, string>();
  const audioByRef = new Map<string, string>();
  let unzipped = 0;
  let written = 0;

  const write = async (zipPath: string, kind: 'media' | 'audio', mime?: string) => {
    const file = zip.file(zipPath);
    if (!file) return undefined;
    const extension =
      (mime ? EXTENSION_BY_MIME[mime.toLowerCase()] : undefined) ??
      (MIME_BY_EXTENSION[path.extname(zipPath).slice(1).toLowerCase()]
        ? path.extname(zipPath).slice(1).toLowerCase()
        : undefined);
    if (!extension) return undefined;
    const data = await file.async('nodebuffer');
    unzipped += data.byteLength;
    if (unzipped > SNAPSHOT_MAX_UNZIPPED_BYTES)
      throw new SnapshotError('The ZIP expands too large');
    const name = `snap-${createHash('sha256').update(data).digest('hex')}.${extension}`;
    const dir = path.join(CLASSROOMS_DIR, input.courseId, kind);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), data);
    written += 1;
    return `${base}/${kind}/${name}`;
  };

  for (const [zipPath, entry] of Object.entries(manifest.mediaIndex)) {
    if (!entry || entry.missing || zipPath.includes('..')) continue;
    if (entry.type === 'audio') {
      const url = await write(zipPath, 'audio', entry.mimeType);
      if (!url) continue;
      audioByPath.set(zipPath, url);
      if (entry.sourceRef) audioByRef.set(entry.sourceRef, url);
      continue;
    }
    const url = await write(zipPath, 'media', entry.mimeType);
    if (!url || !entry.sourceRef) continue;
    mediaByRef.set(entry.sourceRef, url);
    const poster = await write(zipPath.replace(/\.[^/.]+$/, '.poster.jpg'), 'media', 'image/jpeg');
    if (poster) posterByRef.set(entry.sourceRef, poster);
  }

  const previous = await readClassroom(input.courseId);
  const unusedIds = new Map<string, string[]>();
  for (const scene of previous?.scenes ?? []) {
    unusedIds.set(scene.title, [...(unusedIds.get(scene.title) ?? []), scene.id]);
  }
  const agentIds = manifest.agents.map(() => nanoid());
  const now = input.now.getTime();

  const scenes: Scene[] = manifest.scenes.map((mScene: ManifestScene, index: number) => {
    const sceneId = unusedIds.get(mScene.title)?.shift() ?? nanoid();
    const actions = mScene.actions?.map((action) => {
      if (action.type === 'speech') {
        const { audioRef, ...rest } = action as typeof action & { audioRef?: string };
        const audioUrl = audioRef ? audioByPath.get(audioRef) : undefined;
        return {
          ...rest,
          ...(audioUrl
            ? { audioId: path.basename(audioUrl).replace(/\.[^.]+$/, ''), audioUrl }
            : {}),
        } as Action;
      }
      if (action.type === 'discussion') {
        const { agentIndex, ...rest } = action as typeof action & { agentIndex?: number };
        const agentId = typeof agentIndex === 'number' ? agentIds[agentIndex] : undefined;
        return { ...rest, ...(agentId ? { agentId } : {}) } as Action;
      }
      return action as Action;
    });
    const content =
      mScene.content.type === 'slide'
        ? {
            ...mScene.content,
            canvas: rewriteSlide(mScene.content.canvas, mediaByRef, posterByRef, audioByRef),
          }
        : mScene.content;
    return {
      id: sceneId,
      stageId: input.courseId,
      type: mScene.type,
      title: mScene.title,
      order: typeof mScene.order === 'number' ? mScene.order : index,
      content,
      ...(actions ? { actions } : {}),
      ...(mScene.whiteboards
        ? {
            whiteboards: mScene.whiteboards.map((slide) =>
              rewriteSlide(slide, mediaByRef, posterByRef, audioByRef),
            ),
          }
        : {}),
      ...(mScene.multiAgent?.enabled
        ? {
            multiAgent: {
              enabled: true,
              agentIds: (mScene.multiAgent.agentIndices ?? [])
                .map((i) => agentIds[i])
                .filter((id): id is string => Boolean(id)),
              directorPrompt: mScene.multiAgent.directorPrompt,
            },
          }
        : {}),
      createdAt: now,
      updatedAt: now,
    } as Scene;
  });

  const agentConfigs = manifest.agents.map((agent, i) =>
    agentConfigFromManifest(agent, agentIds[i]!),
  );
  const videoManifest = manifest.stage.videoManifest
    ? Object.fromEntries(
        Object.entries(manifest.stage.videoManifest).flatMap(([ref, entry]) => {
          const next = rewriteRef(ref, mediaByRef);
          return next ? [[next, entry] as const] : [];
        }),
      )
    : undefined;
  const stage: Stage = {
    ...(previous?.stage ?? {}),
    id: input.courseId,
    name: manifest.stage.name.trim() || previous?.stage.name || input.courseId,
    description: manifest.stage.description,
    languageDirective: manifest.stage.language,
    style: manifest.stage.style,
    createdAt: previous?.stage.createdAt ?? manifest.stage.createdAt ?? now,
    updatedAt: now,
    agentIds: agentIds.length > 0 ? agentIds : undefined,
    ...(agentConfigs.length > 0 ? { generatedAgentConfigs: agentConfigs } : {}),
    ...(videoManifest ? { videoManifest } : {}),
  } as Stage;

  await persistClassroom({ id: input.courseId, stage, scenes }, '', { ownerId: input.ownerId });
  return written;
}

// ── Pending snapshots ──────────────────────────────────────────────────────

export interface PendingSnapshot {
  ownerId: string;
  summary: SnapshotSummary;
  submittedAt: string;
}

/** Stores the ZIP waiting for review, replacing an earlier one for the same course. */
export async function savePendingSnapshot(
  db: AccountQueryable,
  input: {
    courseId: string;
    ownerId: string;
    bytes: Uint8Array;
    summary: SnapshotSummary;
    now: Date;
  },
): Promise<void> {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  const target = pendingPath(input.courseId);
  const staging = `${target}.${nanoid(8)}.tmp`;
  await fs.writeFile(staging, input.bytes);
  await fs.rename(staging, target);
  await db.query(
    `INSERT INTO course_snapshots (course_id, owner_id, summary, submitted_at)
     VALUES ($1::text, $2::text, $3::text, $4::timestamptz)
     ON CONFLICT (course_id) DO UPDATE SET owner_id = $2::text, summary = $3::text, submitted_at = $4::timestamptz`,
    [input.courseId, input.ownerId, JSON.stringify(input.summary), input.now.toISOString()],
  );
  // A new version replaces the last refusal.
  await db.query(`DELETE FROM course_share_rejections WHERE course_id = $1::text`, [
    input.courseId,
  ]);
}

export async function readPendingSnapshot(
  db: AccountQueryable,
  courseId: string,
): Promise<PendingSnapshot | undefined> {
  const result = await db.query(
    `SELECT owner_id, summary, submitted_at FROM course_snapshots WHERE course_id = $1::text`,
    [courseId],
  );
  const row = result.rows[0] as
    | { owner_id: string; summary: string; submitted_at: Date | string }
    | undefined;
  return row
    ? {
        ownerId: row.owner_id,
        summary: JSON.parse(row.summary) as SnapshotSummary,
        submittedAt: new Date(row.submitted_at).toISOString(),
      }
    : undefined;
}

export async function readPendingSnapshotBytes(courseId: string): Promise<Uint8Array | undefined> {
  try {
    return await fs.readFile(pendingPath(courseId));
  } catch {
    return undefined;
  }
}

export async function dropPendingSnapshot(db: AccountQueryable, courseId: string): Promise<void> {
  await db.query(`DELETE FROM course_snapshots WHERE course_id = $1::text`, [courseId]);
  await fs.rm(pendingPath(courseId), { force: true });
}

/** Summaries of pending snapshots by course, for the staff queue. */
export async function listPendingSnapshots(
  db: AccountQueryable,
): Promise<Map<string, PendingSnapshot>> {
  const result = await db.query(
    `SELECT course_id, owner_id, summary, submitted_at FROM course_snapshots`,
  );
  return new Map(
    (
      result.rows as Array<{
        course_id: string;
        owner_id: string;
        summary: string;
        submitted_at: Date | string;
      }>
    ).map((row) => [
      row.course_id,
      {
        ownerId: row.owner_id,
        summary: JSON.parse(row.summary) as SnapshotSummary,
        submittedAt: new Date(row.submitted_at).toISOString(),
      },
    ]),
  );
}

/** Shared courses whose owner sent an update that waits for review. */
export async function countPendingShareUpdates(db: AccountQueryable): Promise<number> {
  const result = await db.query(
    `SELECT count(*)::int AS n FROM course_snapshots s
       JOIN course_shares c ON c.course_id = s.course_id WHERE c.state = 'shared'`,
  );
  return (result.rows[0] as { n: number } | undefined)?.n ?? 0;
}
