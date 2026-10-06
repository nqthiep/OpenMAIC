/** Harness for `lcs` (card 2-I1). stdin: a then b (one per line). stdout: the LCS length. */
type In = { a: string; b: string };

const harness = {
  entryId: 'lcs',
  cppPrelude: [
    '#include <algorithm>',
    '#include <iostream>',
    '#include <string>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    std::string a, b; std::cin >> a >> b;',
    '    std::cout << lcs(a, b) << std::endl;',
    '}',
  ],
  pyMain: ['import sys', 'a, b = sys.stdin.read().split()', 'print(lcs(a, b))'],
  stdin: ({ a, b }: In) => `${a}\n${b}\n`,
  // Independent oracle: every subsequence of a (2^|a|), test it as a subsequence of b, keep the longest.
  expected: ({ a, b }: In) => {
    const isSub = (s: string, t: string) => {
      let k = 0;
      for (const c of t) if (k < s.length && s[k] === c) k++;
      return k === s.length;
    };
    let best = 0;
    for (let mask = 0; mask < 1 << a.length; mask++) {
      const s = a
        .split('')
        .filter((_, k) => (mask >> k) & 1)
        .join('');
      if (s.length > best && isSub(s, b)) best = s.length;
    }
    return String(best);
  },
};

export default harness;
