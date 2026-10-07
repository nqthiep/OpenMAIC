/**
 * Harness for `graham-scan` (card 2-I1). stdin: n, then n lines "x y". stdout: the hull vertices as
 * "x y" lines in sorted order (collinear boundary points are not vertices).
 */
type In = { pts: number[][] };

/** Independent oracle: a→b is a hull edge when every other point is strictly left of it or strictly between a and b on it. */
export function hullVertices(pts: number[][]): number[][] {
  const out = new Set<string>();
  for (const a of pts) {
    for (const b of pts) {
      if (a === b) continue;
      const ok = pts.every((c) => {
        if (c === a || c === b) return true;
        const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cr > 0) return true;
        if (cr < 0) return false;
        const dot = (c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1]);
        return dot > 0 && dot < (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      });
      if (ok) out.add(`${a[0]} ${a[1]}`);
    }
  }
  return [...out].map((s) => s.split(' ').map(Number)).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

const harness = {
  entryId: 'graham-scan',
  cppPrelude: ['#include <algorithm>', '#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<P> pts(n);',
    '    for (auto& p : pts) std::cin >> p.x >> p.y;',
    '    auto hull = graham(pts);',
    '    std::sort(hull.begin(), hull.end(), [](P a, P b) { return a.x != b.x ? a.x < b.x : a.y < b.y; });',
    '    for (auto p : hull) std::cout << p.x << " " << p.y << "\\n";',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'pts = [(data[1 + 2 * i], data[2 + 2 * i]) for i in range(n)]',
    'for x, y in sorted(graham(pts)):',
    '    print(x, y)',
  ],
  stdin: ({ pts }: In) => `${pts.length}\n${pts.map(([x, y]) => `${x} ${y}`).join('\n')}\n`,
  expected: ({ pts }: In) =>
    hullVertices(pts)
      .map(([x, y]) => `${x} ${y}`)
      .join('\n'),
};

export default harness;
