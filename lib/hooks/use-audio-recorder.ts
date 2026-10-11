import { useState, useRef, useCallback, useEffect } from 'react';
import type { ASRProviderId } from '@/lib/audio/types';
import { normalizeASRUploadAudio } from '@/lib/audio/wav-utils';
import { loadModelCapabilities } from '@/lib/model-settings/capabilities';
import { createLogger } from '@/lib/logger';
import { getClientTranslation } from '@/lib/i18n';
import { ASR_PROVIDERS } from '@/lib/audio/constants';
import { currentUiLocale, defaultASRLanguage } from '@/lib/store/settings';

const log = createLogger('AudioRecorder');

/** Shown when the workspace's asr slot resolves to nothing. */
export const ASR_NOT_CONFIGURED_MESSAGE = 'Chưa thiết lập nhận dạng giọng nói';

/**
 * The provider the workspace's asr slot resolves to (its registry id), and the
 * user's language for it. The provider, model and key are the server's.
 */
async function asrSetup(): Promise<{ providerId: ASRProviderId; language: string } | null> {
  const [{ asr }, { useSettingsStore, getValidASRLanguage }] = await Promise.all([
    loadModelCapabilities(),
    import('@/lib/store/settings'),
  ]);
  if (!asr) return null;
  const providerId = asr.registryId as ASRProviderId;
  return {
    providerId,
    language: getValidASRLanguage(providerId, useSettingsStore.getState().asrLanguage),
  };
}

