import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { admittedHost, createLangameProxy, isPublicIpv4 } from './langame-proxy.mjs';

test('admittedHost lets through only club subdomains on port 443', () => {
  assert.equal(admittedHost('ostrov.centralarena.langame.ru:443'), 'ostrov.centralarena.langame.ru');
  assert.equal(admittedHost('46.LANGAMEPRO.ru:443'), '46.langamepro.ru');
  assert.equal(admittedHost('1337.langame.ru:80'), null);
  assert.equal(admittedHost('langame.ru:443'), null);
  assert.equal(admittedHost('evil-langame.ru:443'), null);
  assert.equal(admittedHost('1337.langame.ru.evil.com:443'), null);
  assert.equal(admittedHost('92.53.124.51:443'), null);
  assert.equal(admittedHost('[::1]:443'), null);
  assert.equal(admittedHost('1337.langame.ru'), null);
});

test('isPublicIpv4 rejects private, loopback and router fake-IP ranges', () => {
  assert.equal(isPublicIpv4('92.53.124.51'), true);
  for (const address of ['10.1.2.3', '127.0.0.1', '172.31.42.2', '192.168.1.137', '198.18.0.42', '100.64.0.1', '169.254.1.1', '::1']) {
    assert.equal(isPublicIpv4(address), false, address);
  }
});

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

function connectThrough(port, target, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    let data = '';
    socket.on('data', chunk => {
      data += chunk;
      if (payload && data.includes('200 Connection Established') && !socket.sent) {
        socket.sent = true;
        socket.write(payload);
      }
      if (!payload || data.includes(`echo:${payload}`)) socket.end();
    });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

test('the proxy tunnels to an admitted host and refuses everything else', async t => {
  const echo = net.createServer(socket => socket.on('data', chunk => socket.end(`echo:${chunk}`)));
  const echoPort = await listen(echo);
  const logs = [];
  const proxy = createLangameProxy({
    resolve: async host => (host === 'private.langame.ru' ? Promise.reject(new Error('non-public address')) : '92.53.124.51'),
    connect: () => net.connect({ host: '127.0.0.1', port: echoPort }),
    log: entry => logs.push(entry),
  });
  const port = await listen(proxy);
  t.after(() => { proxy.close(); echo.close(); });

  const tunnelled = await connectThrough(port, 'ostrov.centralarena.langame.ru:443', 'hello');
  assert.match(tunnelled, /^HTTP\/1\.1 200 Connection Established/);
  assert.match(tunnelled, /echo:hello/);

  assert.match(await connectThrough(port, 'example.com:443'), /^HTTP\/1\.1 403/);
  assert.match(await connectThrough(port, '1337.langame.ru:22'), /^HTTP\/1\.1 403/);
  assert.match(await connectThrough(port, 'private.langame.ru:443'), /^HTTP\/1\.1 502/);

  assert.deepEqual(logs.map(entry => entry.result), ['tunnel', 'target-denied', 'target-denied', 'resolve-failed: non-public address']);
});

test('the proxy refuses plain HTTP requests and unknown sources', async t => {
  const proxy = createLangameProxy({ sources: ['172.30.44.10'], log: () => {} });
  const port = await listen(proxy);
  t.after(() => proxy.close());

  const plain = await fetch(`http://127.0.0.1:${port}/public_api/clubs/list`);
  assert.equal(plain.status, 405);
  assert.match(await connectThrough(port, '1337.langame.ru:443'), /^HTTP\/1\.1 403/);
});
