/** Harness for `min-total-wait` (card 2-I1). stdin: n, n times. stdout: the minimum total waiting time. */
type In = { t: number[] };

const harness = {
  entryId: 'min-total-wait',
  cppPrelude: ['#include <algorithm>', '#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> t(n);',
    '    for (int& x : t) std::cin >> x;',
    '    std::cout << min_total_wait(t) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'print(min_total_wait(data[1:1 + data[0]]))',
  ],
  stdin: ({ t }: In) => `${t.length}\n${t.join(' ')}\n`,
  // Independent oracle: try every permutation.
  expected: ({ t }: In) => {
    let best = Infinity;
    const go = (rest: number[], acc: number[]): void => {
      if (rest.length === 0) {
        let wait = 0;
        let total = 0;
        for (const x of acc) {
          total += wait;
          wait += x;
        }
        best = Math.min(best, total);
        return;
      }
      rest.forEach((x, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
    };
    go(t, []);
    return String(best);
  },
};

export default harness;
