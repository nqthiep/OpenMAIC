/**
 * Harness for `dfs` (card 2-I1). stdin: n m, m edges "a b", then the source. stdout: for each node
 * 1 if the DFS visited it, else 0. The harness builds sorted adjacency lists.
 */
type In = { g: { n: number; edges: number[][] }; source: number };

const harness = {
  entryId: 'dfs',
  cppPrelude: ['#include <algorithm>', '#include <iostream>', '#include <vector>'],
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
    '    std::vector<int> order(n, 0);',
    '    int timer = 0;',
    '    dfs(s, adj, order, timer);',
    '    for (int i = 0; i < n; i++) std::cout << (order[i] != 0 ? 1 : 0) << (i + 1 < n ? " " : "");',
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
    'order = [0] * n',
    'dfs(data[2 + 2 * m], adj, order, [0])',
    "print(' '.join('1' if x else '0' for x in order))",
  ],
  stdin: ({ g, source }: In) =>
    `${g.n} ${g.edges.length}\n${g.edges.map(([a, b]) => `${a} ${b}`).join('\n')}\n${source}\n`,
  // Independent oracle: the nodes reachable from the source (transitive closure), no DFS.
  expected: ({ g, source }: In) => {
    const reach = new Set([source]);
    for (let round = 0; round < g.n; round++)
      for (const [a, b] of g.edges) {
        if (reach.has(a)) reach.add(b);
        if (reach.has(b)) reach.add(a);
      }
    return Array.from({ length: g.n }, (_, i) => (reach.has(i) ? 1 : 0)).join(' ');
  },
};

export default harness;
