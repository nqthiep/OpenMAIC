import { enumerateAssetManifest } from '@openmaic/dsl';
import { describe, expect, it } from 'vitest';
import { clipProvider, clipRegistry } from '@/lib/clips';

/**
 * Spike S3 / Q11 (card 3-S3), the part that needs no browser: a slide built by the clip provider is an ordinary slide, so
 * the export paths see its video and poster through the document's asset manifest (the same enumeration the ZIP, PPTX and
 * video exports use), once per chapter.
 */
describe('clip slides in the asset manifest (export, S3)', () => {
  const id = clipRegistry.prebuiltIds()[0];
  const entry = clipRegistry.findClip(id)!;
  const built = clipProvider.build({ id }, { locale: 'vi-VN' });
  const scenes = (built.content as { type: 'slide' }[]).map((content, i) => ({
    id: `s${i}`,
    stageId: 'st',
    type: 'slide' as const,
    title: 't',
    order: i,
    content,
    actions: built.actions[i],
  }));

  it('lists one video and one poster per chapter, with the URLs the asset index names', () => {
    const manifest = enumerateAssetManifest({ stage: {} as never, scenes: scenes as never });
    const refs = manifest.entries.map((e) => e.ref);
    const asset = entry.asset(
      entry.presets.find((p) => entry.asset(p.input as never, 'vi-VN'))!.input as never,
      'vi-VN',
    )!;
    for (const ch of asset.chapters) {
      expect(refs, ch.id).toContain(ch.url);
    }
    expect(manifest.entries.filter((e) => e.kind === 'video')).toHaveLength(asset.chapters.length);
  });

  it('every scripted play_video targets a video element of its own slide', () => {
    for (const s of scenes) {
      const videos = (
        s.content as unknown as { canvas: { elements: { id: string; type: string }[] } }
      ).canvas.elements.filter((e) => e.type === 'video');
      const plays = (s.actions as { type: string; elementId?: string }[]).filter(
        (a) => a.type === 'play_video',
      );
      expect(videos).toHaveLength(1);
      expect(plays.map((a) => a.elementId)).toEqual(videos.map((v) => v.id));
    }
  });
});
