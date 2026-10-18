import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchClassroomFromApi } from '@/lib/classroom/load-classroom';

const answer = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('fetchClassroomFromApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  // 404 is also what the route answers when the viewer may not read the course.
  it.each([400, 404, 410])('reads HTTP %i as "no such course"', async (status) => {
    vi.stubGlobal('fetch', answer(status));
    await expect(fetchClassroomFromApi('c1')).resolves.toBeNull();
  });

  it.each([500, 503])('throws on HTTP %i so the page offers a retry', async (status) => {
    vi.stubGlobal('fetch', answer(status));
    await expect(fetchClassroomFromApi('c1')).rejects.toThrow(String(status));
  });

  it('returns the classroom on success', async () => {
    const classroom = { stage: { id: 'c1' }, scenes: [{ id: 's1' }] };
    vi.stubGlobal('fetch', answer(200, { success: true, classroom }));
    await expect(fetchClassroomFromApi('c1')).resolves.toEqual(classroom);
  });

  // A shared fixture with `"scenes": []` left the classroom on "Loading…" with 0/0 scenes.
  it('reads a course without scenes as "no such course"', async () => {
    const classroom = { stage: { id: 'c1' }, scenes: [] };
    vi.stubGlobal('fetch', answer(200, { success: true, classroom }));
    await expect(fetchClassroomFromApi('c1')).resolves.toBeNull();
  });
});
