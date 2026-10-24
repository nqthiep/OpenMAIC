import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearProviders, useProviders } from '../fixtures/provider-snapshot';
import { replaceMediaPlaceholders } from '@/lib/server/classroom-media-generation';
import type { Scene } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';

// The media pipeline writes generated files to disk; intercept the writes so
// the test never touches the worktree. Everything else delegates to the real fs.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  };
});

function slideScene(
  elements: Array<{ id: string; type: string; src?: string; mediaRef?: string }>,
) {
  return {
    id: 'scene_1',
    stageId: 'stage_1',
    type: 'slide',
    title: 'Scene',
    order: 1,
    content: {
      type: 'slide',
      canvas: {
        id: 'canvas_1',
        elements,
      },
    },
  } as unknown as Scene;
}

describe('classroom media placeholder replacement', () => {
  test('preserves direct video src when mediaRef is also present', () => {
    const scene = slideScene([
      {
        id: 'video_1',
        type: 'video',
        src: 'https://example.com/direct.mp4',
        mediaRef: 'gen_vid_real123',
      },
    ]);

    replaceMediaPlaceholders([scene], {
      gen_vid_real123: 'https://cdn.example.com/generated.mp4',
    });

    const content = scene.content as {
      canvas: { elements: Array<{ src?: string }> };
    };
    const video = content.canvas.elements[0];
    expect(video.src).toBe('https://example.com/direct.mp4');
  });

  test('preserves an author-supplied non-URL src when mediaRef is also present', () => {
    const scene = slideScene([
      {
        id: 'video_1',
        type: 'video',
        src: 'lesson-intro.mp4',
        mediaRef: 'gen_vid_real123',
      },
    ]);

    replaceMediaPlaceholders([scene], {
      gen_vid_real123: 'https://cdn.example.com/generated.mp4',
    });

    const content = scene.content as {
      canvas: { elements: Array<{ src?: string }> };
    };
    expect(content.canvas.elements[0].src).toBe('lesson-intro.mp4');
  });

  test('does not treat an image placeholder as the video-manifest overwrite guard', () => {
    const scene = slideScene([
      {
        id: 'video_1',
        type: 'video',
        src: 'gen_img_preview123',
        mediaRef: 'gen_vid_real123',
      },
    ]);

    replaceMediaPlaceholders([scene], {
      gen_vid_real123: 'https://cdn.example.com/generated.mp4',
    });

    const content = scene.content as {
      canvas: { elements: Array<{ src?: string }> };
    };
    expect(content.canvas.elements[0].src).toBe('gen_img_preview123');
  });
});

