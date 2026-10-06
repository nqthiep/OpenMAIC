/**
 * Harness for `n-queens` (card 2-I1). stdin: n. stdout: 1 when `place` finds a valid placement
 * (one queen per row, different columns, different diagonals), else 0. The first solution is not
 * unique in general, so the harness checks the placement instead of comparing columns.
 */
type In = { n: number };

const harness = {
  entryId: 'n-queens',
  cppPrelude: ['#include <cstdlib>', '#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> cols(n, -1);',
    '    bool found = place(cols, 0, n);',
    '    bool valid = found;',
    '    for (int r = 0; r < n && valid; r++)',
    '        for (int q = r + 1; q < n; q++)',
    '            if (cols[r] == cols[q] || std::abs(r - q) == std::abs(cols[r] - cols[q])) valid = false;',
    '    std::cout << (found && valid ? 1 : 0) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'n = int(sys.stdin.read().split()[0])',
    'cols = [-1] * n',
    'found = place(cols, 0, n)',
    'valid = found and all(cols[r] != cols[q] and abs(r - q) != abs(cols[r] - cols[q]) for r in range(n) for q in range(r + 1, n))',
    'print(1 if found and valid else 0)',
  ],
  stdin: ({ n }: In) => `${n}\n`,
  // Independent oracle: try every column permutation.
  expected: ({ n }: In) => {
    const perm = (rest: number[], acc: number[]): boolean => {
      if (rest.length === 0) {
        return acc.every((c, r) =>
          acc.every((d, q) => q <= r || Math.abs(r - q) !== Math.abs(c - d)),
        );
      }
      return rest.some((c, i) => perm([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, c]));
    };
    return perm(
      Array.from({ length: n }, (_, i) => i),
      [],
    )
      ? '1'
      : '0';
  },
};

export default harness;
