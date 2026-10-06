/** Harness for `segment-tree` (card 2-I1). stdin: n, n ints, ql qr. stdout: the sum of a[ql..qr]. */
type In = { values: number[]; l: number; r: number };

const harness = {
  entryId: 'segment-tree',
  cppPrelude: ['#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> a(n);',
    '    for (int& x : a) std::cin >> x;',
    '    int ql, qr; std::cin >> ql >> qr;',
    '    std::cout << range_sum(a, ql, qr) << std::endl;',
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
