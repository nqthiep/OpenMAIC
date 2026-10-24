import { promises as fs } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Every route that can reach a model with the operator's key must call requireSpender in its
 * POST handler. The scan finds routes by what they do, so a new spending route fails here
 * until it is guarded. Adding a route to KNOWN_SPENDERS only documents it; the scan still applies.
 */
const API_ROOT = path.join(process.cwd(), 'app', 'api');

const SPEND_SIGNALS = [
  /\bresolveModel\w*\(/,
  /\bisServerConfiguredProvider\(/,
  /\bstartGenerationRun\(/,
];

const KNOWN_SPENDERS = [
  'app/api/chat/pi/route.ts',
  'app/api/generate/image/route.ts',
  'app/api/generate/tts/route.ts',
  'app/api/generate/video/route.ts',
  'app/api/generate/voice/route.ts',
  'app/api/pbl/v2/evaluate/route.ts',
  'app/api/pbl/v2/instructor/route.ts',
  'app/api/pbl/v2/open-task/route.ts',
  'app/api/pbl/v2/simulator/route.ts',
  'app/api/quiz-grade/route.ts',
  'app/api/transcription/route.ts',
  'app/api/parse-pdf/route.ts',
  'app/api/agent/sessions/route.ts',
  'app/api/agent/sessions/[id]/messages/route.ts',
  'app/api/verify-model/route.ts',
  'app/api/verify-image-provider/route.ts',
  'app/api/verify-video-provider/route.ts',
  'app/api/verify-pdf-provider/route.ts',
  'app/api/generate-classroom/route.ts',
  'app/api/generation-runs/route.ts',
  'app/api/generation-runs/[id]/confirm-outline/route.ts',
  'app/api/generation-runs/[id]/retry/route.ts',
  'app/api/materials/route.ts',
  'app/api/community/questions/[id]/ai/route.ts',
  'app/api/community/challenges/[id]/route.ts',
];

async function routeFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await routeFiles(full)));
    else if (entry.name === 'route.ts') files.push(full);
  }
  return files;
}

/** The source of the POST handler, from its `export` to the next top-level export, or ''. */
function postHandler(source: string): string {
  const start = source.indexOf('export async function POST(');
  if (start < 0) return '';
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

describe('spend guard coverage', () => {
  it('every known spending route calls requireSpender in its POST handler', async () => {
    const unguarded: string[] = [];
    for (const rel of KNOWN_SPENDERS) {
      const source = await fs.readFile(path.join(process.cwd(), rel), 'utf-8');
      if (!postHandler(source).includes('requireSpender(')) unguarded.push(rel);
    }
    expect(unguarded).toEqual([]);
  });

  it('any route that reaches a model is in the known list, so the scan cannot miss one', async () => {
    const files = await routeFiles(API_ROOT);
    const missing: string[] = [];
    for (const file of files) {
      const source = await fs.readFile(file, 'utf-8');
      if (!SPEND_SIGNALS.some((signal) => signal.test(source))) continue;
      const rel = path.relative(process.cwd(), file);
      if (!KNOWN_SPENDERS.includes(rel)) missing.push(rel);
    }
    expect(missing).toEqual([]);
  });
});
