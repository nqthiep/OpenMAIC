/** Harness for `bs-answer-mini` (card 2-I1). stdin: n, n heights, m. stdout: the best cut height H. */
type In = { h: number[]; m: number };

export default {
  entryId: 'bs-answer-mini',
  // Explicit headers, not <bits/stdc++.h>: Apple clang (macOS g++) lacks it.
  cppPrelude: [
    '#include <algorithm>',
    '#include <iostream>',
    '#include <vector>',
    'using namespace std;',
  ],
  cppMain: [
    'int main() {',
    '    int n; cin >> n;',
    '    vector<int> h(n);',
    '    for (int& x : h) cin >> x;',
    '    long long m; cin >> m;',
    '    cout << best_height(h, m) << endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'print(best_height(data[1:1 + n], data[1 + n]))',
  ],
  stdin: ({ h, m }: In) => `${h.length}\n${h.join(' ')}\n${m}\n`,
  // Independent oracle: try every H from 0 to max(h), keep the largest that yields enough wood.
  expected: ({ h, m }: In) => {
    let best = -1;
    for (let H = 0; H <= Math.max(...h); H++) {
      let total = 0;
      for (const x of h) if (x > H) total += x - H;
      if (total >= m) best = H;
    }
    return String(best);
  },
};
