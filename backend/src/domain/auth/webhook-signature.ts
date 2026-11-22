import { createHmac, timingSafeEqual } from 'crypto';

/** Accepted gap between the signed timestamp and our clock, in seconds (contract PC7). */
export const WEBHOOK_TOLERANCE_SECONDS = 120;

/** Two entries are sent during a secret overlap; a few more are tolerated, never an unbounded list. */
const MAX_SIGNATURE_ENTRIES = 8;
const SIGNATURE_ENTRY = /^v1=([0-9a-fA-F]{64})$/;

/**
 * Logout webhook signature (contract PC7), as sent by home-auth:
 * hex = HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`), the key being the secret string as
 * stored (64 hex characters, UTF-8, NOT decoded) and rawBody the exact bytes received.
 */
export function computeWebhookSignature(
  secret: string,
  id: string,
  timestamp: string | number,
  rawBody: string | Buffer,
): string {
  return createHmac('sha256', secret)
    .update(`${id}.${String(timestamp)}.`)
    .update(rawBody)
    .digest('hex');
}

/**
 * `X-Auth-Webhook-Signature` is `v1=<hex>[,v1=<hex>]`. Every entry must be `v1=` followed by 32
 * bytes in hex: anything else makes the whole header invalid (null).
 */
function parseSignatureHeader(header: string): Buffer[] | null {
  const entries = header.split(',').map((entry) => entry.trim());
  if (entries.length > MAX_SIGNATURE_ENTRIES) {
    return null;
  }
  const signatures: Buffer[] = [];
  for (const entry of entries) {
    const match = SIGNATURE_ENTRY.exec(entry);
    if (!match) {
      return null;
    }
    signatures.push(Buffer.from(match[1], 'hex'));
  }
  return signatures;
}

export type SignatureCheck = 'valid' | 'malformed' | 'mismatch';

/**
 * Checks one `X-Auth-Webhook-Signature` header against this message under `secret`: `malformed`
 * when the header is not `v1=<64 hex>[,v1=<64 hex>]`, `valid` when one entry is the HMAC of the
 * message, `mismatch` otherwise. Pure cryptography and format: the timestamp window and the
 * replay check belong to the caller. Every entry is compared (no early exit), each as 32 decoded
 * bytes with timingSafeEqual.
 */
export function checkWebhookSignature(
  secret: string,
  id: string,
  timestamp: string,
  header: string,
  rawBody: string | Buffer,
): SignatureCheck {
  const signatures = parseSignatureHeader(header);
  if (!signatures) {
    return 'malformed';
  }
  const expected = Buffer.from(
    computeWebhookSignature(secret, id, timestamp, rawBody),
    'hex',
  );
  let matched = false;
  for (const signature of signatures) {
    if (timingSafeEqual(signature, expected)) {
      matched = true;
    }
  }
  return matched ? 'valid' : 'mismatch';
}

/** True when one `v1=` entry of the header is the HMAC of this message under `secret`. */
export function verifyWebhookSignature(
  secret: string,
  id: string,
  timestamp: string,
  header: string,
  rawBody: string | Buffer,
): boolean {
  return (
    checkWebhookSignature(secret, id, timestamp, header, rawBody) === 'valid'
  );
}
