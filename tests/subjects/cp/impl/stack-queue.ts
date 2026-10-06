/** Harness for `stack-queue` (card 2-I1). stdin: the bracket string. stdout: 1 if valid, else 0. */
type In = { s: string };

const harness = {
  entryId: 'stack-queue',
  cppPrelude: [
    '#include <iostream>',
    '#include <stack>',
    '#include <string>',
    'using namespace std;',
  ],
  cppMain: [
    'int main() {',
    '    string s; cin >> s;',
    '    cout << (is_valid(s) ? 1 : 0) << endl;',
    '}',
  ],
  pyMain: ['import sys', 's = sys.stdin.read().strip()', 'print(1 if is_valid(s) else 0)'],
  stdin: ({ s }: In) => `${s}\n`,
  // Independent oracle: delete adjacent pairs "()", "[]", "{}" until nothing changes.
  expected: ({ s }: In) => {
    let t = s;
    for (;;) {
      const u = t.replace('()', '').replace('[]', '').replace('{}', '');
      if (u === t) break;
      t = u;
    }
    return t === '' ? '1' : '0';
  },
};

export default harness;
