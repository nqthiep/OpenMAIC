import { describe, expect, it } from 'vitest';

import { getTutorLabels } from '@/lib/tutor/provider';

describe('getTutorLabels: Vietnamese words for the prediction answer and the load error', () => {
  it('vi-VN carries the answer and load-error labels', () => {
    const labels = getTutorLabels('vi-VN');
    expect(labels.answer).toBe('Đáp án đúng');
    expect(labels.loadError).toBe('Không tải được nội dung bài học.');
  });
});