describe('generateMediaForClassroom model fallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearProviders();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('gracefully skips media when every configured provider is force-disabled', async () => {
    useProviders({
      image: { seedream: { apiKey: 'sk-seedream' } },
      video: { seedance: { apiKey: 'sk-seedance' } },
      disabled: { image: ['seedream'], video: ['seedance'] },
    });
    vi.resetModules();

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');
    const outlines = [
      {
        id: 'outline_disabled',
        type: 'slide',
        title: 'Scene',
        description: 'd',
        order: 1,
        mediaGenerations: [
          { type: 'image', prompt: 'image', elementId: 'gen_img_disabled' },
          { type: 'video', prompt: 'video', elementId: 'gen_vid_disabled' },
        ],
      },
    ] as unknown as SceneOutline[];

    await expect(
      generateMediaForClassroom(outlines, 'cls-disabled', 'http://localhost'),
    ).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('falls back to the first catalog image model when the server pins no models', async () => {
    // Key-only managed provider (no pinned models): the resolver
    // yields no model, so the classroom path must fall back to the first
    // catalog model instead of reaching the adapter with an undefined model.
    useProviders({ image: { seedream: { apiKey: 'sk-seedream' } } });
    vi.resetModules();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://cdn.example.com/x.png' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(8),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');

    const outlines = [
      {
        id: 'outline_1',
        type: 'slide',
        title: 'Scene 1',
        description: 'd',
        order: 1,
        mediaGenerations: [{ type: 'image', prompt: 'a cat', elementId: 'gen_img_1' }],
      },
    ] as unknown as SceneOutline[];

    const mediaMap = await generateMediaForClassroom(outlines, 'cls-fallback', 'http://localhost');

    expect(mediaMap['gen_img_1']).toBe(
      'http://localhost/api/classroom-media/cls-fallback/media/gen_img_1.png',
    );
    const genBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(genBody.model).toBe('doubao-seedream-5-0-260128');
  });

  test('uses the server-pinned model when the managed image provider pins models', async () => {
    useProviders({ image: { seedream: { apiKey: 'sk-seedream', models: ['pinned-a'] } } });
    vi.resetModules();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://cdn.example.com/y.png' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(8),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');

    const outlines = [
      {
        id: 'outline_1',
        type: 'slide',
        title: 'Scene 1',
        description: 'd',
        order: 1,
        mediaGenerations: [{ type: 'image', prompt: 'a cat', elementId: 'gen_img_2' }],
      },
    ] as unknown as SceneOutline[];

    await generateMediaForClassroom(outlines, 'cls-pinned', 'http://localhost');

    const genBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(genBody.model).toBe('pinned-a');
  });

  test('normalizes GPT Image 2 classroom media to an accepted landscape size', async () => {
    useProviders({
      image: { 'openai-image': { apiKey: 'sk-openai', models: ['gpt-image-2'] } },
    });
    vi.resetModules();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://cdn.example.com/gpt-image-2.png' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(8),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');
    const outlines = [
      {
        id: 'outline_gpt_image_2',
        type: 'slide',
        title: 'Scene',
        description: 'd',
        order: 1,
        mediaGenerations: [{ type: 'image', prompt: 'a plant', elementId: 'gen_img_gpt_image_2' }],
      },
    ] as unknown as SceneOutline[];

    await generateMediaForClassroom(outlines, 'cls-gpt-image-2', 'http://localhost');

    const genBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(genBody).toMatchObject({ model: 'gpt-image-2', size: '1536x1024' });
  });

  test('falls back to the first catalog video model when the server pins no models', async () => {
    // Key-only managed provider (no pinned models): the resolver
    // yields no model, so the classroom path must fall back to the first
    // catalog model instead of reaching the adapter with an undefined model.
    useProviders({ video: { seedance: { apiKey: 'sk-seedance' } } });
    vi.useFakeTimers();
    vi.resetModules();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'video-task-1' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'video-task-1',
          status: 'succeeded',
          content: { video_url: 'https://cdn.example.com/video.mp4' },
          resolution: '720p',
          ratio: '16:9',
          duration: 5,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(8),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');

    const outlines = [
      {
        id: 'outline_1',
        type: 'slide',
        title: 'Scene 1',
        description: 'd',
        order: 1,
        mediaGenerations: [{ type: 'video', prompt: 'a cat running', elementId: 'gen_vid_1' }],
      },
    ] as unknown as SceneOutline[];

    const mediaMapPromise = generateMediaForClassroom(
      outlines,
      'cls-video-fallback',
      'http://localhost',
    );
    // Seedance submits a task then polls on a 5s interval; advance the fake
    // timers past the first poll so the mocked success response is consumed.
    await vi.advanceTimersByTimeAsync(5_000);
    const mediaMap = await mediaMapPromise;

    expect(mediaMap['gen_vid_1']).toBe(
      'http://localhost/api/classroom-media/cls-video-fallback/media/gen_vid_1.mp4',
    );
    const genBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(genBody.model).toBe('doubao-seedance-2-0-260128');
  });

  test('uses the server-pinned video model when the managed video provider pins models', async () => {
    useProviders({
      video: { seedance: { apiKey: 'sk-seedance', models: ['pinned-video-a'] } },
    });
    vi.useFakeTimers();
    vi.resetModules();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'video-task-2' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'video-task-2',
          status: 'succeeded',
          content: { video_url: 'https://cdn.example.com/video.mp4' },
          resolution: '720p',
          ratio: '16:9',
          duration: 5,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(8),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');

    const outlines = [
      {
        id: 'outline_1',
        type: 'slide',
        title: 'Scene 1',
        description: 'd',
        order: 1,
        mediaGenerations: [{ type: 'video', prompt: 'a cat running', elementId: 'gen_vid_2' }],
      },
    ] as unknown as SceneOutline[];

    const mediaMapPromise = generateMediaForClassroom(
      outlines,
      'cls-video-pinned',
      'http://localhost',
    );
    await vi.advanceTimersByTimeAsync(5_000);
    const mediaMap = await mediaMapPromise;

    expect(mediaMap['gen_vid_2']).toBe(
      'http://localhost/api/classroom-media/cls-video-pinned/media/gen_vid_2.mp4',
    );
    const genBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(genBody.model).toBe('pinned-video-a');
  });

  test('names Grok inline bytes with the extension for the type it reported', async () => {
    // xAI answers `b64_json` with JPEG bytes and declares no media type of its
    // own, so the adapter reports one. Recording it under `.png` — which this
    // path did for every inline image — serves the file back as the wrong type.
    // The generic key is cleared for the same reason the first test clears it:
    // it would otherwise enable OpenAI's image fallback alongside Grok's.
    vi.resetModules();
    useProviders({ image: { 'grok-image': { apiKey: 'sk-grok' } } });

    const jpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64');
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: jpegBase64 }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { generateMediaForClassroom } = await import('@/lib/server/classroom-media-generation');

    const outlines = [
      {
        id: 'outline_1',
        type: 'slide',
        title: 'Scene 1',
        description: 'd',
        order: 1,
        mediaGenerations: [{ type: 'image', prompt: 'a cat', elementId: 'gen_img_grok' }],
      },
    ] as unknown as SceneOutline[];

    const mediaMap = await generateMediaForClassroom(outlines, 'cls-grok', 'http://localhost');

    expect(mediaMap['gen_img_grok']).toBe(
      'http://localhost/api/classroom-media/cls-grok/media/gen_img_grok.jpg',
    );
  });
});
