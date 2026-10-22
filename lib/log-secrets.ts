/**
 * The values that log lines must never carry. The logger replaces each registered value
 * with `[redacted]`. This module is separate from the logger so that the server modules
 * which register secrets are not affected when a test replaces the logger.
 */

const REDACTED = '[redacted]';
/** Shorter values are not registered: a short value would also match ordinary log text. */
const MIN_SECRET_LENGTH = 8;
/** Recent visitor keys kept for redaction. The operator's keys are never evicted. */
const VISITOR_SECRET_LIMIT = 256;
/** Environment variables whose values are treated as secrets and redacted from every line. */
const SECRET_ENV_NAME = /(API_KEY|ACCESS_KEY|SECRET|TOKEN|PASSWORD|ACCESS_CODE)$/i;
/**
 * B51: secret-bearing environment names the suffix list cannot see. A bearer
 * token and an S3 secret key do not end with a known suffix; the AliDocMind
 * access key id is registered for parity with the YAML field of the same name.
 */
const SECRET_ENV_EXACT = new Set([
  'AWS_BEARER_TOKEN_BEDROCK',
  'S3_CONTRACT_SECRET_KEY',
  'ALIDOCMIND_ACCESS_KEY_ID',
  // The master key for stored provider secrets: its name ends in _KEY, which the suffix list misses.
  'PROVIDER_SECRET_KEY',
]);

const operatorSecrets = new Set<string>();
const visitorSecrets = new Set<string>();
let environmentScanned = false;

/**
 * Registers a secret value so that every log line has it replaced with `[redacted]`.
 * Operator secrets are the server's own keys. Visitor secrets are keys a visitor supplied
 * with a request; the most recent `VISITOR_SECRET_LIMIT` are kept.
 */
export function registerLogSecret(value: string | undefined, scope: 'operator' | 'visitor'): void {
  if (!value || value.length < MIN_SECRET_LENGTH) return;
  if (scope === 'operator') {
    operatorSecrets.add(value);
    return;
  }
  visitorSecrets.delete(value);
  visitorSecrets.add(value);
  while (visitorSecrets.size > VISITOR_SECRET_LIMIT) {
    const oldest = visitorSecrets.values().next().value;
    if (oldest === undefined) break;
    visitorSecrets.delete(oldest);
  }
}

/** Registers the server's environment secrets once, before the first line is written. */
function scanEnvironmentSecrets(): void {
  if (environmentScanned) return;
  environmentScanned = true;
  const env = typeof process === 'undefined' ? undefined : process.env;
  if (!env) return;
  for (const [name, value] of Object.entries(env)) {
    if (SECRET_ENV_NAME.test(name) || SECRET_ENV_EXACT.has(name)) {
      registerLogSecret(value, 'operator');
    }
    // B51: DATABASE_URL usually embeds `user:password@host`; the name matches
    // no suffix, so register the password part explicitly.
    if (name === 'DATABASE_URL') registerDatabasePassword(value);
  }
}

/** Registers the password embedded in a database URL, when it parses as one. */
function registerDatabasePassword(value: string | undefined): void {
  if (!value) return;
  try {
    registerLogSecret(new URL(value).password, 'operator');
  } catch {
    // Not a parseable URL; nothing to extract.
  }
}

/** Returns `text` with every registered secret replaced. */
export function redactLogSecrets(text: string): string {
  scanEnvironmentSecrets();
  let out = text;
  for (const secret of operatorSecrets) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  for (const secret of visitorSecrets) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  return out;
}

/** Test seam: forgets registered secrets and re-reads the environment on the next line. */
export function __resetLogSecretsForTesting(): void {
  operatorSecrets.clear();
  visitorSecrets.clear();
  environmentScanned = false;
}
