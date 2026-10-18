/**
 * What the learner says they study, as the text the course generator reads. The generator
 * already takes the student's bio as "background for personalization"; the subject and level are
 * added to it, so no new field travels through generation.
 */

/** Longest subject or level, in characters. The inputs stop here and the text is cut here again. */
export const LEARNING_FOCUS_MAX = 40;

function clean(value: string): string {
  // One line, so a stray line break cannot start a new section of the prompt.
  return value.replace(/\s+/g, ' ').trim().slice(0, LEARNING_FOCUS_MAX).trim();
}

/** The bio followed by the subject and level, or undefined when there is nothing to send. */
export function composeUserBio(bio: string, subject: string, level: string): string | undefined {
  const focus = [
    clean(subject) && `Studies: ${clean(subject)}.`,
    clean(level) && `Level: ${clean(level)}.`,
  ].filter(Boolean);
  const text = [bio.trim(), ...focus].filter(Boolean).join(' ');
  return text === '' ? undefined : text;
}
