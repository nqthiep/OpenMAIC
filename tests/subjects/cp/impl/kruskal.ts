/**
 * Harness for `kruskal` (card 2-I1). stdin: n m, then m lines "u v w". stdout: the total weight of a
 * minimum spanning forest. The harness passes (w, u, v) tuples.
 */
type In = { n: number; edges: number[][] };

const harness = {
  entryId: 'kruskal',
  cppPrelude: [
    '#include <algorithm>',
    '#include <iostream>',
    '#include <tuple>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    int n, m; std::cin >> n >> m;',
    '    std::vector<std::tuple<int, int, int>> edges;',
    '    for (int i = 0; i < m; i++) {',
    '        int u, v, w; std::cin >> u >> v >> w;',
    '        edges.push_back({w, u, v});',
    '    }',
    '    std::cout << kruskal(n, edges) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n, m = data[0], data[1]',
    'edges = [(data[4 + 3 * k], data[2 + 3 * k], data[3 + 3 * k]) for k in range(m)]',
    'print(kruskal(n, edges))',
  ],
  stdin: ({ n, edges }: In) =>
    `${n} ${edges.length}\n${edges.map(([u, v, w]) => `${u} ${v} ${w}`).join('\n')}\n`,
  // Independent oracle: Prim on every connected component, summing the chosen weights.
  expected: ({ n, edges }: In) => {
    const seen = Array<boolean>(n).fill(false);
    let total = 0;
    for (let s = 0; s < n; s++) {
      if (seen[s]) continue;
      seen[s] = true;
      for (;;) {
        let best: number[] | null = null;
        for (const [u, v, w] of edges) {
          if (seen[u] !== seen[v] && (best === null || w < best[2])) best = [u, v, w];
        }
        if (!best) break;
        seen[best[0]] = true;
        seen[best[1]] = true;
        total += best[2];
      }
    }
    return String(total);
  },
};

export default harness;
