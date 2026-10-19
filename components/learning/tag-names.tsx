'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/hooks/use-i18n';
import { readTags, topicName } from '@/lib/learning/taxonomy';

/** The names of a course's tags in the visitor's language, in the taxonomy's order. */
export function useTagNames(tags: readonly string[] | undefined): string[] {
  const { t, locale } = useI18n();
  const { subject, grades, topics } = readTags(tags);
  return [
    ...(subject ? [t(`taxonomy.subject.${subject}`)] : []),
    ...grades.map((grade) => t(`taxonomy.grade.${grade}`)),
    ...topics.map((value) => topicName(value, locale) ?? value),
  ];
}

/** A course's tags as small badges; nothing when it has none. */
export function TagBadges({ tags }: { tags: readonly string[] | undefined }) {
  const names = useTagNames(tags);
  if (names.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((name) => (
        <Badge key={name} variant="secondary" className="font-normal">
          {name}
        </Badge>
      ))}
    </span>
  );
}

/** The subject and grades of a course on one line, such as "Toán · Khối 12"; empty without tags. */
export function useTagLine(tags: readonly string[] | undefined): string {
  const { t } = useI18n();
  const { subject, grades } = readTags(tags);
  return [
    ...(subject ? [t(`taxonomy.subject.${subject}`)] : []),
    ...grades.map((grade) => t(`taxonomy.grade.${grade}`)),
  ].join(' · ');
}
