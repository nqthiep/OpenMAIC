/** Harness for `nim-grundy` (card 2-I1). stdin: n, n piles. stdout: 1 if the first player wins, else 0 (the harness tests xor != 0). */
type In = { piles: number[] };

const harness = {
  entryId: 'nim-grundy',
  cppPrelude: ['#include <iostream>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> piles(n);',
    '    for (int& p : piles) std::cin >> p;',
    '    std::cout << (grundy_xor(piles) != 0 ? 1 : 0) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'print(1 if grundy_xor(data[1:1 + data[0]]) != 0 else 0)',
  ],
  stdin: ({ piles }: In) => `${piles.length}\n${piles.join(' ')}\n`,
  // Independent oracle: exhaustive minimax over the game positions.
  expected: ({ piles }: In) => {
    const memo = new Map<string, boolean>();
    const wins = (state: number[]): boolean => {
      const key = [...state].sort().join(',');
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      let res = false;
      for (let i = 0; i < state.length && !res; i++)
        for (let t = 1; t <= 3 && t <= state[i] && !res; t++) {
          const next = [...state];
          next[i] -= t;
          if (!wins(next)) res = true;
        }
      memo.set(key, res);
      return res;
    };
    return wins(piles) ? '1' : '0';
  },
};

export default harness;
