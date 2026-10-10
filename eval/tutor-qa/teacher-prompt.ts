// System prompt of the answerer in eval:tutor-qa. Pure: the runner passes the production
// TUTOR_COACHING and WALKTHROUGH_ANSWER_POLICY in, so a test can run without the chat stack.
//
// PROXY, not the production prompt. In production the teacher prompt is assembled per request in
// lib/chat/pi/prompts.ts (buildChildPrompt / buildNativeChildPrompt) from the agent config, peer
// context, actions and whiteboard state, and its role and length helpers (`buildRoleGuideline`,
// `buildLengthGuidelines`) are module-private, so they cannot be imported here without a request
// context. This prompt copies the teacher-role and walkthrough length lines of those helpers and
// uses the real TUTOR_COACHING and WALKTHROUGH_ANSWER_POLICY (imported by the runner from
// lib/orchestration/prompt-builder.ts). The eval is always a walkthrough, so it carries the
// walkthrough variant, in either answer mode (OPENMAIC_TUTOR_HINT_FIRST): hint-first drops the
// "give the key insight" line and puts the answer policy in place of "lead with the direct
// answer"; direct keeps those two lines. If those helpers change, update this file; it will not
// follow them by itself.

export function buildTeacherSystem(opts: {
  entryId: string;
  locale: string;
  digest: string;
  /** `TUTOR_COACHING` from lib/orchestration/prompt-builder.ts. */
  coaching: string;
  /** `WALKTHROUGH_ANSWER_POLICY` from lib/orchestration/prompt-builder.ts. */
  answerPolicy: string;
  /** `isTutorHintFirstEnabled()`: the answer mode this run measures. */
  hintFirst: boolean;
}): string {
  return [
    `You are the lead teacher in a live classroom lesson about ${opts.entryId}, talking to a school student. Reply in ${opts.locale}.`,
    '',
    '# Classroom Role',
    'Your role in this classroom: LEAD TEACHER.',
    '- Control lesson flow, slides, and pacing.',
    '- Explain concepts clearly, but avoid exhaustive lectures.',
    '- Ask questions to check understanding.',
    '',
    '# Length & Style (CRITICAL)',
    '- Keep your TOTAL visible speech around 300 characters.',
    '- This is a hard cap, not a suggestion.',
    ...(opts.hintFirst
      ? []
      : ['- Give the key insight in one crisp sentence, then optionally ask one short question.']),
    '- Avoid exhaustive explanations unless the user explicitly asks for depth.',
    opts.coaching,
    '- Speak conversationally and naturally. This is live classroom speech, not an essay.',
    '- NEVER use markdown formatting, headings, bullet lists, bold markers, blockquotes, or code fences in visible speech.',
    opts.hintFirst
      ? opts.answerPolicy
      : '- Lead with the direct answer when the user asked a concrete question.',
    '- Ask at most one short follow-up question.',
    '',
    'Lesson context (what the student is looking at):',
    opts.digest,
  ].join('\n');
}
