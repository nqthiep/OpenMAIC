// @vitest-environment jsdom
/**
 * Unmounting the recorder releases the microphone: the MediaRecorder stops, every
 * track stops, the timer clears and browser recognition aborts. A permission
 * prompt answered after unmount releases its stream, and a transcription that
 * returns after unmount is not delivered.
 */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAudioRecorder, type UseAudioRecorderOptions } from '@/lib/hooks/use-audio-recorder';
import { modelSettingsClient } from '@/lib/model-settings/client';

import { modelSettingsViewFor } from '../helpers/model-settings-view';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(readonly stream: MediaStream) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
  }
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeRecognition.instances.push(this);
  }
}

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks };
}

function setGetUserMedia(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
}

async function mountRecorder(options: UseAudioRecorderOptions = {}) {
  const handle: { current?: ReturnType<typeof useAudioRecorder> } = {};
  function Probe() {
    const recorder = useAudioRecorder(options);
    useEffect(() => {
      handle.current = recorder;
    });
    return null;
  }
  const root: Root = createRoot(document.createElement('div'));
  await act(async () => root.render(createElement(Probe)));
  return { handle, root };
}

afterEach(() => {
  modelSettingsClient.adopt(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  FakeMediaRecorder.instances = [];
  FakeRecognition.instances = [];
});

describe('useAudioRecorder unmount', () => {
  it('stops the recorder, every track and the timer when unmounted while recording', async () => {
    modelSettingsClient.adopt(modelSettingsViewFor({ asr: { registryId: 'openai-whisper' } }));
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const { stream, tracks } = fakeStream();
    setGetUserMedia(async () => stream);
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { handle, root } = await mountRecorder();

    await act(async () => handle.current!.startRecording());
    const [recorder] = FakeMediaRecorder.instances;
    expect(recorder.state).toBe('recording');

    await act(async () => root.unmount());

    expect(recorder.state).toBe('inactive');
    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(setIntervalSpy.mock.results.at(-1)?.value);
  });

  it('releases a permission prompt answered after unmount without recording', async () => {
    modelSettingsClient.adopt(modelSettingsViewFor({ asr: { registryId: 'openai-whisper' } }));
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const { stream, tracks } = fakeStream();
    let answerPrompt!: (value: MediaStream) => void;
    const getUserMedia = vi.fn(
      () => new Promise<MediaStream>((resolve) => (answerPrompt = resolve)),
    );
    setGetUserMedia(getUserMedia);
    const { handle, root } = await mountRecorder();

    let started!: Promise<void>;
    await act(async () => {
      started = handle.current!.startRecording();
    });
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    await act(async () => root.unmount());
    await act(async () => answerPrompt(stream));
    await act(async () => started);

    expect(FakeMediaRecorder.instances).toHaveLength(0);
    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('aborts browser speech recognition and drops its handlers when unmounted', async () => {
    modelSettingsClient.adopt(modelSettingsViewFor({ asr: { registryId: 'browser-native' } }));
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { handle, root } = await mountRecorder();

    await act(async () => handle.current!.startRecording());
    const [recognition] = FakeRecognition.instances;
    expect(recognition.start).toHaveBeenCalledTimes(1);
    await act(async () => recognition.onstart!());

    await act(async () => root.unmount());

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(recognition.onstart).toBeNull();
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
    expect(clearIntervalSpy).toHaveBeenCalledWith(setIntervalSpy.mock.results.at(-1)?.value);
  });

  it('reports nothing when a permission prompt is refused after unmount', async () => {
    modelSettingsClient.adopt(modelSettingsViewFor({ asr: { registryId: 'openai-whisper' } }));
    let refusePrompt!: (reason: Error) => void;
    setGetUserMedia(() => new Promise<MediaStream>((_resolve, reject) => (refusePrompt = reject)));
    const onError = vi.fn();
    const { handle, root } = await mountRecorder({ onError });

    let started!: Promise<void>;
    await act(async () => {
      started = handle.current!.startRecording();
    });
    await vi.waitFor(() => expect(refusePrompt).toBeDefined());
    await act(async () => root.unmount());
    await act(async () => refusePrompt(new Error('NotAllowedError')));
    await act(async () => started);

    expect(onError).not.toHaveBeenCalled();
  });

  it('does not deliver a transcription that returns after unmount', async () => {
    const { onTranscription, root, upload } = await recordAndStopUpload();

    await act(async () => root.unmount());
    await act(async () => upload.answer(new Response(JSON.stringify({ text: 'xin chào' }))));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(onTranscription).not.toHaveBeenCalled();
  });

  it('delivers the transcription while still mounted', async () => {
    const { onTranscription, upload } = await recordAndStopUpload();

    await act(async () => upload.answer(new Response(JSON.stringify({ text: 'xin chào' }))));

    await vi.waitFor(() => expect(onTranscription).toHaveBeenCalledWith('xin chào'));
  });
});

/** Records one clip with a Whisper-style provider, stops it, and holds the upload open. */
async function recordAndStopUpload() {
  modelSettingsClient.adopt(modelSettingsViewFor({ asr: { registryId: 'openai-whisper' } }));
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  const { stream } = fakeStream();
  setGetUserMedia(async () => stream);
  let answer!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
  vi.stubGlobal('fetch', fetchMock);
  const onTranscription = vi.fn();
  const { handle, root } = await mountRecorder({ onTranscription });

  await act(async () => handle.current!.startRecording());
  const [recorder] = FakeMediaRecorder.instances;
  recorder.ondataavailable?.({ data: new Blob(['audio']) });
  await act(async () => {
    recorder.onstop?.();
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

  return { onTranscription, root, upload: { answer: (response: Response) => answer(response) } };
}
