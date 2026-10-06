/**
 * InputSpec + parseInput (ADR 0006 decisions 7-8).
 * One dependency-free validator shared by the server (LLM input) and the iframe (student input).
 * Browser-safe: no Node APIs.
 */

export type Range = readonly [number, number];

export type InputSpec =
  | { kind: 'int'; range: Range; ui?: 'slider' }
  | { kind: 'enum'; values: readonly (string | number)[] }
  | { kind: 'number'; range: Range; step: number; ui?: 'slider' }
  | { kind: 'int-array'; len: Range; range: Range; strictlyIncreasing?: boolean }
  | { kind: 'string'; len: Range; alphabet: 'a-z' | '0-9' | 'ab' }
  | { kind: 'edge-list'; nodes: Range; edges: Range; weight?: Range }
  | { kind: 'grid'; rows: Range; cols: Range; cell: 'bit' | 'int'; range?: Range }
  | { kind: 'record'; fields: Readonly<Record<string, InputSpec>> };

export type ParseResult<I> = { ok: true; value: I } | { ok: false; issues: readonly string[] };

export const MAX_INPUT_BYTES = 2048;
export const MAX_ISSUES = 5;

const ALPHABETS: Record<'a-z' | '0-9' | 'ab', RegExp> = {
  'a-z': /^[a-z]*$/,
  '0-9': /^[0-9]*$/,
  ab: /^[ab]*$/,
};

const STEP_EPSILON = 1e-9;

