import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { getRuntimeJs } from '@/lib/tutor/build/runtimes';

describe('runtime walkthrough sinh sẵn', () => {
  it('file sinh ra còn mới so với lib/tutor/runtime', () => {
    try {
      execFileSync(process.execPath, ['scripts/generate-tutor-runtime.mjs', '--check'], {
        cwd: process.cwd(),
        stdio: 'pipe',
        encoding: 'utf8',
      });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      throw new Error(
        `Runtime sinh sẵn đã cũ. Chạy lại script: pnpm gen:tutor-runtime\n${err.stdout ?? ''}${err.stderr ?? ''}`,
      );
    }
  });

  it('getRuntimeJs("array") là chuỗi JS an toàn để nhúng vào <script>', () => {
    const js = getRuntimeJs('array');
    expect(typeof js).toBe('string');
    expect(js!.length).toBeGreaterThan(0);
    expect(js).not.toContain('</script');
    expect(js).not.toContain('<!--');
  });

  it('visualizer lạ trả null', () => {
    expect(getRuntimeJs('nope')).toBeNull();
    expect(getRuntimeJs('toString')).toBeNull();
  });
});
