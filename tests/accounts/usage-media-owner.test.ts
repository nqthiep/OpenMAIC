import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testLogger } from '../server/generation-steps/helpers';
import { generateImageStep } from '@/lib/server/generation/steps/image';
import { synthesizeNarration } from '@/lib/server/generation/steps/narration';
import { generateVideoStep } from '@/lib/server/generation/steps/video';
import type { MediaConnection } from '@/lib/server/model-config/media';

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  generateVideo: vi.fn(),
  generateTTS: vi.fn(),
  recordGenerationUsage: vi.fn(),
}));

vi.mock('@/lib/media/image-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/image-providers')>()),
  generateImage: mocks.generateImage,
}));
vi.mock('@/lib/media/video-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/video-providers')>()),
  generateVideo: mocks.generateVideo,
}));
vi.mock('@/lib/audio/tts-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio/tts-providers')>()),
  generateTTS: mocks.generateTTS,
}));
vi.mock('@/lib/server/usage-storage', () => ({
  recordGenerationUsage: mocks.recordGenerationUsage,
}));

const imageConnection: MediaConnection = {
  providerId: 'seedream',
  apiKey: 'image-key',
  managed: true,
  userEndpoint: false,
  origin: 'configuration',
};
const videoConnection: MediaConnection = {
  providerId: 'seedance',
  apiKey: 'video-key',
  managed: true,
  userEndpoint: false,
  origin: 'configuration',
};
const ttsConnection: MediaConnection = {
  providerId: 'openai-tts',
  modelId: 'gpt-4o-mini-tts',
  apiKey: 'server-key',
  managed: true,
  userEndpoint: false,
  origin: 'configuration',
};

describe('media steps attribute their usage to the account they run for', () => {
  const ownerId = `acct_${randomUUID()}`;

  beforeEach(() => {
    mocks.generateImage.mockReset();
    mocks.generateImage.mockResolvedValue({
      url: 'https://cdn.example.com/a.png',
      width: 1024,
      height: 576,
    });
    mocks.generateVideo.mockReset();
    mocks.generateVideo.mockResolvedValue({
      url: 'https://cdn.example.com/a.mp4',
      width: 1280,
      height: 720,
      duration: 5,
    });
    mocks.generateTTS.mockReset();
    mocks.generateTTS.mockResolvedValue({ audio: new Uint8Array([1, 2, 3]), format: 'mp3' });
    mocks.recordGenerationUsage.mockReset();
  });

  it('image', async () => {
    await generateImageStep(
      { options: { prompt: 'A leaf' }, connection: imageConnection, ownerId },
      { log: testLogger() },
    );
    expect(mocks.recordGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image', ownerId }),
    );
  });

  it('video', async () => {
    await generateVideoStep(
      { options: { prompt: 'A river' }, connection: videoConnection, ownerId },
      { log: testLogger() },
    );
    expect(mocks.recordGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'video', ownerId }),
    );
  });

  it('narration', async () => {
    await synthesizeNarration(
      { text: 'Hello class', audioId: 'a1', connection: ttsConnection, ownerId },
      { log: testLogger() },
    );
    expect(mocks.recordGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'tts', ownerId }),
    );
  });
});
