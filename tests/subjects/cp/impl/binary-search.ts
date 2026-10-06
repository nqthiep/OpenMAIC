/** Harness for `binary-search` (card 2-I1). stdin: n, then n sorted ints, then target. stdout: index or -1. */
type In = { values: number[]; target: number };

export default {
  entryId: 'binary-search',
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
    '    vector<int> a(n);',
    '    for (int& x : a) cin >> x;',
    '    int target; cin >> target;',
    '    cout << binary_search(a, target) << endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'print(binary_search(data[1:1 + n], data[1 + n]))',
  ],
  stdin: ({ values, target }: In) => `${values.length}\n${values.join(' ')}\n${target}\n`,
  // Independent oracle: linear scan (values are strictly increasing, so the index is unique).
  expected: ({ values, target }: In) => String(values.indexOf(target)),
};
