import { readFileSync } from 'fs';
import { join } from 'path';

const caddyfile = readFileSync(
  join(__dirname, '../../../../deploy/Caddyfile'),
  'utf8',
);

describe('deploy/Caddyfile', () => {
  // /healthz is internal: the app serves it, the proxy must never forward it to the internet.
  // Caddy evaluates `respond` before `reverse_proxy` whatever their order in the file; the order
  // check is a belt-and-braces guard for a future `route {}` wrapper, the exact line is what matters.
  it('blocks /healthz*, and does so before proxying', () => {
    const block = caddyfile.indexOf('respond /healthz* 404');
    const proxy = caddyfile.indexOf('reverse_proxy');

    expect(block).toBeGreaterThan(-1);
    expect(proxy).toBeGreaterThan(block);
  });
});
