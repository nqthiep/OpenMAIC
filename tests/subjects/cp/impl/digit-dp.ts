/** Harness for `digit-dp` (card 2-I1). stdin: n s. stdout: the count of x in [0, n] with digit sum s. */
type In = { n: number; s: number };

const harness = {
  entryId: 'digit-dp',
  cppPrelude: ['#include <iostream>', '#include <string>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n, s; std::cin >> n >> s;',
    '    std::cout << count_digit_sum(n, s) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'n, s = map(int, sys.stdin.read().split())',
    'print(count_digit_sum(n, s))',
  ],
  stdin: ({ n, s }: In) => `${n} ${s}\n`,
  // Independent oracle: visit 0..n and add the digits.
  expected: ({ n, s }: In) => {
    let c = 0;
    for (let x = 0; x <= n; x++)
      if (
        String(x)
          .split('')
          .reduce((a, d) => a + Number(d), 0) === s
      )
        c++;
    return String(c);
  },
};

export default harness;
