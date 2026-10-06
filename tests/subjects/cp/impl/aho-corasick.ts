/** Harness for `aho-corasick` (card 2-I1). stdin: p1, p2, text (one per line). stdout: the total number of occurrences of both patterns. */
type In = { p1: string; p2: string; text: string };

const harness = {
  entryId: 'aho-corasick',
  cppPrelude: [
    '#include <array>',
    '#include <iostream>',
    '#include <queue>',
    '#include <string>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    std::string a, b, text; std::cin >> a >> b >> text;',
    '    std::cout << count_matches({a, b}, text) << std::endl;',
    '}',
  ],
  pyMain: [
    'import sys',
    'a, b, text = sys.stdin.read().split()',
    'print(count_matches([a, b], text))',
  ],
  stdin: ({ p1, p2, text }: In) => `${p1}\n${p2}\n${text}\n`,
  // Independent oracle: naive search of each pattern at every position.
  expected: ({ p1, p2, text }: In) => {
    let total = 0;
    for (const p of [p1, p2])
      for (let i = 0; i + p.length <= text.length; i++) if (text.startsWith(p, i)) total++;
    return String(total);
  },
};

export default harness;
