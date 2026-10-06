/** Harness for `knapsack-01` (card 2-I1). stdin: n, n weights, n values, cap. stdout: the best value. */
type In = { w: number[]; v: number[]; cap: number };

const harness = {
  entryId: 'knapsack-01',
  cppPrelude: ['#include <algorithm>', '#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> w(n), v(n);',
    '    for (int& x : w) std::cin >> x;',
    '    for (int& x : v) std::cin >> x;',
    '    int cap; std::cin >> cap;',
    '    std::cout << knapsack(w, v, cap) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'print(knapsack(data[1:1 + n], data[1 + n:1 + 2 * n], data[1 + 2 * n]))',
  ],
  stdin: ({ w, v, cap }: In) => `${w.length}\n${w.join(' ')}\n${v.join(' ')}\n${cap}\n`,
  // Independent oracle: try all 2^n sets of items.
  expected: ({ w, v, cap }: In) => {
    let best = 0;
    for (let mask = 0; mask < 1 << w.length; mask++) {
      let weight = 0;
      let value = 0;
      w.forEach((x, k) => {
        if ((mask >> k) & 1) {
          weight += x;
          value += v[k];
        }
      });
      if (weight <= cap) best = Math.max(best, value);
    }
    return String(best);
  },
};

export default harness;
