import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * B53 / D-34: the agent entry tree stores raw frames for the model's context. No route may
 * import it or the modules that read it, so those frames cannot reach a client. A client
 * reads the event log (`agent_session_events`), not the entry tree.
 */
const FORBIDDEN_IMPORTS = [
  '@/lib/server/agent-runtime/entry-tree-storage',
  '@/lib/server/agent-runtime/personal-history-tools',
  '@/lib/server/agent-runtime/runner',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('agent entry tree is not reachable from routes (B53, D-34)', () => {
  it('no file under app/ imports the entry tree or a module that reads it', () => {
    const root = process.cwd();
    const offenders = sourceFiles(join(root, 'app')).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_IMPORTS.filter(
        (spec) => source.includes(`'${spec}'`) || source.includes(`"${spec}"`),
      ).map((spec) => `${relative(root, file)} imports ${spec}`);
    });
    expect(offenders).toEqual([]);
  });
});
