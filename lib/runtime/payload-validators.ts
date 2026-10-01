import { isChatMessageSkeleton, isQuizAttemptSkeleton } from '@openmaic/dsl';
import type { RuntimePayloadValidator } from '@openmaic/storage';

import { whiteboardRuntimePayloadValidator } from '@/lib/whiteboard/runtime/validate';

const chat: RuntimePayloadValidator = (payload) =>
  isChatMessageSkeleton(payload)
    ? { valid: true }
    : {
        valid: false,
        errors: [
          {
            path: '/payload',
            message: 'chat payload must match ChatMessageSkeleton (role + content)',
          },
        ],
      };

const quizAttempt: RuntimePayloadValidator = (payload) =>
  isQuizAttemptSkeleton(payload)
    ? { valid: true }
    : {
        valid: false,
        errors: [
          {
            path: '/payload',
            message: 'quizAttempt payload must match QuizAttemptSkeleton (phase + answers)',
          },
        ],
      };

const TUTOR_LEARNING_MAX_BYTES = 2048;
const MODERATION_CATEGORIES: readonly string[] = [
  'sexual',
  'violence',
  'self-harm',
  'hate',
  'personal-data',
  'dangerous-offtopic',
];

type TutorFieldKind = 'string' | 'int' | 'bool';

/** Exact key set per `type` (INTERFACES §8.3). */
const TUTOR_LEARNING_SHAPES: Readonly<Record<string, Readonly<Record<string, TutorFieldKind>>>> = {
  beat: {
    sceneId: 'string',
    walkthroughId: 'string',
    entryRev: 'int',
    preset: 'string',
    beatId: 'string',
    occurrence: 'int',
    at: 'string',
  },
  prediction: { sceneId: 'string', beatId: 'string', correct: 'bool', skipped: 'bool' },
  hint: { sceneId: 'string', beatId: 'string', level: 'int' },
  rating: { stageId: 'string', easy: 'int' },
  // No free-text field: categories and direction only.
  moderation: { direction: 'string' },
};

function tutorLearningErrors(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return ['tutorLearning payload must be an object'];
  }
  const rec = payload as Record<string, unknown>;
  const type = rec.type;
  if (typeof type !== 'string' || !Object.hasOwn(TUTOR_LEARNING_SHAPES, type)) {
    return ['tutorLearning type must be one of beat|prediction|hint|rating|moderation'];
  }
  const shape = TUTOR_LEARNING_SHAPES[type];
  const allowed = new Set<string>(['type', ...Object.keys(shape)]);
  if (type === 'moderation') allowed.add('categories');
  const errors: string[] = [];
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) errors.push(`unknown key "${key}"`);
  }
  for (const [key, kind] of Object.entries(shape)) {
    const v = rec[key];
    const ok =
      kind === 'string'
        ? typeof v === 'string'
        : kind === 'int'
          ? typeof v === 'number' && Number.isInteger(v)
          : typeof v === 'boolean';
    if (!ok) errors.push(`"${key}" must be a ${kind}`);
  }
  if (type === 'moderation') {
    if (rec.direction !== 'in' && rec.direction !== 'out') {
      errors.push('"direction" must be "in" or "out"');
    }
    const cats = rec.categories;
    if (
      !Array.isArray(cats) ||
      !cats.every((c) => typeof c === 'string' && MODERATION_CATEGORIES.includes(c))
    ) {
      errors.push('"categories" must be an array of known moderation categories');
    }
  }
  if (errors.length === 0 && JSON.stringify(payload).length > TUTOR_LEARNING_MAX_BYTES) {
    errors.push(`record exceeds ${TUTOR_LEARNING_MAX_BYTES} bytes`);
  }
  return errors;
}

const tutorLearning: RuntimePayloadValidator = (payload) => {
  const errors = tutorLearningErrors(payload);
  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors: errors.map((message) => ({ path: '/payload', message })) };
};

/** Complete app validator table. RuntimeStore options replace their defaults. */
export const APP_RUNTIME_PAYLOAD_VALIDATORS = Object.freeze({
  chat,
  quizAttempt,
  tutorLearning,
  whiteboard: whiteboardRuntimePayloadValidator,
}) satisfies Readonly<Record<string, RuntimePayloadValidator>>;
