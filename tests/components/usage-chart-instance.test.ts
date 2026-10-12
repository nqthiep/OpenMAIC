import { describe, expect, it, vi } from 'vitest';
import { chartInstanceFor } from '@/components/settings/usage-chart-instance';

/** A stand-in for an ECharts instance: it is bound to one container element. */
function fakeChart(container: HTMLElement) {
  return {
    getDom: () => container,
    dispose: vi.fn(),
  };
}

describe('chartInstanceFor', () => {
  it('creates an instance for the first container', () => {
    const node = {} as HTMLElement;
    const create = vi.fn(fakeChart);

    const chart = chartInstanceFor(null, node, create);

    expect(create).toHaveBeenCalledTimes(1);
    expect(chart?.getDom()).toBe(node);
  });

  it('keeps the same instance while the container is unchanged', () => {
    const node = {} as HTMLElement;
    const create = vi.fn(fakeChart);
    const first = chartInstanceFor(null, node, create);

    const again = chartInstanceFor(first, node, create);

    expect(again).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(first?.dispose).not.toHaveBeenCalled();
  });

  it('disposes the instance when its container is removed, and returns nothing to draw into', () => {
    const node = {} as HTMLElement;
    const first = chartInstanceFor(null, node, fakeChart);

    const next = chartInstanceFor(first, null, fakeChart);

    expect(first?.dispose).toHaveBeenCalledTimes(1);
    expect(next).toBeNull();
  });

  it('draws into a new container after the old one was removed, not into the detached element', () => {
    const removed = {} as HTMLElement;
    const added = {} as HTMLElement;
    const first = chartInstanceFor(null, removed, fakeChart);
    const hidden = chartInstanceFor(first, null, fakeChart);

    const restored = chartInstanceFor(hidden, added, fakeChart);

    expect(restored).not.toBe(first);
    expect(restored?.getDom()).toBe(added);
    expect(first?.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the old instance when the container is replaced without an empty step', () => {
    const before = {} as HTMLElement;
    const after = {} as HTMLElement;
    const first = chartInstanceFor(null, before, fakeChart);

    const next = chartInstanceFor(first, after, fakeChart);

    expect(first?.dispose).toHaveBeenCalledTimes(1);
    expect(next?.getDom()).toBe(after);
  });
});
