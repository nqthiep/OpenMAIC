/** The part of an ECharts instance the usage chart's lifecycle relies on. */
export interface ChartInstance {
  getDom(): HTMLElement;
  dispose(): void;
}

/**
 * The instance to draw into for the current container. The chart is not rendered
 * while its data is empty, so its container can be removed and later added back as
 * a new element. An instance still bound to the old element draws into nothing, so
 * it is disposed, and a new one is created for the new container.
 */
export function chartInstanceFor<T extends ChartInstance>(
  current: T | null,
  container: HTMLElement | null,
  create: (container: HTMLElement) => T,
): T | null {
  if (current && current.getDom() === container) return current;
  current?.dispose();
  return container ? create(container) : null;
}
