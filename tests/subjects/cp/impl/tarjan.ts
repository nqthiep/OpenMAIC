/** Harness for `tarjan` (card 2-I1). stdin: n m, m directed edges "a b". stdout: the number of strongly connected components. */
type In = { n: number; edges: number[][] };

const harness = {
  entryId: 'tarjan',
  cppPrelude: ['#include <algorithm>', '#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n, m; std::cin >> n >> m;',
    '    std::vector<std::vector<int>> adj(n);',
    '    for (int i = 0; i < m; i++) { int a, b; std::cin >> a >> b; adj[a].push_back(b); }',
    '    for (auto& l : adj) std::sort(l.begin(), l.end());',
    '    std::cout << count_scc(n, adj) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n, m = data[0], data[1]',
    'adj = [[] for _ in range(n)]',
    'for k in range(m):',
    '    adj[data[2 + 2 * k]].append(data[3 + 2 * k])',
    'for l in adj:',
    '    l.sort()',
    'print(count_scc(n, adj))',
  ],
  stdin: ({ n, edges }: In) =>
    `${n} ${edges.length}\n${edges.map(([a, b]) => `${a} ${b}`).join('\n')}\n`,
  // Independent oracle: Kosaraju-free, by mutual reachability (transitive closure) classes.
  expected: ({ n, edges }: In) => {
    const reach = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j));
    for (const [a, b] of edges) reach[a][b] = true;
    for (let k = 0; k < n; k++)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) if (reach[i][k] && reach[k][j]) reach[i][j] = true;
    const seen = Array<boolean>(n).fill(false);
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (seen[i]) continue;
      c++;
      for (let j = 0; j < n; j++) if (reach[i][j] && reach[j][i]) seen[j] = true;
    }
    return String(c);
  },
};

export default harness;
