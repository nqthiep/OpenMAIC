import { promises as fs, createReadStream, type ReadStream } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { canReadClassroom } from '@/lib/server/authz/viewer';
import {
  CLASSROOMS_DIR,
  isValidClassroomId,
  classroomMediaMimeType,
} from '@/lib/server/classroom-storage';
import { parseRangeHeader } from '@/lib/server/http-range';
import { readStageAccessIncludingDeleted } from '@/lib/server/stage-access';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/server/api-response';

const log = createLogger('ClassroomMedia');

const SUCCESS_CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=300, must-revalidate',
} as const;
const ERROR_CACHE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

/** Our coded error body, never cached (upstream's `ERROR_CACHE_HEADERS`). */
function fail(code: Parameters<typeof apiError>[0], status: number, message: string) {
  const response = apiError(code, status, message);
  response.headers.set('Cache-Control', ERROR_CACHE_HEADERS['Cache-Control']);
  return response;
}

/** Bridge a fs ReadStream into a web ReadableStream, propagating errors and cancel. */
function toWebStream(stream: ReadStream): ReadableStream {
  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  const { classroomId, path: pathSegments } = await params;

  // Validate classroomId
  if (!isValidClassroomId(classroomId)) {
    return fail('INVALID_REQUEST', 400, 'Invalid classroom ID');
  }

  if (!(await canReadClassroom(req.headers, classroomId))) {
    return fail('NOT_FOUND', 404, 'Classroom not found');
  }

  // Validate path segments — no traversal
  const joined = pathSegments.join('/');
  if (joined.includes('..') || pathSegments.some((s) => s.includes('\0'))) {
    return fail('INVALID_REQUEST', 400, 'Invalid path');
  }

  // Only allow media/ and audio/ subdirectories
  const subDir = pathSegments[0];
  if (subDir !== 'media' && subDir !== 'audio') {
    return fail('NOT_FOUND', 404, 'Invalid path');
  }

  const filePath = path.join(CLASSROOMS_DIR, classroomId, ...pathSegments);
  const resolvedBase = path.resolve(CLASSROOMS_DIR, classroomId);

  try {
    // Media reads are capability-by-id. Only a tombstone revokes that
    // capability; legacy media folders may have no database row.
    const access = await readStageAccessIncludingDeleted(classroomId);
    if (access !== null && access.deletedAt !== null) {
      return fail('NOT_FOUND', 404, 'Not found');
    }

    // Resolve symlinks and verify the real path stays within the classroom dir
    const realPath = await fs.realpath(filePath);
    if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
      return fail('NOT_FOUND', 404, 'Not found');
    }

    const stat = await fs.stat(realPath);
    if (!stat.isFile()) {
      return fail('NOT_FOUND', 404, 'Not found');
    }

    const ext = path.extname(realPath).toLowerCase();
    const contentType = classroomMediaMimeType(ext) ?? 'application/octet-stream';

    // Range requests enable progressive playback and seeking for hosted media
    // (e.g. <video> streams the moov atom first, then fetches on seek).
    const range = parseRangeHeader(req.headers.get('range'), stat.size);

    if (range.kind === 'unsatisfiable') {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...ERROR_CACHE_HEADERS,
          'Content-Range': `bytes */${stat.size}`,
        },
      });
    }

    if (range.kind === 'range') {
      const stream = createReadStream(realPath, { start: range.start, end: range.end });
      return new NextResponse(toWebStream(stream), {
        status: 206,
        headers: {
          ...SUCCESS_CACHE_HEADERS,
          'Content-Type': contentType,
          'Content-Length': String(range.end - range.start + 1),
          'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    // Stream the file to avoid loading large videos into memory
    return new NextResponse(toWebStream(createReadStream(realPath)), {
      status: 200,
      headers: {
        ...SUCCESS_CACHE_HEADERS,
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fail('NOT_FOUND', 404, 'Not found');
    }
    log.error(
      `Classroom media serving failed [classroomId=${classroomId}, path=${joined}]:`,
      error,
    );
    return fail('INTERNAL_ERROR', 500, 'Internal error');
  }
}
