import { describe, expect, it } from 'vitest';
import { suggestTags } from '@/lib/learning/tag-suggest';
import { SUBJECTS, TOPICS, topicValue, validateTags } from '@/lib/learning/taxonomy';

describe('suggestTags', () => {
  it('finds a subject and topic from a Vietnamese title, with or without accents', () => {
    expect(suggestTags(['Đạo hàm cơ bản'])).toEqual(['subject:math', 'topic:math.derivative']);
    expect(suggestTags(['dao ham co ban'])).toEqual(['subject:math', 'topic:math.derivative']);
  });

  it('reads the grade and uses scene titles too', () => {
    expect(suggestTags(['Sóng cơ học lớp 11', 'Giao thoa sóng'])).toEqual([
      'subject:physics',
      'grade:11',
      'topic:physics.waves',
    ]);
    expect(suggestTags(['Ngữ pháp tiếng Anh', 'Khối 12'])).toEqual([
      'subject:english',
      'grade:12',
      'topic:english.grammar',
    ]);
  });

  it('reads grades 5 and 9, and does not take a bigger number for them', () => {
    expect(suggestTags(['Phân số lớp 5'])).toContain('grade:5');
    expect(suggestTags(['Hệ phương trình lớp 9'])).toContain('grade:9');
    expect(suggestTags(['Hệ phương trình lớp 90'])).not.toContain('grade:9');
    expect(suggestTags(['Đạo hàm lớp 10'])).toContain('grade:10');
    expect(suggestTags(['Đạo hàm lớp 10'])).not.toContain('grade:5');
  });

  it('works on English titles and short whole-word keywords', () => {
    expect(suggestTags(['Introduction to Python programming'])).toEqual([
      'subject:informatics',
      'topic:informatics.python',
    ]);
    expect(suggestTags(['DNA replication'])).toEqual([
      'subject:biology',
      'topic:biology.molecular_genetics',
    ]);
    // "arn" must be a word of its own: a name that starts with it is not RNA.
    expect(suggestTags(['Arnold and the reading club'])).toEqual([
      'subject:english',
      'topic:english.reading',
    ]);
  });

  it('takes the subject with most topics and at most three topics, keeping the best matched', () => {
    const tags = suggestTags([
      'Đạo hàm, giới hạn và tích phân',
      'Ôn tập đạo hàm',
      'Xác suất',
      'Lượng giác',
      'Sóng cơ',
    ]);
    expect(tags[0]).toBe('subject:math');
    const topics = tags.filter((tag) => tag.startsWith('topic:'));
    expect(topics).toHaveLength(3);
    // The one named twice is kept; the list itself is in the taxonomy's order.
    expect(topics).toContain('topic:math.derivative');
    expect(tags).not.toContain('topic:physics.waves');
  });

  it('names a subject without a topic only when exactly one is named', () => {
    expect(suggestTags(['Ôn thi Vật lí'])).toEqual(['subject:physics']);
    expect(suggestTags(['Toán học vui'])).toEqual(['subject:math']);
    expect(suggestTags(['Vật lí và Hoá học'])).toEqual([]);
  });

  it('does not take "toàn" or "bài toán" for the subject, and gives nothing when unsure', () => {
    expect(suggestTags(['Toàn bộ kiến thức cần nhớ'])).toEqual([]);
    expect(suggestTags(['Bài toán chuyển động'])).toEqual([]);
    expect(suggestTags(['Fractions basics'])).toEqual([]);
    expect(suggestTags([])).toEqual([]);
    expect(suggestTags(['', '   '])).toEqual([]);
  });

  it('always returns a list the server accepts', () => {
    const every = SUBJECTS.flatMap((subject) =>
      TOPICS[subject].map((topic) => topicValue(subject, topic.id)),
    );
    // Feed every topic's own name: whatever comes back must validate.
    for (const value of every) {
      const [subject, id] = value.split('.') as [keyof typeof TOPICS, string];
      const name = TOPICS[subject].find((topic) => topic.id === id)!.vi;
      expect(validateTags(suggestTags([name])).ok).toBe(true);
    }
  });
});
