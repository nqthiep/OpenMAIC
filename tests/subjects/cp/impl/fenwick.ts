/** Harness for `fenwick` (card 2-I1). stdin: n, n ints, q. stdout: the prefix sum a[1..q]. */
type In = { values: number[]; q: number };

const harness = {
  entryId: 'fenwick',
  cppPrelude: ['#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> a(n);',
    '    for (int& x : a) std::cin >> x;',
    '    int q; std::cin >> q;',
    '    std::cout << prefix_sum(a, q) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'print(prefix_sum(data[1:1 + n], data[1 + n]))',
  ],
  stdin: ({ values, q }: In) => `${values.length}\n${values.join(' ')}\n${q}\n`,
  // Independent oracle: add the first q numbers directly.
  expected: ({ values, q }: In) => String(values.slice(0, q).reduce((s, x) => s + x, 0)),
};

export default harness;
