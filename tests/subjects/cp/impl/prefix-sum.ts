/** Harness for `prefix-sum` (card 2-I1). stdin: n, n ints, l, r. stdout: sum of a[l..r]. */
type In = { values: number[]; l: number; r: number };

const harness = {
  entryId: 'prefix-sum',
  cppPrelude: ['#include <iostream>', '#include <vector>', 'using namespace std;'],
  cppMain: [
    'int main() {',
    '    int n; cin >> n;',
    '    vector<int> a(n);',
    '    for (int& x : a) cin >> x;',
    '    int l, r; cin >> l >> r;',
    '    cout << range_sum(a, l, r) << endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'print(range_sum(data[1:1 + n], data[1 + n], data[2 + n]))',
  ],
  stdin: ({ values, l, r }: In) => `${values.length}\n${values.join(' ')}\n${l} ${r}\n`,
  // Independent oracle: add a[l..r] one by one.
  expected: ({ values, l, r }: In) => {
    let s = 0;
    for (let i = l; i <= r; i++) s += values[i];
    return String(s);
  },
};

export default harness;
