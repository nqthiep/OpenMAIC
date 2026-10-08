/**
 * Prints the slide scenes of the first shipped clip (one per chapter, built by the real clip provider) as JSON on stdout.
 * Run by e2e/tests/clip-slides.spec.ts: `node_modules/.bin/tsx e2e/fixtures/build-clip-scenes.ts`.
 */
import { clipProvider, clipRegistry } from '@/lib/clips';

const id = clipRegistry.prebuiltIds()[0];
const built = clipProvider.build({ id }, { locale: 'en-US' });
const scenes = (built.content as unknown[]).map((content, i) => ({
  id: `scene-clip-${i}`,
  type: 'slide',
  title: `Clip chapter ${i + 1}`,
  content,
  actions: built.actions[i],
}));
process.stdout.write(JSON.stringify({ clipId: id, scenes }));
