/**
 * Prints a walkthrough scene as JSON on stdout (default: binary-search, preset mid-hit; or pass `<id> <presetId>`).
 * Run by e2e/tests/walkthrough-widget.spec.ts and walkthrough-math.spec.ts:
 * `node_modules/.bin/tsx e2e/fixtures/build-walkthrough-scene.ts [id presetId]`.
 */
import { walkthroughProvider } from '@/lib/widgets';

const [id = 'binary-search', presetId = 'mid-hit'] = process.argv.slice(2);
const built = walkthroughProvider.build({ id, presetId }, { locale: 'vi-VN' });
process.stdout.write(JSON.stringify(built));