function stopTracks(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

// Window.SpeechRecognition / webkitSpeechRecognition have minimal constructor
// declarations in types/web-speech.d.ts; this hook casts the richer instance.

export interface UseAudioRecorderOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
  /** When true and using browser-native ASR, recognition stays active until explicitly stopped. */
  continuous?: boolean;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { onTranscription, onError, continuous = false } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API not typed
  const speechRecognitionRef = useRef<any>(null);
  // Synchronous lock to prevent rapid re-entry (React state updates are async)
  const busyRef = useRef(false);
  // Async steps still pending after unmount check this before opening the mic or reporting back.
  const unmountedRef = useRef(false);

  // Release the mic, timer and recognizer when the owner unmounts.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const recognition = speechRecognitionRef.current;
      if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
        speechRecognitionRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
        if (recorder.stream) stopTracks(recorder.stream);
        mediaRecorderRef.current = null;
      }
      audioChunksRef.current = [];
    };
  }, []);

  // Send audio to server for transcription
  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);

      try {
        const formData = new FormData();

        // The asr slot names the provider and model on the server; the
        // upload format and the language follow the provider it resolves to.
        const setup = typeof window !== 'undefined' ? await asrSetup() : null;
        if (setup) {
          const uploadAudio = await normalizeASRUploadAudio(setup.providerId, audioBlob);
          formData.append('audio', uploadAudio.blob, uploadAudio.fileName);
          formData.append('language', setup.language);
        } else {
          formData.append('audio', audioBlob, 'recording.webm');
        }

        const response = await fetch('/api/transcription', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Transcription failed');
        }

        const result = await response.json();
        if (!unmountedRef.current) onTranscription?.(result.text);
      } catch (error) {
        log.error('Transcription error:', error);
        if (!unmountedRef.current)
          onError?.(
            error instanceof Error
              ? error.message
              : getClientTranslation('voice.error.transcription'),
          );
      } finally {
        setIsProcessing(false);
        setRecordingTime(0);
      }
    },
    [onTranscription, onError],
  );

  // Start recording
  const startRecording = useCallback(async () => {
    // Synchronous lock — React state is async so isRecording may be stale
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // Get current ASR configuration
      if (typeof window !== 'undefined') {
        // Nothing to record with when the asr slot is off or unassigned.
        const setup = await asrSetup();
        if (unmountedRef.current) return;
        if (!setup) {
          // Release the lock: a later click (once speech input is set up) must work.
          busyRef.current = false;
          onError?.(ASR_NOT_CONFIGURED_MESSAGE);
          return;
        }
        const asrLanguage = setup.language;

        // Use browser native ASR if configured
        if (setup.providerId === 'browser-native') {
          // Check if Speech Recognition is supported
          if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
            busyRef.current = false;
            onError?.(getClientTranslation('voice.error.unsupported'));
            return;
          }

          const SpeechRecognitionCtor = (window.SpeechRecognition ||
            window.webkitSpeechRecognition)!;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API instance shape isn't in lib.dom
          const recognition: any = new SpeechRecognitionCtor();

          recognition.lang =
            asrLanguage ||
            defaultASRLanguage(
              currentUiLocale(),
              ASR_PROVIDERS['browser-native'].supportedLanguages,
            );
          recognition.continuous = continuous;
          recognition.interimResults = false;

          recognition.onstart = () => {
            setIsRecording(true);
            setRecordingTime(0);

            // Start timer
            timerRef.current = setInterval(() => {
              setRecordingTime((prev) => prev + 1);
            }, 1000);
          };

          recognition.onresult = (event: {
            resultIndex: number;
            results: {
              [index: number]: {
                isFinal: boolean;
                [index: number]: { transcript: string };
              };
              length: number;
            };
          }) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i];
              if (result.isFinal && result[0]?.transcript) {
                transcript += result[0].transcript;
              }
            }
            if (transcript) {
              onTranscription?.(transcript);
            }
          };

          recognition.onerror = (event: { error: string }) => {
            log.error('Speech recognition error:', event.error);
            let errorMessage = getClientTranslation('voice.error.recognition');

            switch (event.error) {
              case 'aborted':
                // Non-fatal: caused by our own cancel/stop logic or rapid toggle
                busyRef.current = false;
                setIsRecording(false);
                setRecordingTime(0);
                if (timerRef.current) {
                  clearInterval(timerRef.current);
                  timerRef.current = null;
                }
                return;
              case 'no-speech':
                errorMessage = getClientTranslation('voice.error.noSpeech');
                break;
              case 'audio-capture':
                errorMessage = getClientTranslation('voice.error.audioCapture');
                break;
              case 'not-allowed':
                errorMessage = getClientTranslation('voice.error.notAllowed');
                break;
              case 'network':
                errorMessage = getClientTranslation('voice.error.network');
                break;
              default:
                errorMessage = getClientTranslation('voice.error.other', { error: event.error });
            }

            onError?.(errorMessage);
            busyRef.current = false;
            setIsRecording(false);
            setRecordingTime(0);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          };

          recognition.onend = () => {
            busyRef.current = false;
            setIsRecording(false);
            setRecordingTime(0);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
          return;
        }
      }

      // Use MediaRecorder for server-side ASR
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (unmountedRef.current) {
        stopTracks(stream);
        return;
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all audio tracks
        stopTracks(stream);

        // Merge audio chunks
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });

        // Send to server for transcription
        await transcribeAudio(audioBlob);
        busyRef.current = false;
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      busyRef.current = false;
      log.error('Failed to start recording:', error);
      if (!unmountedRef.current) onError?.(getClientTranslation('voice.error.microphone'));
    }
  }, [onTranscription, onError, transcribeAudio, continuous]);

  // Stop recording
  const stopRecording = useCallback(() => {
    // Stop Speech Recognition if active
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
      busyRef.current = false;
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Stop MediaRecorder if active
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      busyRef.current = false;
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // Cancel recording
  const cancelRecording = useCallback(() => {
    // Cancel Speech Recognition if active
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.onresult = null; // Prevent transcription callback
      speechRecognitionRef.current.onerror = null; // Suppress browser abort error events
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
      busyRef.current = false;
      setIsRecording(false);
      setRecordingTime(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Cancel MediaRecorder if active
    if (mediaRecorderRef.current && isRecording) {
      // Stop recording without transcription
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();

      // Stop all audio tracks
      if (mediaRecorderRef.current.stream) {
        stopTracks(mediaRecorderRef.current.stream);
      }

      busyRef.current = false;
      setIsRecording(false);
      setRecordingTime(0);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      audioChunksRef.current = [];
    }
  }, [isRecording]);

  return {
    isRecording,
    isProcessing,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
