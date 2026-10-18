import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProgress } from '@/components/learning/learning-api';

/** An answer like the route's: one row per id asked for, refused above 100 ids as the route does. */
function stubProgressRoute() {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      const raw = new URL(url, 'http://localhost').searchParams.get('courseIds');
      const ids = raw === null ? [] : raw.split(',').filter(Boolean);
      if (ids.length > 100) {
        return new Response(JSON.stringify({ success: false, errorCode: 'INVALID' }), {
          status: 400,
        });
      }
      const progress = ids.map((courseId) => ({ courseId }));
      return new Response(JSON.stringify({ success: true, progress }), { status: 200 });
    }),
  );
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchProgress', () => {
  it('answers for 250 courses by asking in batches of at most 50 ids', async () => {
    const urls = stubProgressRoute();
    const ids = Array.from({ length: 250 }, (_, index) => `course-${index}`);

    const rows = await fetchProgress(ids);

    expect(rows.map((row) => row.courseId)).toEqual(ids);
    expect(urls).toHaveLength(5);
  });

  it('keeps one request for a short list and none for an empty one', async () => {
    const urls = stubProgressRoute();

    expect(await fetchProgress(['a', 'b'])).toHaveLength(2);
    expect(urls).toHaveLength(1);
    expect(await fetchProgress([])).toEqual([]);
    expect(urls).toHaveLength(1);
  });

  it('without ids asks for the courses studied last', async () => {
    const urls = stubProgressRoute();

    await fetchProgress();

    expect(urls).toEqual(['/api/progress']);
  });
});
