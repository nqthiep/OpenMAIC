/** Harness for `fib-recursion-tree` (card 2-I1). stdin: n. stdout: f(n). The memo flag does not change f(n). */
type In = { n: number; memo: string };

const harness = {
  entryId: 'fib-recursion-tree',
  cppPrelude: ['#include <iostream>', '#include <vector>', 'using namespace std;'],
  cppMain: [
    'int main() {',
    '    int n; cin >> n;',
    '    vector<long long> memo(n + 2, -1);',
    '    cout << fib(n, memo) << endl;',
    '}',
  ],
  pyMain: ['import sys', 'n = int(sys.stdin.read().split()[0])', 'print(fib(n, {}))'],
  stdin: ({ n }: In) => `${n}\n`,
  // Independent oracle: iterate.
  expected: ({ n }: In) => {
    let [a, b] = [0, 1];
    for (let i = 0; i < n; i++) [a, b] = [b, a + b];
    return String(a);
  },
};

export default harness;
