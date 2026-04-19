const router = require('express').Router();
const storage = require('../lib/storage');
const { validateUrl } = require('../lib/validate');
const rateLimit = require('../lib/rateLimit');
const { createEntry, resolveCode } = require('../lib/shortener');

// POST /shorten
router.post('/shorten', rateLimit, (req, res) => {
  const error = validateUrl(req.body?.url);
  if (error) return res.status(400).json({ error });
  try {
    const entry = createEntry(req.body.url, storage);
    res.json({
      shortCode: entry.shortCode,
      shortUrl: `http://${req.headers.host}/s/${entry.shortCode}`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate short code' });
  }
});

// GET /s/:code
router.get('/s/:code', (req, res) => {
  const result = resolveCode(req.params.code, storage);
  if (!result) return res.status(404).json({ error: 'Not found' });
  if (result.expired) return res.status(404).json({ error: 'Link expired' });
  res.redirect(302, result.originalUrl);
});

// GET /stats/:code
router.get('/stats/:code', (req, res) => {
  const entry = storage.get(req.params.code);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json({
    shortCode: entry.shortCode,
    originalUrl: entry.originalUrl,
    hits: entry.hits,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
  });
});

module.exports = router;
