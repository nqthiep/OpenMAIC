/** Harness for `kmp` (card 2-I1). stdin: text then pattern. stdout: the number of (possibly overlapping) occurrences. */
type In = { text: string; pattern: string };

const harness = {
  entryId: 'kmp',
  cppPrelude: ['#include <iostream>', '#include <string>', '#include <vector>'],
  cppMain: [
    'int main() {',
    '    std::string t, p; std::cin >> t >> p;',
    '    std::cout << count_occurrences(t, p) << std::endl;',
    '}',
  ],
  pyMain: ['import sys', 't, p = sys.stdin.read().split()', 'print(count_occurrences(t, p))'],
  stdin: ({ text, pattern }: In) => `${text}\n${pattern}\n`,
  // Independent oracle: compare the pattern at every position.
  expected: ({ text, pattern }: In) => {
    let c = 0;
    for (let i = 0; i + pattern.length <= text.length; i++) if (text.startsWith(pattern, i)) c++;
    return String(c);
  },
};

export default harness;
