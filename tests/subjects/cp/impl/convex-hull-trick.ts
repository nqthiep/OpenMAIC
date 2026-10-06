/** Harness for `convex-hull-trick` (card 2-I1). stdin: n, n lines "k m", q, q xs. stdout: min over lines for each x. */
type In = { lines: number[][]; xs: number[] };

const harness = {
  entryId: 'convex-hull-trick',
  cppPrelude: [
    '#include <deque>',
    '#include <iostream>',
    '#include <utility>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<std::pair<int, int>> lines(n);',
    '    for (auto& l : lines) std::cin >> l.first >> l.second;',
    '    int q; std::cin >> q;',
    '    std::vector<int> xs(q);',
    '    for (int& x : xs) std::cin >> x;',
    '    std::vector<long long> r = min_at(lines, xs);',
    '    for (int i = 0; i < q; i++) std::cout << r[i] << (i + 1 < q ? " " : "");',
    '    std::cout << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'lines = [(data[1 + 2 * i], data[2 + 2 * i]) for i in range(n)]',
    'q = data[1 + 2 * n]',
    'xs = data[2 + 2 * n:2 + 2 * n + q]',
    "print(' '.join(map(str, min_at(lines, xs))))",
  ],
  stdin: ({ lines, xs }: In) =>
    `${lines.length}\n${lines.map(([k, m]) => `${k} ${m}`).join('\n')}\n${xs.length}\n${xs.join(' ')}\n`,
  // Independent oracle: try every line for every x.
  expected: ({ lines, xs }: In) =>
    xs.map((x) => Math.min(...lines.map(([k, m]) => k * x + m))).join(' '),
};

export default harness;
