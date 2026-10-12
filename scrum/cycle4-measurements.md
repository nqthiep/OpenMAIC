# Cycle 4 measurements

## Derivation time at the production cost (B39)

Host: 4 CPUs, measured while other agents ran on the same host. This is one host and one run. It is not production hardware.

Method: the script below, run with `node`. Twelve single derivations give the median. Twelve rounds of two concurrent derivations give the throughput, which is the server's slot count of two.

Result: single derivation median 248 ms, minimum 222 ms, maximum 570 ms. Two-slot throughput 7.6 derivations per second.

What it decides: a saturated sign-in table needs about 80,000 counted failures in one 15-minute window. At this throughput the window holds about 6,840, so saturation is out of reach here. The refusal rule in `lib/server/accounts/login-throttle.ts` stays as defence in depth. Repeat the measurement on production-class hardware before relying on this arithmetic.

```js
import { scrypt, randomBytes } from 'node:crypto';

const N = 2 ** 16, r = 8, p = 1, keyLength = 32;
const maxmem = 128 * 1024 * 1024;

function derive(password) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    scrypt(password, randomBytes(16), keyLength, { N, r, p, maxmem }, (error) => {
      if (error) reject(error);
      else resolve(Number(process.hrtime.bigint() - started) / 1e6);
    });
  });
}

const single = [];
for (let i = 0; i < 12; i += 1) single.push(await derive('bench-password-value'));

const pairStart = process.hrtime.bigint();
const pairs = 12;
for (let i = 0; i < pairs; i += 1) {
  await Promise.all([derive('bench-password-value'), derive('bench-password-value')]);
}
const pairSeconds = Number(process.hrtime.bigint() - pairStart) / 1e9;

const sorted = [...single].sort((a, b) => a - b);
console.log(JSON.stringify({
  cpus: (await import('node:os')).cpus().length,
  singleMedianMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
  singleMinMs: Math.round(sorted[0]),
  singleMaxMs: Math.round(sorted[sorted.length - 1]),
  twoSlotDerivationsPerSecond: Number(((pairs * 2) / pairSeconds).toFixed(2)),
}));
```
