import { createHash, randomBytes } from 'crypto';

/** Only the hash of a join code is stored. A code is shown once, when its class is created. */
export function hashJoinCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** A new join code: 10 characters from an alphabet without look-alikes, about 50 bits. */
export function newJoinCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
