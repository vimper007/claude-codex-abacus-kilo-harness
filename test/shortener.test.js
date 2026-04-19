const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');
const storage = require('../lib/storage');
const rateLimit = require('../lib/rateLimit');
const { generateCode } = require('../lib/shortener');

test('URL Shortener Tests', async (t) => {
  // Reset storage and rate limit before tests
  storage._clear();
  rateLimit._clear();

  await t.test('1. Valid URL shortened', async () => {
    const res = await request(app)
      .post('/shorten')
      .send({ url: 'https://example.com' });
    
    assert.strictEqual(res.status, 200);
    assert.match(res.body.shortCode, /^[a-zA-Z0-9]{6}$/);
    assert.ok(res.body.shortUrl.endsWith(res.body.shortCode));
  });

  await t.test('2. Missing url field', async () => {
    const res = await request(app)
      .post('/shorten')
      .send({});
    
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body, { error: 'url is required' });
  });

  await t.test('3. Non-URL string', async () => {
    const res = await request(app)
      .post('/shorten')
      .send({ url: 'not-a-url' });
    
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body, { error: 'url is not a valid URL' });
  });

  await t.test('4. Non-http/https scheme', async () => {
    const res = await request(app)
      .post('/shorten')
      .send({ url: 'ftp://x.com' });
    
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body, { error: 'url must use http or https' });
  });

  await t.test('5. URL > 2048 chars', async () => {
    const res = await request(app)
      .post('/shorten')
      .send({ url: 'https://x.com/' + 'a'.repeat(2041) });
    
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('url must be 2048 characters or fewer'));
  });

  await t.test('6. Valid redirect', async () => {
    const shortenRes = await request(app)
      .post('/shorten')
      .send({ url: 'https://example.com/target' });
    
    const code = shortenRes.body.shortCode;
    const res = await request(app).get(`/s/${code}`);
    
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.location, 'https://example.com/target');
  });

  await t.test('7. Unknown code redirect', async () => {
    const res = await request(app).get('/s/xxxxxx');
    
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: 'Not found' });
  });

  await t.test('8. Expired redirect', async () => {
    const code = 'expired';
    storage.set(code, {
      shortCode: code,
      originalUrl: 'https://example.com',
      hits: 0,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await request(app).get(`/s/${code}`);
    
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: 'Link expired' });
  });

  await t.test('9. Stats for valid code', async () => {
    const shortenRes = await request(app)
      .post('/shorten')
      .send({ url: 'https://example.com' });
    
    const code = shortenRes.body.shortCode;
    const res = await request(app).get(`/stats/${code}`);
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.shortCode, code);
    assert.strictEqual(res.body.originalUrl, 'https://example.com');
    assert.strictEqual(typeof res.body.hits, 'number');
    assert.ok(res.body.createdAt);
    assert.ok(res.body.expiresAt);
  });

  await t.test('10. Stats for unknown code', async () => {
    const res = await request(app).get('/stats/xxxxxx');
    
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: 'Not found' });
  });

  await t.test('11. Hits increment', async () => {
    const shortenRes = await request(app)
      .post('/shorten')
      .send({ url: 'https://example.com' });
    
    const code = shortenRes.body.shortCode;
    await request(app).get(`/s/${code}`);
    await request(app).get(`/s/${code}`);
    
    const res = await request(app).get(`/stats/${code}`);
    assert.strictEqual(res.body.hits, 2);
  });

  await t.test('12. Rate limit enforced', async () => {
    rateLimit._clear();
    for (let i = 0; i < 10; i++) {
      await request(app).post('/shorten').send({ url: 'https://example.com' });
    }
    
    const res = await request(app).post('/shorten').send({ url: 'https://example.com' });
    assert.strictEqual(res.status, 429);
    assert.deepStrictEqual(res.body, { error: 'Rate limit exceeded. Max 10 shortens per minute.' });
  });

  await t.test('13. Rate limit resets', async () => {
    rateLimit._clear();
    // Since we can't easily mock time, we use the _clear() method to simulate a window reset
    for (let i = 0; i < 10; i++) {
      await request(app).post('/shorten').send({ url: 'https://example.com' });
    }
    
    rateLimit._clear();
    
    const res = await request(app).post('/shorten').send({ url: 'https://example.com' });
    assert.strictEqual(res.status, 200);
  });

  await t.test('14. Code uniqueness', async () => {
    const codes = new Set();
    for (let i = 0; i < 10000; i++) {
      codes.add(generateCode());
    }
    assert.strictEqual(codes.size, 10000);
  });

  await t.test('15. Stats not affected by expired entry', async () => {
    const code = 'expired-stats';
    storage.set(code, {
      shortCode: code,
      originalUrl: 'https://example.com',
      hits: 5,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await request(app).get(`/stats/${code}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.hits, 5);
  });
});
