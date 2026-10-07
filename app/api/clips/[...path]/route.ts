import { createReadStream, type ReadStream } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { CONTENT_TYPES, clipAssetFile, isClipAssetName } from '@/lib/clips/asset-store';
import { parseRangeHeader } from '@/lib/server/http-range';

/**
 * Serves a stored clip asset (task 3C-06): single byte ranges for seeking, `immutable` because the name is the hash of
 * the content. It sits under `/api/`, so it goes through the access code like every other API route. The name is
 * checked against a strict pattern before any path is built, so there is no way to leave the store.
 */
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=31536000, immutable' } as const;

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  // exactly one segment, and it must be `<64 hex>.<mp4|png|json|vtt>`
  if (segments.length !== 1 || !isClipAssetName(segments[0])) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const asset = await clipAssetFile(segments[0]);
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contentType = CONTENT_TYPES[asset.ext];
  const range = parseRangeHeader(req.headers.get('range'), asset.size);
  if (range.kind === 'unsatisfiable') {
    // never cache a range error: an immutable 416 would poison the URL for later valid requests
    return new NextResponse(null, {
      status: 416,
      headers: { 'Cache-Control': 'no-store', 'Content-Range': `bytes */${asset.size}` },
    });
  }
  if (range.kind === 'range') {
    return new NextResponse(
      toWebStream(createReadStream(asset.file, { start: range.start, end: range.end })),
      {
        status: 206,
        headers: {
          ...CACHE_HEADERS,
          'Content-Type': contentType,
          'Content-Length': String(range.end - range.start + 1),
          'Content-Range': `bytes ${range.start}-${range.end}/${asset.size}`,
          'Accept-Ranges': 'bytes',
        },
      },
    );
  }
  return new NextResponse(toWebStream(createReadStream(asset.file)), {
    status: 200,
    headers: {
      ...CACHE_HEADERS,
      'Content-Type': contentType,
      'Content-Length': String(asset.size),
      'Accept-Ranges': 'bytes',
    },
  });
}
