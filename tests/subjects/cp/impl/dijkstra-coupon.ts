/**
 * Harness for `dijkstra-coupon` (card 2-I1). stdin: n m, m lines "a b w". stdout: the least cost from 0
 * to n-1 with one free edge, or -1. The harness builds the adjacency lists (v, w) sorted by v.
 */
type In = { n: number; edges: number[][] };

const harness = {
  entryId: 'dijkstra-coupon',
  cppPrelude: [
    '#include <algorithm>',
    '#include <functional>',
    '#include <iostream>',
    '#include <queue>',
    '#include <tuple>',
    '#include <utility>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    int n, m; std::cin >> n >> m;',
    '    std::vector<std::vector<std::pair<int, int>>> adj(n);',
    '    for (int i = 0; i < m; i++) {',
    '        int a, b, w; std::cin >> a >> b >> w;',
    '        adj[a].push_back({b, w});',
    '        adj[b].push_back({a, w});',
    '    }',
    '    for (auto& list : adj) std::sort(list.begin(), list.end());',
    '    std::cout << min_cost_with_coupon(n, adj) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n, m = data[0], data[1]',
    'adj = [[] for _ in range(n)]',
    'for k in range(m):',
    '    a, b, w = data[2 + 3 * k], data[3 + 3 * k], data[4 + 3 * k]',
    '    adj[a].append((b, w))',
    '    adj[b].append((a, w))',
    'for lst in adj:',
    '    lst.sort()',
    'print(min_cost_with_coupon(n, adj))',
  ],
  stdin: ({ n, edges }: In) =>
    `${n} ${edges.length}\n${edges.map(([a, b, w]) => `${a} ${b} ${w}`).join('\n')}\n`,
  // Independent oracle: for every edge set its weight to 0 and run Bellman-Ford; also the plain graph.
  expected: ({ n, edges }: In) => {
    const INF = 1e9;
    const bellman = (es: number[][]): number => {
      const d = Array<number>(n).fill(INF);
      d[0] = 0;
      for (let round = 0; round < n; round++)
        for (const [a, b, w] of es) {
          if (d[a] + w < d[b]) d[b] = d[a] + w;
          if (d[b] + w < d[a]) d[a] = d[b] + w;
        }
      return d[n - 1];
    };
    let best = bellman(edges);
    edges.forEach((_, i) => {
      best = Math.min(
        best,
        bellman(edges.map(([a, b, w], k) => (k === i ? [a, b, 0] : [a, b, w]))),
      );
    });
    return String(best >= INF ? -1 : best);
  },
};

export default harness;
