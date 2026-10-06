/**
 * Harness for `bfs` (card 2-I1). stdin: n m, m edges "a b", then the source. stdout: the distances
 * d[0..n-1] separated by spaces (-1 when unreachable). The harness builds sorted adjacency lists.
 */
type In = { g: { n: number; edges: number[][] }; source: number };

const harness = {
  entryId: 'bfs',
  cppPrelude: [
    '#include <algorithm>',
    '#include <iostream>',
    '#include <queue>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    int n, m; std::cin >> n >> m;',
    '    std::vector<std::vector<int>> adj(n);',
    '    for (int i = 0; i < m; i++) {',
    '        int a, b; std::cin >> a >> b;',
    '        adj[a].push_back(b);',
    '        adj[b].push_back(a);',
    '    }',
    '    for (auto& list : adj) std::sort(list.begin(), list.end());',
    '    int s; std::cin >> s;',
    '    std::vector<int> d = bfs(n, adj, s);',
    '    for (int i = 0; i < n; i++) std::cout << d[i] << (i + 1 < n ? " " : "");',
    '    std::cout << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n, m = data[0], data[1]',
    'adj = [[] for _ in range(n)]',
    'for k in range(m):',
    '    a, b = data[2 + 2 * k], data[3 + 2 * k]',
    '    adj[a].append(b)',
    '    adj[b].append(a)',
    'for lst in adj:',
    '    lst.sort()',
    "print(' '.join(map(str, bfs(n, adj, data[2 + 2 * m]))))",
  ],
  stdin: ({ g, source }: In) =>
    `${g.n} ${g.edges.length}\n${g.edges.map(([a, b]) => `${a} ${b}`).join('\n')}\n${source}\n`,
  // Independent oracle: Bellman-Ford with unit weights.
  expected: ({ g, source }: In) => {
    const INF = 1e9;
    const d = Array<number>(g.n).fill(INF);
    d[source] = 0;
    for (let round = 0; round < g.n; round++) {
      for (const [a, b] of g.edges) {
        if (d[a] + 1 < d[b]) d[b] = d[a] + 1;
        if (d[b] + 1 < d[a]) d[a] = d[b] + 1;
      }
    }
    return d.map((x) => (x >= INF ? -1 : x)).join(' ');
  },
};

export default harness;
