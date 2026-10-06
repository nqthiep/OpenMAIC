/** Harness for `dp-tree` (card 2-I1). stdin: n, n-1 edges "a b", n weights. stdout: the maximum independent-set weight. */
type In = { g: { n: number; edges: number[][] }; w: number[] };

const harness = {
  entryId: 'dp-tree',
  cppPrelude: ['#include <algorithm>', '#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<std::vector<int>> adj(n);',
    '    for (int i = 0; i + 1 < n; i++) {',
    '        int a, b; std::cin >> a >> b;',
    '        adj[a].push_back(b);',
    '        adj[b].push_back(a);',
    '    }',
    '    std::vector<int> w(n);',
    '    for (int& x : w) std::cin >> x;',
    '    std::cout << max_independent(n, adj, w) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'adj = [[] for _ in range(n)]',
    'for k in range(n - 1):',
    '    a, b = data[1 + 2 * k], data[2 + 2 * k]',
    '    adj[a].append(b)',
    '    adj[b].append(a)',
    'w = data[1 + 2 * (n - 1):1 + 2 * (n - 1) + n]',
    'print(max_independent(n, adj, w))',
  ],
  stdin: ({ g, w }: In) =>
    `${g.n}\n${g.edges.map(([a, b]) => `${a} ${b}`).join('\n')}${g.edges.length ? '\n' : ''}${w.join(' ')}\n`,
  // Independent oracle: all 2^n vertex sets, keep the independent ones.
  expected: ({ g, w }: In) => {
    let best = 0;
    for (let mask = 0; mask < 1 << g.n; mask++) {
      if (g.edges.some(([a, b]) => (mask >> a) & 1 && (mask >> b) & 1)) continue;
      let total = 0;
      for (let i = 0; i < g.n; i++) if ((mask >> i) & 1) total += w[i];
      best = Math.max(best, total);
    }
    return String(best);
  },
};

export default harness;
