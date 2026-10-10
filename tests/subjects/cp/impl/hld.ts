/** Harness for `hld` (card 2-I1). stdin: n, n-1 edges, u v. stdout: the number of chain pieces on the path u-v. */
import { intIn, randomTree } from '../../stress-gen';

type In = { g: { n: number; edges: number[][] }; u: number; v: number };

const harness = {
  entryId: 'hld',
  cppPrelude: [
    '#include <algorithm>',
    '#include <iostream>',
    '#include <utility>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<std::vector<int>> adj(n);',
    '    for (int i = 0; i + 1 < n; i++) { int a, b; std::cin >> a >> b; adj[a].push_back(b); adj[b].push_back(a); }',
    '    for (auto& l : adj) std::sort(l.begin(), l.end());',
    '    int u, v; std::cin >> u >> v;',
    '    std::cout << count_segments(n, adj, u, v) << std::endl;',
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
    'for l in adj:',
    '    l.sort()',
    'print(count_segments(n, adj, data[1 + 2 * (n - 1)], data[2 + 2 * (n - 1)]))',
  ],
  // a random tree, so a uniform draw is not rejected as not-a-tree; u and v are nodes of that tree
  random: (r: () => number): In => {
    const n = intIn(r, [2, 10]);
    return { g: { n, edges: randomTree(r, n) }, u: intIn(r, [0, n - 1]), v: intIn(r, [0, n - 1]) };
  },
  stdin: ({ g, u, v }: In) =>
    `${g.n}\n${g.edges.map(([a, b]) => `${a} ${b}`).join('\n')}\n${u} ${v}\n`,
  // Independent oracle: sizes by recursion, chain id by following heavy children, path by parent walk.
  expected: ({ g, u, v }: In) => {
    const adj: number[][] = Array.from({ length: g.n }, () => []);
    for (const [a, b] of g.edges) {
      adj[a].push(b);
      adj[b].push(a);
    }
    adj.forEach((l) => l.sort((x, y) => x - y));
    const par = Array<number>(g.n).fill(-1);
    const size = (x: number, p: number): number => {
      par[x] = p;
      return 1 + adj[x].filter((c) => c !== p).reduce((s, c) => s + size(c, x), 0);
    };
    size(0, -1);
    const sz = (x: number): number =>
      1 + adj[x].filter((c) => c !== par[x]).reduce((s, c) => s + sz(c), 0);
    const heavy = (x: number): number =>
      adj[x].filter((c) => c !== par[x]).reduce((b, c) => (b === -1 || sz(c) > sz(b) ? c : b), -1);
    const chain = Array<number>(g.n).fill(-1);
    const walk = (x: number, id: number): void => {
      chain[x] = id;
      for (const c of adj[x]) if (c !== par[x]) walk(c, c === heavy(x) ? id : c);
    };
    walk(0, 0);
    const up = (x: number) => {
      const r = [x];
      while (par[r.at(-1)!] >= 0) r.push(par[r.at(-1)!]);
      return r;
    };
    const A = up(u);
    const B = up(v);
    const lca = A.find((x) => B.includes(x))!;
    const path = [...A.slice(0, A.indexOf(lca) + 1), ...B.slice(0, B.indexOf(lca)).reverse()];
    let pieces = 1;
    for (let i = 1; i < path.length; i++) if (chain[path[i]] !== chain[path[i - 1]]) pieces++;
    return String(pieces);
  },
};

export default harness;
