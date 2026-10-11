/**
 * Create the first administrator, or make an existing account an administrator.
 *
 *   pnpm accounts:create-admin -- --username <name> [--display-name <text>]
 *   pnpm accounts:create-admin -- --username <name> --promote
 *
 * DATABASE_URL must be in the environment: export it, or run
 * `set -a; . ./.env.local; set +a` first. From the host, use 127.0.0.1 where the
 * URL names the compose host. The password is typed at a terminal without echo.
 * It is never read from an argument, an environment variable or a file.
 */
import { Pool } from 'pg';

import { passwordProblem } from '@/lib/accounts/password';
import { findAccountByUsername } from '@/lib/accounts/repository';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { AccountError, createAccount, promoteAccount } from '@/lib/accounts/service';
import { normalizeUsername, usernameProblem } from '@/lib/accounts/username';

interface Args {
  username: string;
  displayName?: string;
  promote: boolean;
}

const USAGE =
  'usage: pnpm accounts:create-admin -- --username <name> [--display-name <text>] [--promote]';

function parseArgs(argv: readonly string[]): Args | string {
  let username: string | undefined;
  let displayName: string | undefined;
  let promote = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--promote') {
      promote = true;
    } else if (arg === '--username' || arg === '--display-name') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) return `${arg} needs a value\n${USAGE}`;
      if (arg === '--username') username = value;
      else displayName = value;
      index += 1;
    } else {
      return `unknown argument ${JSON.stringify(arg)}\n${USAGE}`;
    }
  }
  if (username === undefined) return `--username is required\n${USAGE}`;
  return { username, ...(displayName === undefined ? {} : { displayName }), promote };
}

/** One line typed without echo. Rejects when the input is not a terminal. */
function readHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) {
    return Promise.reject(
      new Error('run this in an interactive terminal: the password is typed without echo'),
    );
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u0003') {
          finish(new Error('cancelled'));
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}

/** The new password, typed twice and checked against the policy before the second entry. */
async function readNewPassword(username: string): Promise<string> {
  for (;;) {
    const first = await readHidden('Password: ');
    const problem = passwordProblem(first, username);
    if (problem) {
      console.error(`The password is refused (${problem}). Choose another one.`);
      continue;
    }
    const second = await readHidden('Repeat the password: ');
    if (second !== first) {
      console.error('The two passwords do not match.');
      continue;
    }
    return first;
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (typeof parsed === 'string') {
    console.error(parsed);
    return 2;
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('DATABASE_URL is not set.');
    return 1;
  }
  const username = normalizeUsername(parsed.username);
  const problem = usernameProblem(username);
  if (problem) {
    console.error(`The username ${JSON.stringify(username)} is not allowed (${problem}).`);
    return 1;
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await ensureAccountsSchema(pool);
    const existing = await findAccountByUsername(pool, username);
    if (existing && !parsed.promote) {
      console.error(
        `${username} already exists. Rerun with --promote to make it an administrator.`,
      );
      return 1;
    }
    if (existing) {
      const user = await promoteAccount(pool, { username, now: Date.now() });
      console.log(`${user.username} is now an active administrator.`);
      return 0;
    }
    const password = await readNewPassword(username);
    const created = await createAccount(pool, {
      actorId: null,
      username,
      displayName: parsed.displayName ?? username,
      role: 'admin',
      password,
      mustChangePassword: false,
      now: Date.now(),
    });
    console.log(`Created the administrator ${created.user.username}.`);
    return 0;
  } catch (error) {
    if (error instanceof AccountError) {
      console.error(`${error.code}: ${error.reason}`);
      return 1;
    }
    console.error(error instanceof Error ? error.message : 'unexpected error');
    return 1;
  } finally {
    await pool.end();
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.exitCode = 1;
  },
);
