import {
  checkWebhookSignature,
  computeWebhookSignature,
  verifyWebhookSignature,
} from './webhook-signature';

/**
 * FIXED test vectors (contract PC7), copied verbatim from home-auth
 * (backend/src/domain/shared/webhook-signer.spec.ts, SlobodaFR/home-auth#83): any change here is
 * a change of the contract. Cross-checked with
 * `printf '%s' '<id>.<timestamp>.<body>' | openssl dgst -sha256 -hmac <secret>`: the key is the
 * secret string itself (its 64 hex characters, UTF-8), NOT its decoded bytes.
 */
const SECRET_1 =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const SECRET_2 =
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
const ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const BODY = '{"userId":"u1"}';
const SIG_1 =
  '41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242';
const SIG_2 =
  '89de6c4652b33d864427b3091771ed8b9266a99b3bf915b126eb4655a2dce09f';

describe('webhook signature test vectors (PC7)', () => {
  it('vector 1: HMAC-SHA256(secret, id.timestamp.rawBody)', () => {
    expect(computeWebhookSignature(SECRET_1, ID, '1700000000', BODY)).toBe(
      SIG_1,
    );
  });

  it('vector 2: another secret, same message', () => {
    expect(computeWebhookSignature(SECRET_2, ID, '1700000000', BODY)).toBe(
      SIG_2,
    );
  });

  it('vector 3: body hashed as UTF-8 bytes (non-ASCII user id)', () => {
    const body = '{"userId":"4b8f-é"}';
    const expected =
      'd9a2c8cec34058ebb100f8b454ba46b1214cf777000d9aab00dda91205d5a3ac';
    const id = '9b2f0f6e-8d3a-4f6b-9c1e-2a7d5e4c1b30';
    expect(computeWebhookSignature(SECRET_1, id, '1700000123', body)).toBe(
      expected,
    );
    expect(
      computeWebhookSignature(SECRET_1, id, '1700000123', Buffer.from(body)),
    ).toBe(expected);
    expect(
      verifyWebhookSignature(
        SECRET_1,
        id,
        '1700000123',
        `v1=${expected}`,
        Buffer.from(body),
      ),
    ).toBe(true);
  });

  it('vector 4 (overlap): header with both entries is accepted for either secret', () => {
    const header = `v1=${SIG_1},v1=${SIG_2}`;
    expect(
      verifyWebhookSignature(SECRET_1, ID, '1700000000', header, BODY),
    ).toBe(true);
    expect(
      verifyWebhookSignature(SECRET_2, ID, '1700000000', header, BODY),
    ).toBe(true);
  });
});

describe('verifyWebhookSignature', () => {
  const verify = (
    header: string,
    overrides: {
      secret?: string;
      id?: string;
      ts?: string;
      body?: string;
    } = {},
  ) =>
    verifyWebhookSignature(
      overrides.secret ?? SECRET_1,
      overrides.id ?? ID,
      overrides.ts ?? '1700000000',
      header,
      overrides.body ?? BODY,
    );

  it('accepts a matching entry, wherever it is in the list', () => {
    expect(verify(`v1=${SIG_1}`)).toBe(true);
    expect(verify(`v1=${SIG_2},v1=${SIG_1}`)).toBe(true);
    expect(verify(`v1=${SIG_2}, v1=${SIG_1}`)).toBe(true);
  });

  it('accepts upper-case hex (decoded to bytes before comparing)', () => {
    expect(verify(`v1=${SIG_1.toUpperCase()}`)).toBe(true);
  });

  it('rejects when no entry matches', () => {
    expect(verify(`v1=${SIG_2}`)).toBe(false);
  });

  it('rejects a modified body, id, timestamp or secret', () => {
    const header = `v1=${SIG_1}`;
    expect(verify(header, { body: '{"userId":"u2"}' })).toBe(false);
    expect(verify(header, { body: '{ "userId":"u1"}' })).toBe(false);
    expect(verify(header, { id: '3b241101-e2bb-4255-8caf-4136c566a963' })).toBe(
      false,
    );
    expect(verify(header, { ts: '1700000001' })).toBe(false);
    expect(verify(header, { secret: SECRET_2 })).toBe(false);
  });

  it('rejects a body signed as another string with the same JSON meaning', () => {
    const spaced = '{"userId": "u1"}';
    const signed = computeWebhookSignature(SECRET_1, ID, '1700000000', spaced);
    expect(verify(`v1=${signed}`, { body: spaced })).toBe(true);
    expect(verify(`v1=${signed}`, { body: BODY })).toBe(false);
  });

  it.each([
    ['empty header', ''],
    ['no entry', ','],
    ['wrong scheme', `v2=${SIG_1}`],
    ['no scheme', SIG_1],
    ['not hex', `v1=${'z'.repeat(64)}`],
    ['too short (31 bytes)', `v1=${SIG_1.slice(0, 62)}`],
    ['too long (33 bytes)', `v1=${SIG_1}00`],
    ['odd length', `v1=${SIG_1.slice(0, 63)}`],
    ['empty value', 'v1='],
    ['a valid entry next to a malformed one', `v1=${SIG_1},v1=zz`],
    ['a valid entry next to an unknown scheme', `v1=${SIG_1},v2=${SIG_1}`],
    ['trailing garbage', `v1=${SIG_1}x`],
    [
      'too many entries',
      Array(9).fill(`v1=${SIG_2}`).concat(`v1=${SIG_1}`).join(','),
    ],
  ])('rejects an invalid header: %s', (_name, header) => {
    expect(verify(header)).toBe(false);
  });
});

describe('checkWebhookSignature', () => {
  it('tells a malformed header from a signature that does not match', () => {
    const check = (header: string) =>
      checkWebhookSignature(SECRET_1, ID, '1700000000', header, BODY);

    expect(check(`v1=${SIG_1}`)).toBe('valid');
    expect(check(`v1=${SIG_2}`)).toBe('mismatch');
    expect(check('v1=abcd')).toBe('malformed');
    expect(check('')).toBe('malformed');
    expect(check(`v1=${SIG_1},v2=${SIG_1}`)).toBe('malformed');
  });
});
