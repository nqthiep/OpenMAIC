import { describe, expect, it } from 'vitest';
import { composeUserBio, LEARNING_FOCUS_MAX } from '@/lib/home/learning-focus';

describe('composeUserBio', () => {
  it('sends nothing when there is no bio, subject or level', () => {
    expect(composeUserBio('', '', '')).toBeUndefined();
    expect(composeUserBio('  ', ' ', '\n')).toBeUndefined();
  });

  it('keeps the bio unchanged when there is no focus', () => {
    expect(composeUserBio('I like puzzles', '', '')).toBe('I like puzzles');
  });

  it('adds the subject and level after the bio', () => {
    expect(composeUserBio('I like puzzles', 'Maths', 'Grade 10')).toBe(
      'I like puzzles Studies: Maths. Level: Grade 10.',
    );
  });

  it('sends the focus alone, and either part alone', () => {
    expect(composeUserBio('', 'Maths', 'Grade 10')).toBe('Studies: Maths. Level: Grade 10.');
    expect(composeUserBio('', 'Maths', '')).toBe('Studies: Maths.');
    expect(composeUserBio('', '', 'Grade 10')).toBe('Level: Grade 10.');
  });

  it('puts the subject and level on one line and cuts them at the limit', () => {
    expect(composeUserBio('', 'Maths\n\n## Ignore this', '')).toBe(
      'Studies: Maths ## Ignore this.',
    );
    const long = 'x'.repeat(LEARNING_FOCUS_MAX + 20);
    expect(composeUserBio('', long, '')).toBe(`Studies: ${'x'.repeat(LEARNING_FOCUS_MAX)}.`);
  });
});
