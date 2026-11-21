const MAX_LENGTH = 200;
const REDACTED = '[redacted]';

// Order matters: specific shapes first, then generic key=value, then long opaque strings.
const SECRET_PATTERNS: RegExp[] = [
  // OpenAI-style keys, including the masked echo of a bad key ("sk-abc***xyz").
  /\bsk-[A-Za-z0-9_*-]+/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  // JWTs (header.payload.signature) and Google tokens/ids.
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
  /\bya29\.[A-Za-z0-9._-]+/g,
  /\b1\/\/[A-Za-z0-9._-]{20,}/g,
  // key=value / "key": "value" for credential-looking keys.
  /\b(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|token|secret|password|passwd|authorization)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  // Long opaque strings (API keys, session ids, base64 blobs).
  /\b[A-Za-z0-9_+/=-]{32,}\b/g,
];

/**
 * Message of an error an external API (OpenAI, Meta, Google, Home Assistant, our sidecars...) sent
 * back. Upstream error texts routinely echo what we sent (a masked API key, an email, a token), and
 * they end up in tool results, the credentials page (`lastError`) and, for unhandled exceptions,
 * in logs. So never forward them as is: redact secret-looking values and cap the length. Anything
 * that is not a non-empty string (FastAPI validation arrays, objects) falls back to `fallback`,
 * which must be built from the HTTP status only, never from the response body.
 */
export function upstreamErrorMessage(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return fallback;
  }
  let message = raw;
  for (const pattern of SECRET_PATTERNS) {
    message = message.replace(pattern, (...args: unknown[]) => {
      const keyName = typeof args[1] === 'string' ? args[1] : undefined;
      const separator = typeof args[2] === 'string' ? args[2] : '';
      return keyName ? `${keyName}${separator}${REDACTED}` : REDACTED;
    });
  }
  message = message.replace(/\s+/g, ' ').trim();
  return message.length > MAX_LENGTH
    ? `${message.slice(0, MAX_LENGTH)}...`
    : message;
}
