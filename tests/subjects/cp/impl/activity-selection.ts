/** Harness for `activity-selection` (card 2-I1). stdin: n, then n lines "start end". stdout: the maximum number of disjoint segments. */
type In = { seg: number[][] };

const harness = {
  entryId: 'activity-selection',
  cppPrelude: [
    '#include <algorithm>',
    '#include <iostream>',
    '#include <utility>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<std::pair<int, int>> seg(n);',
    '    for (auto& s : seg) std::cin >> s.first >> s.second;',
    '    std::cout << max_segments(seg) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'seg = [(data[1 + 2 * k], data[2 + 2 * k]) for k in range(n)]',
    'print(max_segments(seg))',
  ],
  stdin: ({ seg }: In) => `${seg.length}\n${seg.map(([s, e]) => `${s} ${e}`).join('\n')}\n`,
  // Independent oracle: try every subset of the segments, keep the biggest set of pairwise disjoint ones.
  expected: ({ seg }: In) => {
    let best = 0;
    for (let mask = 0; mask < 1 << seg.length; mask++) {
      const chosen = seg.filter((_, k) => (mask >> k) & 1);
      const ok = chosen.every(([s, e], a) =>
        chosen.every(([s2, e2], b) => a === b || e <= s2 || e2 <= s),
      );
      if (ok) best = Math.max(best, chosen.length);
    }
    return String(best);
  },
};

export default harness;
