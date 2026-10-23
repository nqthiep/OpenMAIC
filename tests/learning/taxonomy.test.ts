import { describe, expect, it } from 'vitest';
import {
  GRADES,
  MAX_GRADES,
  MAX_TOPICS,
  SUBJECTS,
  TOPICS,
  readTags,
  subjectOfTopic,
  tagsFor,
  topicName,
  topicValue,
  validateTags,
} from '@/lib/learning/taxonomy';

describe('the tag set', () => {
  it('gives every subject but "other" some topics, with unique ids and both names', () => {
    for (const subject of SUBJECTS) {
      const topics = TOPICS[subject];
      if (subject === 'other') expect(topics).toHaveLength(0);
      else expect(topics.length).toBeGreaterThan(0);
      expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length);
      for (const topic of topics) {
        expect(topic.id).toMatch(/^[a-z][a-z_]*$/);
        expect(topic.vi.trim()).not.toBe('');
        expect(topic.en.trim()).not.toBe('');
      }
    }
  });

  it('names a topic in Vietnamese for vi and in English for every other language', () => {
    expect(topicName('math.derivative', 'vi-VN')).toBe('Đạo hàm và khảo sát hàm số');
    expect(topicName('math.derivative', 'en-US')).toBe('Derivatives and function study');
    expect(topicName('math.derivative', 'ar-SA')).toBe('Derivatives and function study');
    expect(topicName('math.nope', 'vi-VN')).toBeUndefined();
    expect(subjectOfTopic(topicValue('physics', 'waves'))).toBe('physics');
  });
});

describe('validateTags', () => {
  it('accepts a good set and returns it in the fixed order', () => {
    const result = validateTags([
      'topic:math.limits',
      'grade:12',
      'grade:11',
      'subject:math',
      'topic:math.derivative',
    ]);
    expect(result).toEqual({
      ok: true,
      tags: ['subject:math', 'grade:11', 'grade:12', 'topic:math.limits', 'topic:math.derivative'],
    });
  });

  it('accepts an empty list, a subject alone, and "other" with no topic', () => {
    expect(validateTags([])).toEqual({ ok: true, tags: [] });
    expect(validateTags(['subject:english'])).toEqual({ ok: true, tags: ['subject:english'] });
    expect(validateTags(['subject:other', 'grade:10'])).toMatchObject({ ok: true });
  });

  it('refuses tags that are not in the set, are not text, or repeat', () => {
    expect(validateTags(['subject:art'])).toMatchObject({ ok: false });
    expect(validateTags(['grade:8'])).toMatchObject({ ok: false });
    expect(validateTags(['grade:6'])).toMatchObject({ ok: false });
    expect(validateTags(['topic:math.nope'])).toMatchObject({ ok: false });
    expect(validateTags(['math'])).toMatchObject({ ok: false });
    expect(validateTags([7])).toMatchObject({ ok: false });
    expect(validateTags(['grade:10', 'grade:10'])).toMatchObject({ ok: false });
  });

  it('enforces one subject, the grade and topic limits, and that a topic fits the subject', () => {
    expect(validateTags(['subject:math', 'subject:physics'])).toMatchObject({
      ok: false,
      error: expect.stringContaining('one subject'),
    });
    expect(GRADES.length).toBeGreaterThan(MAX_GRADES);
    expect(validateTags(GRADES.map((g) => `grade:${g}`))).toMatchObject({ ok: false });
    const four = TOPICS.math.slice(0, MAX_TOPICS + 1).map((t) => `topic:math.${t.id}`);
    expect(validateTags(['subject:math', ...four])).toMatchObject({ ok: false });
    expect(validateTags(['subject:math', 'topic:physics.waves'])).toMatchObject({ ok: false });
    // A topic without its subject is refused too.
    expect(validateTags(['topic:math.limits'])).toMatchObject({ ok: false });
  });
});

describe('the years the site is for', () => {
  it('are 5, 9, 10, 11 and 12, in that order', () => {
    expect(GRADES).toEqual(['5', '9', '10', '11', '12']);
  });

  it('accept grade 5 and grade 9 with a subject', () => {
    expect(validateTags(['subject:math', 'grade:5'])).toMatchObject({ ok: true });
    expect(validateTags(['subject:informatics', 'grade:9'])).toMatchObject({ ok: true });
  });

  it('keep the order 5, 9, 10, 11, 12 when a course carries two of them', () => {
    expect(tagsFor(readTags(['grade:12', 'grade:9', 'subject:math']))).toEqual([
      'subject:math',
      'grade:9',
      'grade:12',
    ]);
  });
});

describe('readTags and tagsFor', () => {
  it('split a stored list and ignore what is not in the set', () => {
    expect(readTags(['subject:math', 'grade:12', 'topic:math.limits', 'junk', 'grade:8'])).toEqual({
      subject: 'math',
      grades: ['12'],
      topics: ['math.limits'],
    });
    expect(readTags(undefined)).toEqual({ subject: undefined, grades: [], topics: [] });
    expect(tagsFor(readTags(['grade:12', 'subject:math']))).toEqual(['subject:math', 'grade:12']);
  });
});
