#!/usr/bin/env node
// CONNECT-only egress proxy for Langame club servers.
//
// The legacy network fence admits exact hostnames resolved to IP sets, but each
// Langame club network has its own `<club>.langame.ru` server on its own IP, so
// every new network needed a host firewall change. API and workers send Langame
// requests here instead (LANGAME_PROXY_URL); the proxy opens a TLS tunnel only to
// subdomains of the allowed suffixes, only on port 443 and only to public IPv4
// addresses. It never sees request contents or API keys (TLS is end to end).
import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

export const DEFAULT_SUFFIXES = ['langame.ru', 'langamepro.ru'];
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IDLE_TIMEOUT_MS = 120_000;
const CONNECT_TIMEOUT_MS = 10_000;

const nonPublic = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
]) nonPublic.addSubnet(address, prefix, 'ipv4');

export function isPublicIpv4(address) {
  return net.isIPv4(address) && !nonPublic.check(address, 'ipv4');
}

/** Returns the hostname when `target` (`host:port` of a CONNECT) is admitted, else null. */
export function admittedHost(target, suffixes = DEFAULT_SUFFIXES) {
  const match = /^([^:\s]+):(\d{1,5})$/.exec(String(target ?? ''));
  if (!match || match[2] !== '443') return null;
  const host = match[1].toLowerCase();
  if (!HOSTNAME.test(host)) return null;
  return suffixes.some(suffix => host.endsWith(`.${suffix}`)) ? host : null;
}

async function resolvePublic(host) {
  const answers = await dns.lookup(host, { all: true, family: 4 });
  const addresses = answers.map(answer => answer.address);
  if (!addresses.length || !addresses.every(isPublicIpv4)) throw new Error('non-public address');
  return addresses[0];
}

export function createLangameProxy({
  suffixes = DEFAULT_SUFFIXES,
  sources = [],
  resolve = resolvePublic,
  connect = (address, port) => net.connect({ host: address, port }),
  log = entry => console.log(JSON.stringify(entry)),
} = {}) {
  const server = http.createServer((req, res) => {
    res.writeHead(405, { connection: 'close' }).end();
  });
  server.maxConnections = 256;

  server.on('connect', async (req, client, head) => {
    const started = Date.now();
    const source = client.remoteAddress?.replace(/^::ffff:/, '');
    const done = (result, extra = {}) => log({ at: new Date().toISOString(), source, target: req.url, result, ms: Date.now() - started, ...extra });
    const refuse = (status, result) => {
      client.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      done(result);
    };
    client.on('error', () => {});
    client.setTimeout(IDLE_TIMEOUT_MS, () => client.destroy());

    if (sources.length && !sources.includes(source)) return refuse('403 Forbidden', 'source-denied');
    const host = admittedHost(req.url, suffixes);
    if (!host) return refuse('403 Forbidden', 'target-denied');

    let address;
    try {
      address = await resolve(host);
    } catch (error) {
      return refuse('502 Bad Gateway', `resolve-failed: ${error.code ?? error.message}`);
    }

    if (client.destroyed) return done('client-gone');
    let established = false;
    const upstream = connect(address, 443);
    upstream.setTimeout(CONNECT_TIMEOUT_MS, () => upstream.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    upstream.once('connect', () => {
      established = true;
      upstream.setTimeout(IDLE_TIMEOUT_MS);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
      done('tunnel', { address });
    });
    upstream.on('error', error => {
      if (established) client.destroy();
      else refuse('502 Bad Gateway', `connect-failed: ${error.code ?? error.message}`);
    });
    client.on('close', () => upstream.destroy());
  });

  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const list = value => (value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  const suffixes = list(process.env.LANGAME_PROXY_SUFFIXES);
  const server = createLangameProxy({
    suffixes: suffixes.length ? suffixes : DEFAULT_SUFFIXES,
    sources: list(process.env.LANGAME_PROXY_SOURCES),
  });
  const host = process.env.LANGAME_PROXY_HOST ?? '0.0.0.0';
  const port = Number(process.env.LANGAME_PROXY_PORT ?? 3128);
  server.listen(port, host, () => console.log(JSON.stringify({ at: new Date().toISOString(), listening: `${host}:${port}` })));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
