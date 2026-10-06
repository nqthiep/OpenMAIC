/** Harness for `sieve` (card 2-I1). stdin: n. stdout: the primes <= n, space-separated. */
type In = { n: number };

const harness = {
  entryId: 'sieve',
  cppPrelude: ['#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> primes = sieve(n);',
    '    for (size_t i = 0; i < primes.size(); i++) std::cout << primes[i] << (i + 1 < primes.size() ? " " : "");',
    '    std::cout << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'n = int(sys.stdin.read().split()[0])',
    "print(' '.join(map(str, sieve(n))))",
  ],
  stdin: ({ n }: In) => `${n}\n`,
  // Independent oracle: trial division of every number.
  expected: ({ n }: In) => {
    const out: number[] = [];
    for (let k = 2; k <= n; k++) {
      let prime = true;
      for (let d = 2; d < k; d++) if (k % d === 0) prime = false;
      if (prime) out.push(k);
    }
    return out.join(' ');
  },
};

export default harness;
