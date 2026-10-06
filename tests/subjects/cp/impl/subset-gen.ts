/**
 * Harness for `subset-gen` (card 2-I1). stdin: n, n ints. stdout: every subset as a line of
 * comma-joined values (the empty subset is an empty line), the lines sorted as strings.
 */
type In = { items: number[] };

const harness = {
  entryId: 'subset-gen',
  cppPrelude: [
    '#include <algorithm>',
    '#include <iostream>',
    '#include <string>',
    '#include <vector>',
  ],
  cppMain: [
    'int main() {',
    '    int n; std::cin >> n;',
    '    std::vector<int> a(n);',
    '    for (int& x : a) std::cin >> x;',
    '    std::vector<int> cur;',
    '    std::vector<std::vector<int>> out;',
    '    gen(a, 0, cur, out);',
    '    std::vector<std::string> lines;',
    '    for (const auto& s : out) {',
    '        std::string t;',
    '        for (size_t k = 0; k < s.size(); k++) {',
    '            if (k) t += ",";',
    '            t += std::to_string(s[k]);',
    '        }',
    '        lines.push_back(t);',
    '    }',
    '    std::sort(lines.begin(), lines.end());',
    '    for (const auto& t : lines) std::cout << t << "\\n";',
    '}',
  ],
  pyMain: [
    'import sys',
    'data = list(map(int, sys.stdin.read().split()))',
    'a = data[1:1 + data[0]]',
    'out = []',
    'gen(a, 0, [], out)',
    "lines = sorted(','.join(map(str, s)) for s in out)",
    "print('\\n'.join(lines))",
  ],
  stdin: ({ items }: In) => `${items.length}\n${items.join(' ')}\n`,
  // Independent oracle: one subset per bit mask.
  expected: ({ items }: In) => {
    const lines: string[] = [];
    for (let mask = 0; mask < 1 << items.length; mask++) {
      lines.push(items.filter((_, k) => mask & (1 << k)).join(','));
    }
    return lines.sort().join('\n').trim(); // the runner trims stdout, so the leading empty subset line goes
  },
};

export default harness;
