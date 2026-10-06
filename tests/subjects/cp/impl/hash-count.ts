/** Harness for `hash-count` (card 2-I1). stdin: the string. stdout: "<char> <count>" of the most frequent character (ties: smallest letter). */
type In = { s: string };

const harness = {
  entryId: 'hash-count',
  cppPrelude: ['#include <iostream>', '#include <string>', '#include <utility>'],
  cppMain: [
    'int main() {',
    '    std::string s; std::cin >> s;',
    '    std::pair<char, int> r = most_frequent(s);',
    '    std::cout << r.first << " " << r.second << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    's = sys.stdin.read().strip()',
    'r = most_frequent(s)',
    'print(r[0], r[1])',
  ],
  stdin: ({ s }: In) => `${s}\n`,
  // Independent oracle: split into characters and count each letter with filter().
  expected: ({ s }: In) => {
    let best = '';
    let cnt = 0;
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      const k = s.split('').filter((x) => x === c).length;
      if (k > cnt) {
        best = c;
        cnt = k;
      }
    }
    return `${best} ${cnt}`;
  },
};

export default harness;
