/**
 * Harness for `two-pointers` (card 2-I1). stdin: n, n increasing ints, target.
 * stdout: 1 if the returned pair is valid (i < j, a[i] + a[j] = target), else 0.
 * The pair is not unique, so the harness checks it instead of comparing indices.
 */
type In = { values: number[]; target: number };

const harness = {
  entryId: 'two-pointers',
  cppPrelude: [
    '#include <iostream>',
    '#include <utility>',
    '#include <vector>',
    'using namespace std;',
  ],
  cppMain: [
    'int main() {',
    '    int n; cin >> n;',
    '    vector<int> a(n);',
    '    for (int& x : a) cin >> x;',
    '    int target; cin >> target;',
    '    pair<int, int> p = find_pair(a, target);',
    '    bool ok = p.first >= 0 && p.first < p.second && p.second < n && a[p.first] + a[p.second] == target;',
    '    cout << (ok ? 1 : 0) << endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'a = data[1:1 + n]',
    'target = data[1 + n]',
    'p = find_pair(a, target)',
    'print(1 if 0 <= p[0] < p[1] < n and a[p[0]] + a[p[1]] == target else 0)',
  ],
  stdin: ({ values, target }: In) => `${values.length}\n${values.join(' ')}\n${target}\n`,
  // Independent oracle: try every pair.
  expected: ({ values, target }: In) => {
    for (let i = 0; i < values.length; i++)
      for (let j = i + 1; j < values.length; j++) if (values[i] + values[j] === target) return '1';
    return '0';
  },
};

export default harness;
