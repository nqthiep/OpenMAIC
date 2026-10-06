/** Harness for `merge-sort` (card 2-I1). stdin: n, n ints. stdout: the sorted ints, space-separated. */
type In = { values: number[] };

const harness = {
  entryId: 'merge-sort',
  cppPrelude: ['#include <iostream>', '#include <utility>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> a(n);',
    '    for (int& x : a) std::cin >> x;',
    '    merge_sort(a, 0, n - 1);',
    '    for (int i = 0; i < n; i++) std::cout << a[i] << (i + 1 < n ? " " : "");',
    '    std::cout << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'a = data[1:1 + data[0]]',
    'merge_sort(a, 0, len(a) - 1)',
    "print(' '.join(map(str, a)))",
  ],
  stdin: ({ values }: In) => `${values.length}\n${values.join(' ')}\n`,
  // Independent oracle: the built-in sort.
  expected: ({ values }: In) => [...values].sort((x, y) => x - y).join(' '),
};

export default harness;
