'use strict';
const http = require('node:http');
const fs = require('node:fs');
const web = process.argv[2] === 'web';
const route = web ? '/api/release-identity' : '/health/ready';
const request = http.get({ host: '127.0.0.1', port: web ? 3000 : 4000, path: route, timeout: 5000 }, response => {
  let body = '';
  response.on('data', chunk => { body += chunk; if (body.length > 32768) response.destroy(); });
  response.on('end', () => {
    try {
      const data = JSON.parse(body);
      const sha = data.release?.sha ?? data.sha ?? data.releaseSha;
      const expected = JSON.parse(fs.readFileSync('/app/release.json', 'utf8'));
      if (response.statusCode !== 200 || sha !== expected.releaseSha || (!web &&
          (data.ok !== true || data.dependencies?.database?.migrationCount !== expected.migrationCount ||
           data.dependencies?.database?.migration !== expected.migration))) process.exitCode = 1;
    } catch { process.exitCode = 1; }
  });
});
request.on('timeout', () => request.destroy());
request.on('error', () => { process.exitCode = 1; });