class Issues {
  readonly list: string[] = [];
  get full(): boolean {
    return this.list.length >= MAX_ISSUES;
  }
  add(path: string, reason: string): void {
    if (!this.full) this.list.push(`${path}: ${reason}`);
  }
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function inRange(v: number, r: Range): boolean {
  return v >= r[0] && v <= r[1];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Returns the cleaned copy, or undefined after recording issues. */
function check(spec: InputSpec, raw: unknown, path: string, out: Issues): unknown {
  if (out.full) return undefined;
  switch (spec.kind) {
    case 'int': {
      if (!isInt(raw)) return void out.add(path, 'not-int');
      if (!inRange(raw, spec.range)) return void out.add(path, 'out-of-range');
      return raw;
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return void out.add(path, 'not-number');
      if (!inRange(raw, spec.range)) return void out.add(path, 'out-of-range');
      const q = (raw - spec.range[0]) / spec.step;
      if (!Number.isFinite(q) || Math.abs(q - Math.round(q)) > STEP_EPSILON)
        return void out.add(path, 'not-on-step');
      return raw;
    }
    case 'enum': {
      if (!spec.values.some((x) => x === raw)) return void out.add(path, 'not-in-enum');
      return raw;
    }
    case 'int-array': {
      if (!Array.isArray(raw)) return void out.add(path, 'not-array');
      if (!inRange(raw.length, spec.len)) return void out.add(path, 'bad-length');
      const res: number[] = [];
      let ok = true;
      // compared with the last accepted element, so a skipped invalid one adds no spurious issue
      for (let i = 0; i < raw.length && !out.full; i++) {
        const v: unknown = raw[i];
        const p = `${path}[${i}]`;
        if (!isInt(v)) {
          out.add(p, 'not-int');
          ok = false;
        } else if (!inRange(v, spec.range)) {
          out.add(p, 'out-of-range');
          ok = false;
        } else if (spec.strictlyIncreasing && res.length > 0 && !(v > res[res.length - 1])) {
          out.add(p, 'not-increasing');
          ok = false;
        } else res.push(v);
      }
      return ok ? res : undefined;
    }
    case 'string': {
      if (typeof raw !== 'string') return void out.add(path, 'not-string');
      // length in UTF-16 units; alphabet is ASCII so any non-ASCII char fails anyway
      if (!inRange(raw.length, spec.len)) return void out.add(path, 'bad-length');
      if (!ALPHABETS[spec.alphabet].test(raw)) return void out.add(path, 'bad-char');
      return raw;
    }
    case 'edge-list': {
      if (!isPlainObject(raw)) return void out.add(path, 'not-object');
      const before = out.list.length;
      for (const k of Object.keys(raw))
        if (k !== 'n' && k !== 'edges') out.add(`${path}.${k}`, 'unknown-key');
      const n = raw.n;
      let nOk = false;
      if (!hasOwn(raw, 'n')) out.add(`${path}.n`, 'missing');
      else if (!isInt(n)) out.add(`${path}.n`, 'not-int');
      else if (!inRange(n, spec.nodes)) out.add(`${path}.n`, 'out-of-range');
      else nOk = true;
      const edges = raw.edges;
      const res: (readonly number[])[] = [];
      if (!hasOwn(raw, 'edges')) out.add(`${path}.edges`, 'missing');
      else if (!Array.isArray(edges)) out.add(`${path}.edges`, 'not-array');
      else if (!inRange(edges.length, spec.edges)) out.add(`${path}.edges`, 'bad-length');
      else {
        const want = spec.weight ? 3 : 2;
        for (let i = 0; i < edges.length && !out.full; i++) {
          const e: unknown = edges[i];
          const p = `${path}.edges[${i}]`;
          if (!Array.isArray(e) || e.length !== want) {
            out.add(p, Array.isArray(e) ? 'bad-edge-shape' : 'not-array');
            continue;
          }
          const [a, b, w] = e as unknown[];
          const bound: Range = [0, nOk ? (n as number) - 1 : -1];
          if (!nOk) continue;
          if (!isInt(a) || !inRange(a, bound))
            out.add(`${p}[0]`, isInt(a) ? 'bad-node' : 'not-int');
          else if (!isInt(b) || !inRange(b, bound))
            out.add(`${p}[1]`, isInt(b) ? 'bad-node' : 'not-int');
          else if (a === b) out.add(p, 'self-loop');
          else if (spec.weight) {
            if (!isInt(w)) out.add(`${p}[2]`, 'not-int');
            else if (!inRange(w, spec.weight)) out.add(`${p}[2]`, 'out-of-range');
            else res.push([a, b, w]);
          } else res.push([a, b]);
        }
      }
      if (out.list.length > before) return undefined;
      return { n, edges: res };
    }
    case 'grid': {
      if (!Array.isArray(raw)) return void out.add(path, 'not-array');
      if (!inRange(raw.length, spec.rows)) return void out.add(path, 'bad-rows');
      const first: unknown = raw[0];
      if (raw.length > 0 && !Array.isArray(first)) return void out.add(`${path}[0]`, 'not-array');
      const cols = Array.isArray(first) ? first.length : 0;
      if (raw.length > 0 && !inRange(cols, spec.cols)) return void out.add(path, 'bad-cols');
      const cellRange: Range = spec.cell === 'bit' ? [0, 1] : (spec.range ?? [0, 0]);
      const res: number[][] = [];
      let ok = true;
      for (let r = 0; r < raw.length && !out.full; r++) {
        const row: unknown = raw[r];
        const p = `${path}[${r}]`;
        if (!Array.isArray(row) || row.length !== cols) {
          out.add(p, Array.isArray(row) ? 'ragged' : 'not-array');
          ok = false;
          continue;
        }
        const line: number[] = [];
        for (let c = 0; c < row.length && !out.full; c++) {
          const v: unknown = row[c];
          if (!isInt(v)) {
            out.add(`${p}[${c}]`, 'not-int');
            ok = false;
          } else if (!inRange(v, cellRange)) {
            out.add(`${p}[${c}]`, spec.cell === 'bit' ? 'not-bit' : 'out-of-range');
            ok = false;
          } else line.push(v);
        }
        res.push(line);
      }
      return ok ? res : undefined;
    }
    case 'record': {
      if (!isPlainObject(raw)) return void out.add(path, 'not-object');
      const before = out.list.length;
      const res: Record<string, unknown> = {};
      for (const k of Object.keys(raw))
        if (!hasOwn(spec.fields, k)) out.add(path === '$' ? k : `${path}.${k}`, 'unknown-key');
      for (const k of Object.keys(spec.fields)) {
        if (out.full) break;
        const p = path === '$' ? k : `${path}.${k}`;
        if (!hasOwn(raw, k)) {
          out.add(p, 'missing');
          continue;
        }
        const v = check(spec.fields[k], raw[k], p, out);
        Object.defineProperty(res, k, {
          value: v,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return out.list.length > before ? undefined : res;
    }
    default:
      return void out.add(path, 'bad-spec');
  }
}

export function parseInput<I>(spec: InputSpec, raw: unknown): ParseResult<I> {
  try {
    const json = JSON.stringify(raw) as string | undefined;
    if (typeof json !== 'string') return { ok: false, issues: ['not-json'] };
    if (new TextEncoder().encode(json).length > MAX_INPUT_BYTES)
      return { ok: false, issues: ['too-large'] };
    const out = new Issues();
    const value = check(spec, raw, '$', out);
    if (out.list.length > 0) return { ok: false, issues: out.list };
    return { ok: true, value: value as I };
  } catch {
    return { ok: false, issues: ['not-json'] };
  }
}
