/** Harness for `euclid-gcd` (card 2-I1). stdin: a b. stdout: gcd(a, b). */
type In = { a: number; b: number };

const harness = {
  entryId: 'euclid-gcd',
  cppPrelude: ['#include <iostream>'],
  cppMain: [
    'int main() {',
    '    int a, b; std::cin >> a >> b;',
    '    std::cout << gcd_euclid(a, b) << std::endl;',
    '}',
  ],
  pyMain: ['import sys', 'a, b = map(int, sys.stdin.read().split())', 'print(gcd_euclid(a, b))'],
  stdin: ({ a, b }: In) => `${a} ${b}\n`,
  // Independent oracle: the largest common divisor, found by trying every number from min down.
  expected: ({ a, b }: In) => {
    if (a === 0) return String(b);
    if (b === 0) return String(a);
    for (let d = Math.min(a, b); d >= 1; d--) if (a % d === 0 && b % d === 0) return String(d);
    return '1';
  },
};

export default harness;
