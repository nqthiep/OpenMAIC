/** Harness for `lis` (card 2-I1). stdin: n, n ints. stdout: the length of the longest strictly increasing subsequence. */
type In = { values: number[] };

const harness = {
  entryId: 'lis',
  cppPrelude: ['#include <algorithm>', '#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> a(n);',
    '    for (int& x : a) std::cin >> x;',
    '    std::cout << lis(a) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'print(lis(data[1:1 + data[0]]))',
  ],
  stdin: ({ values }: In) => `${values.length}\n${values.join(' ')}\n`,
  // Independent oracle: all 2^n subsequences, keep the strictly increasing ones.
  expected: ({ values }: In) => {
    let best = 0;
    for (let mask = 0; mask < 1 << values.length; mask++) {
      const s = values.filter((_, k) => (mask >> k) & 1);
      if (s.every((x, k) => k === 0 || s[k - 1] < x)) best = Math.max(best, s.length);
    }
    return String(best);
  },
};

export default harness;
