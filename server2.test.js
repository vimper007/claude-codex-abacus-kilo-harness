const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const { version } = require('./package.json');

test('GET /health returns 200 with version and uptime', async (t) => {
  const app = express();
  const startTime = Date.now();

  app.get('/health', (req, res) => {
    res.json({
      version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  const server = app.listen(0, async () => {
    const port = server.address().port;

    await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/health`, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            assert.strictEqual(res.statusCode, 200, 'Status code should be 200');
            const body = JSON.parse(data);
            assert.strictEqual(typeof body.version, 'string', 'version should be a string');
            assert.strictEqual(typeof body.uptime, 'number', 'uptime should be a number');
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });

    server.close();
  });
});

test('GET /health2 returns 200 with version, uptime, and status: ok', async (t) => {
  const app = express();
  const startTime = Date.now();

  app.get('/health2', (req, res) => {
    res.json({
      version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      status: 'ok'
    });
  });

  const server = app.listen(0, async () => {
    const port = server.address().port;

    await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/health2`, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            assert.strictEqual(res.statusCode, 200, 'Status code should be 200');
            const body = JSON.parse(data);
            assert.strictEqual(typeof body.version, 'string', 'version should be a string');
            assert.strictEqual(typeof body.uptime, 'number', 'uptime should be a number');
            assert.strictEqual(body.status, 'ok', 'status should be "ok"');
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });

    server.close();
  });
});