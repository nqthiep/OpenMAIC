/**
 * Prints the walkthrough scene (binary-search, preset mid-hit) as JSON on stdout.
 * Run by e2e/tests/walkthrough-widget.spec.ts: `node_modules/.bin/tsx e2e/fixtures/build-walkthrough-scene.ts`.
 */
import { walkthroughProvider } from '@/lib/widgets';

const built = walkthroughProvider.build(
  { id: 'binary-search', presetId: 'mid-hit' },
  { locale: 'vi-VN' },
);
process.stdout.write(JSON.stringify(built));
