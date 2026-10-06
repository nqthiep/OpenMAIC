/** Harness for `max-flow` (card 2-I1). stdin: n m, m lines "a b cap" (directed). stdout: the maximum flow 0 -> n-1. */
type In = { n: number; edges: number[][] };

const harness = {
  entryId: 'max-flow',
  cppPrelude: [
    '#include <algorithm>',
    '#include <iostream>',
    '#include <queue>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    int n, m; std::cin >> n >> m;',
    '    std::vector<std::vector<int>> cap(n, std::vector<int>(n, 0));',
    '    for (int i = 0; i < m; i++) { int a, b, c; std::cin >> a >> b >> c; cap[a][b] += c; }',
    '    std::cout << max_flow(n, cap) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n, m = data[0], data[1]',
    'cap = [[0] * n for _ in range(n)]',
    'for k in range(m):',
    '    cap[data[2 + 3 * k]][data[3 + 3 * k]] += data[4 + 3 * k]',
    'print(max_flow(n, cap))',
  ],
  stdin: ({ n, edges }: In) =>
    `${n} ${edges.length}\n${edges.map(([a, b, c]) => `${a} ${b} ${c}`).join('\n')}\n`,
  // Independent oracle: the minimum cut over every node set S containing the source and not the sink.
  expected: ({ n, edges }: In) => {
    let best = Infinity;
    for (let mask = 0; mask < 1 << n; mask++) {
      if (!(mask & 1) || (mask >> (n - 1)) & 1) continue;
      let c = 0;
      for (const [a, b, w] of edges) if ((mask >> a) & 1 && !((mask >> b) & 1)) c += w;
      best = Math.min(best, c);
    }
    return String(best);
  },
};

export default harness;
