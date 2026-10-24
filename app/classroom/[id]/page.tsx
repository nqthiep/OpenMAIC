'use client';

import { ClassroomSurface } from '@/components/classroom/ClassroomSurface';
import { useCourseProgress } from '@/lib/hooks/use-course-progress';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';
import { useStageStore } from '@/lib/store';
import { useParams } from 'next/navigation';

export default function ClassroomDetailPage() {
  const params = useParams<{ id: string }>();
  // The two hooks below are KHAITAM's: the tab title and the learner's progress record.
  const stage = useStageStore((s) => s.stage);
  useDocumentTitle(stage?.name);
  useCourseProgress(params.id, stage?.id === params.id);

  return <ClassroomSurface classroomId={params.id} variant="page" />;
}
