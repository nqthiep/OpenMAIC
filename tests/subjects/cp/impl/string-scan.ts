/** Harness for `string-scan` (card 2-I1). stdin: the string. stdout: 1 if it is a palindrome, else 0. */
type In = { s: string };

const harness = {
  entryId: 'string-scan',
  cppPrelude: ['#include <iostream>', '#include <string>'],
  cppMain: [
    'int main() {',
    '    std::string s; std::cin >> s;',
    '    std::cout << (is_palindrome(s) ? 1 : 0) << std::endl;',
    '}',
  ],
  pyMain: ['import sys', 's = sys.stdin.read().strip()', 'print(1 if is_palindrome(s) else 0)'],
  stdin: ({ s }: In) => `${s}\n`,
  // Independent oracle: compare with the reversed string.
  expected: ({ s }: In) => (s === s.split('').reverse().join('') ? '1' : '0'),
};

export default harness;
