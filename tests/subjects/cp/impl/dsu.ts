/** Harness for `dsu` (card 2-I1). stdin: n m, then m unions "a b". stdout: the number of disjoint sets left. */
type In = { n: number; edges: number[][] };

const harness = {
  entryId: 'dsu',
  cppPrelude: ['#include <iostream>', '#include <utility>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n, m; std::cin >> n >> m;',
    '    std::vector<std::pair<int, int>> edges(m);',
    '    for (auto& e : edges) std::cin >> e.first >> e.second;',
    '    std::cout << count_sets(n, edges) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n, m = data[0], data[1]',
    'edges = [(data[2 + 2 * k], data[3 + 2 * k]) for k in range(m)]',
    'print(count_sets(n, edges))',
  ],
  stdin: ({ n, edges }: In) =>
    `${n} ${edges.length}\n${edges.map(([a, b]) => `${a} ${b}`).join('\n')}\n`,
  // Independent oracle: connected components by repeated BFS over the unioned pairs.
  expected: ({ n, edges }: In) => {
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const [a, b] of edges) {
      adj[a].push(b);
      adj[b].push(a);
    }
    const seen = Array<boolean>(n).fill(false);
    let comps = 0;
    for (let s = 0; s < n; s++) {
      if (seen[s]) continue;
      comps++;
      const q = [s];
      seen[s] = true;
      while (q.length) {
        const u = q.shift() as number;
        for (const v of adj[u])
          if (!seen[v]) {
            seen[v] = true;
            q.push(v);
          }
      }
    }
    return String(comps);
  },
};

export default harness;
