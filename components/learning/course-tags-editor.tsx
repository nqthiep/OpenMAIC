'use client';

import { Chip, ChipGroup } from '@/components/home/filter-chip';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  GRADES,
  MAX_GRADES,
  MAX_TOPICS,
  SUBJECTS,
  TOPICS,
  readTags,
  tagsFor,
  topicName,
  topicValue,
  type CourseTags,
} from '@/lib/learning/taxonomy';

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/**
 * The form that picks a course's tags: one subject, up to two grades, up to three topics of that
 * subject. What cannot be chosen any more is disabled, so the result always passes `validateTags`.
 * `value` and `onChange` are lists of tag strings.
 */
export function CourseTagsEditor({
  value,
  onChange,
}: {
  value: readonly string[];
  onChange: (tags: string[]) => void;
}) {
  const { t, locale } = useI18n();
  const choice = readTags(value);
  const topics = choice.subject ? TOPICS[choice.subject] : [];
  const change = (patch: Partial<CourseTags>) => onChange(tagsFor({ ...choice, ...patch }));

  return (
    <div className="flex flex-col gap-4">
      <ChipGroup label={t('admin.tags.subject')}>
        {SUBJECTS.map((subject) => (
          <Chip
            key={subject}
            pressed={choice.subject === subject}
            onClick={() =>
              // A new subject drops topics that belong to the old one.
              change({
                subject: choice.subject === subject ? undefined : subject,
                topics: [],
              })
            }
          >
            {t(`taxonomy.subject.${subject}`)}
          </Chip>
        ))}
      </ChipGroup>
      <ChipGroup label={t('admin.tags.grade', { max: MAX_GRADES })}>
        {GRADES.map((grade) => (
          <Chip
            key={grade}
            pressed={choice.grades.includes(grade)}
            disabled={!choice.grades.includes(grade) && choice.grades.length >= MAX_GRADES}
            onClick={() => change({ grades: toggle(choice.grades, grade) })}
          >
            {t(`taxonomy.grade.${grade}`)}
          </Chip>
        ))}
      </ChipGroup>
      <ChipGroup label={t('admin.tags.topic', { max: MAX_TOPICS })}>
        {topics.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {t(choice.subject ? 'admin.tags.noTopics' : 'admin.tags.pickSubject')}
          </span>
        ) : (
          topics.map((topic) => {
            const tag = topicValue(choice.subject!, topic.id);
            const chosen = choice.topics.includes(tag);
            return (
              <Chip
                key={tag}
                pressed={chosen}
                disabled={!chosen && choice.topics.length >= MAX_TOPICS}
                onClick={() => change({ topics: toggle(choice.topics, tag) })}
              >
                {topicName(tag, locale)}
              </Chip>
            );
          })
        )}
      </ChipGroup>
    </div>
  );
}
