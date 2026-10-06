/** Harness for `bit-subsets` (card 2-I1). stdin: n, n ints, target. stdout: the number of subsets with that sum. */
type In = { items: number[]; target: number };

const harness = {
  entryId: 'bit-subsets',
  cppPrelude: ['#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> a(n);',
    '    for (int& x : a) std::cin >> x;',
    '    int target; std::cin >> target;',
    '    std::cout << count_subsets(a, target) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'print(count_subsets(data[1:1 + n], data[1 + n]))',
  ],
  stdin: ({ items, target }: In) => `${items.length}\n${items.join(' ')}\n${target}\n`,
  // Independent oracle: take-or-skip recursion, no bits.
  expected: ({ items, target }: In) => {
    const go = (i: number, left: number): number =>
      i === items.length ? (left === 0 ? 1 : 0) : go(i + 1, left - items[i]) + go(i + 1, left);
    return String(go(0, target));
  },
};

export default harness;
