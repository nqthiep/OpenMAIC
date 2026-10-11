/**
 * Guard: no log call under app/api or lib/server names an owner id, a cookie or
 * a credential. The owner id is a bearer secret (the anonymous owner cookie holds
 * it), so it must not reach the server log.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const SCANNED_DIRS = ['app/api', 'lib/server'];
const SECRET_NAME = /\b(ownerId|cookie|accessToken|access_token|apiKey|authorization)\b/i;
const LOG_CALL = /\b(?:log|logger|console)\.(?:debug|info|warn|error|log)\s*\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * The call's code with string contents removed, so a warning that merely
 * mentions a cookie does not count. The `${...}` parts of templates are code
 * and stay.
 */
function codeOnly(text: string): string {
  return text
    .replace(/`[^`]*`/g, (template) => (template.match(/\$\{[^}]*\}/g) ?? []).join(' '))
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
}

/** The text of each log call in `source`, with the line it starts on. */
function logCalls(source: string): Array<{ line: number; text: string }> {
  const calls: Array<{ line: number; text: string }> = [];
  for (const match of source.matchAll(LOG_CALL)) {
    const start = match.index ?? 0;
    let depth = 1;
    let quote: string | null = null;
    let end = start + match[0].length;
    for (; end < source.length && depth > 0; end++) {
      const ch = source[end];
      if (quote) {
        if (ch === '\\') end++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
      } else if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
      }
    }
    calls.push({
      line: source.slice(0, start).split('\n').length,
      text: source.slice(start, end),
    });
  }
  return calls;
}

const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((file) =>
  relative(ROOT, file).split(sep).join('/'),
);

describe('log calls never name owner ids, cookies or credentials', () => {
  it('scans the files it claims to scan', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('app/api/folders/route.ts');
  });

  it('finds no secret-bearing name inside a log call', () => {
    const offenders = files.flatMap((rel) =>
      logCalls(readFileSync(join(ROOT, rel), 'utf8'))
        .filter((call) => SECRET_NAME.test(codeOnly(call.text)))
        .map((call) => `${rel}:${call.line}`),
    );

    expect(offenders).toEqual([]);
  });
});
