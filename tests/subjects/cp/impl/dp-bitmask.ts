/** Harness for `dp-bitmask` (card 2-I1). stdin: n then the n x n matrix. stdout: the cost of the shortest tour from node 0. */
import { intIn } from '../../stress-gen';

type In = { d: number[][] };

const harness = {
  entryId: 'dp-bitmask',
  cppPrelude: ['#include <algorithm>', '#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<std::vector<int>> d(n, std::vector<int>(n));',
    '    for (auto& row : d) for (int& x : row) std::cin >> x;',
    '    std::cout << tsp(d) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'n = data[0]',
    'd = [data[1 + n * i:1 + n * (i + 1)] for i in range(n)]',
    'print(tsp(d))',
  ],
  // a square matrix with a zero diagonal (the check rejects anything else), so a uniform draw
  // is not rejected as not-square or diagonal-not-zero
  random: (r: () => number): In => {
    const n = intIn(r, [2, 4]);
    return {
      d: Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 0 : intIn(r, [0, 20]))),
      ),
    };
  },
  stdin: ({ d }: In) => `${d.length}\n${d.map((row) => row.join(' ')).join('\n')}\n`,
  // Independent oracle: every order of nodes 1..n-1.
  expected: ({ d }: In) => {
    const n = d.length;
    let best = Infinity;
    const go = (rest: number[], last: number, cost: number): void => {
      if (rest.length === 0) {
        best = Math.min(best, cost + d[last][0]);
        return;
      }
      rest.forEach((v, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], v, cost + d[last][v]));
    };
    go(
      Array.from({ length: n - 1 }, (_, i) => i + 1),
      0,
      0,
    );
    return String(best);
  },
};

export default harness;
