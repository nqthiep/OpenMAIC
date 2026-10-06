/**
 * Harness for `dijkstra` (card 2-I1). stdin: n m, m lines "a b w", then the source. stdout: dist[0..n-1]
 * with -1 for unreachable nodes. The harness builds the adjacency lists (v, w) sorted by v.
 */
type In = { g: { n: number; edges: number[][] }; source: number };

const harness = {
  entryId: 'dijkstra',
  cppPrelude: [
    '#include <algorithm>',
    '#include <functional>',
    '#include <iostream>',
    '#include <queue>',
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
    '    int s; std::cin >> s;',
    '    std::vector<int> d = dijkstra(n, adj, s);',
    '    for (int i = 0; i < n; i++) std::cout << (d[i] == 1000000000 ? -1 : d[i]) << (i + 1 < n ? " " : "");',
    '    std::cout << std::endl;',
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
    'd = dijkstra(n, adj, data[2 + 3 * m])',
    "print(' '.join(str(-1 if x == 10 ** 9 else x) for x in d))",
  ],
  stdin: ({ g, source }: In) =>
    `${g.n} ${g.edges.length}\n${g.edges.map(([a, b, w]) => `${a} ${b} ${w}`).join('\n')}\n${source}\n`,
  // Independent oracle: Bellman-Ford.
  expected: ({ g, source }: In) => {
    const INF = 1e9;
    const d = Array<number>(g.n).fill(INF);
    d[source] = 0;
    for (let round = 0; round < g.n; round++)
      for (const [a, b, w] of g.edges) {
        if (d[a] + w < d[b]) d[b] = d[a] + w;
        if (d[b] + w < d[a]) d[a] = d[b] + w;
      }
    return d.map((x) => (x >= INF ? -1 : x)).join(' ');
  },
};

export default harness;
