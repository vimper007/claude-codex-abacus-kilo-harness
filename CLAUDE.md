<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

## Active Plan

### Add `/health` endpoint to `server.js`

**Goal:** Return app version (from `package.json`) and uptime in seconds.

**Steps:**

1. **Require `package.json` at the top of `server.js`**
   ```js
   const { version } = require('./package.json');
   ```
   Capture server start time just after:
   ```js
   const startTime = Date.now();
   ```

2. **Add the route before `app.listen`**
   ```js
   app.get('/health', (req, res) => {
     res.json({
       version,
       uptime: Math.floor((Date.now() - startTime) / 1000),
     });
   });
   ```

3. **No new files, no new dependencies** — uses only Node built-ins and the existing `package.json`.

**Response shape:**
```json
{ "version": "1.0.0", "uptime": 42 }
```

**Files touched:** `server.js` only (2 additions + 1 route block).

## Decisions Made
 
- 2026-04-19: /health endpoint implemented and tested
- 2026-04-19: /health2 endpoint implemented and tested
- 2026-04-19: storage.js + tests implemented — 6/6 tests passing
- 2026-04-19: URL shortener feature implemented — lib/storage.js, lib/shortener.js, lib/rateLimit.js, lib/validate.js, routes/shorten.js, test/shortener.test.js — tests passing 15/15


---

## URL Shortener Plan

### 1. File Structure

```
server.js                  ← mount all routes, app.listen (already exists)
lib/
  storage.js               ← in-memory store behind a clean interface
  shortener.js             ← business logic: create, resolve, stats
  rateLimit.js             ← sliding-window rate-limit middleware
  validate.js              ← URL validation helper
routes/
  shorten.js               ← POST /shorten, GET /s/:code, GET /stats/:code
test/
  shortener.test.js        ← all test cases (Node built-in test runner)
```

**`server.js` change:** add two lines only:
```js
const shortenRoutes = require('./routes/shorten');
app.use('/', shortenRoutes);
```

---

### 2. Data Structures

**`UrlEntry`** — one record per short code:
```js
{
  shortCode:   string,   // 6-char alphanumeric key
  originalUrl: string,   // the URL submitted by the client
  hits:        number,   // redirect count, starts at 0
  createdAt:   string,   // ISO 8601 timestamp at creation
  expiresAt:   string,   // ISO 8601 timestamp = createdAt + 24 h
}
```

**In-memory store** (inside `lib/storage.js`):
```js
const store = new Map(); // Map<string, UrlEntry>
```

**Rate-limit state** (inside `lib/rateLimit.js`):
```js
const ipWindows = new Map(); // Map<string, number[]> — timestamps in ms per IP
```

---

### 3. Short Code Algorithm

**Choice: `crypto.randomBytes` (Node built-in) — no new dependency.**

Rationale: `nanoid` would work but adds a package. `Math.random` is not
cryptographically random. `crypto.randomBytes` is built-in, fast, and
produces uniform randomness.

```js
// lib/shortener.js
const crypto = require('crypto');
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateCode() {
  // 6 random bytes → map each to CHARS via modulo (62^6 ≈ 56B possibilities;
  // modulo bias is negligible at this scale)
  return Array.from(crypto.randomBytes(6), b => CHARS[b % 62]).join('');
}
```

**Collision-free guarantee:**
```js
function createShortCode(storage) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    if (!storage.get(code)) return code;
  }
  throw new Error('Could not generate unique code after 10 attempts');
}
```
10 retries is overkill at 56B possibilities but protects against pathological
cases. Throw is intentional — the route catches it and returns 500.

---

### 4. Rate-Limiting Algorithm

**Choice: Sliding window (per-IP, in-memory).**

Rationale:
- **Fixed window** allows burst at boundary (9 at 0:59, 9 at 1:00 = 18 in 2 s).
- **Token bucket** is accurate but more code. Sliding window is equally
  accurate and simpler to implement and audit.
- **Redis** is not available, so sliding window over an array of timestamps
  is the right fit.

```js
// lib/rateLimit.js
const WINDOW_MS = 60_000;
const MAX = 10;
const ipWindows = new Map();

module.exports = function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  // Prune timestamps outside the window
  const timestamps = (ipWindows.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (timestamps.length >= MAX) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 10 shortens per minute.' });
  }
  timestamps.push(now);
  ipWindows.set(ip, timestamps);
  next();
};
```

Apply this middleware **only** to `POST /shorten` — not to redirects or stats.

---

### 5. Error Handling Strategy

**Validation lives in `lib/validate.js`,** called at the top of the POST handler
before any storage access.

```js
// lib/validate.js
const MAX_URL_LENGTH = 2048;

function validateUrl(value) {
  if (!value || typeof value !== 'string') {
    return 'url is required';
  }
  if (value.length > MAX_URL_LENGTH) {
    return `url must be ${MAX_URL_LENGTH} characters or fewer`;
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'url must use http or https';
    }
  } catch {
    return 'url is not a valid URL';
  }
  return null; // null = valid
}

module.exports = { validateUrl };
```

**Error shape** — all error responses:
```json
{ "error": "human-readable message" }
```

**Status codes:**

| Situation | Code |
|---|---|
| Validation failure (bad/missing url, too long) | `400` |
| Short code not found | `404` |
| Short code found but expired | `404` with `"error": "Link expired"` |
| Rate limit exceeded | `429` |
| Unexpected server error | `500` |

Expired entries return 404 (not 410) to avoid leaking expiry information
in a different status code than "not found."

---

### 6. Storage Interface (Redis-swap ready)

`lib/storage.js` exports a plain object with four methods. The rest of the
codebase calls only these — never touching the `Map` directly.

```js
// lib/storage.js
const store = new Map();

module.exports = {
  /** @param {string} code @param {object} entry */
  set(code, entry) {
    store.set(code, entry);
  },

  /** @param {string} code @returns {object|null} */
  get(code) {
    return store.get(code) ?? null;
  },

  /** @param {string} code — increments hits in place, returns new count */
  incrementHits(code) {
    const entry = store.get(code);
    if (!entry) return null;
    entry.hits += 1;
    return entry.hits;
  },

  /** @param {string} code */
  delete(code) {
    store.delete(code);
  },

  /** For testing only — wipe all state */
  _clear() {
    store.clear();
  },
};
```

**Redis swap:** replace this file with one backed by `ioredis`. The same four
method signatures hold; `incrementHits` maps to `HINCRBY`; `set`/`get` map to
`HSET`/`HGETALL`; `delete` maps to `DEL`. No changes to `shortener.js` or
routes are required.

---

### 7. Route Handlers (`routes/shorten.js`)

```js
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
```

`app.use(express.json())` must be added to `server.js` so `req.body` is parsed.

---

### 8. `lib/shortener.js` — Core Logic

```js
// lib/shortener.js
const crypto = require('crypto');
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateCode() {
  return Array.from(crypto.randomBytes(6), b => CHARS[b % 62]).join('');
}

function createEntry(url, storage) {
  let code;
  for (let i = 0; i < 10; i++) {
    const candidate = generateCode();
    if (!storage.get(candidate)) { code = candidate; break; }
  }
  if (!code) throw new Error('Could not generate unique code');

  const now = new Date();
  const entry = {
    shortCode: code,
    originalUrl: url,
    hits: 0,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
  };
  storage.set(code, entry);
  return entry;
}

function resolveCode(code, storage) {
  const entry = storage.get(code);
  if (!entry) return null;
  if (new Date() > new Date(entry.expiresAt)) return { expired: true };
  storage.incrementHits(code);
  return entry;
}

module.exports = { createEntry, resolveCode };
```

---

### 9. Test Cases (`test/shortener.test.js`)

Use `node:test` + `node:assert` — no new test dependency needed.

Start a test instance of the app on a random port; tear down after all tests.

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Valid URL shortened | `POST /shorten {"url":"https://example.com"}` | 200, `shortCode` is 6 alphanumeric chars, `shortUrl` ends with the code |
| 2 | Missing `url` field | `POST /shorten {}` | 400 `{"error":"url is required"}` |
| 3 | Non-URL string | `POST /shorten {"url":"not-a-url"}` | 400 `{"error":"url is not a valid URL"}` |
| 4 | Non-http/https scheme | `POST /shorten {"url":"ftp://x.com"}` | 400 `{"error":"url must use http or https"}` |
| 5 | URL > 2048 chars | `POST /shorten {"url":"https://x.com/" + "a".repeat(2040)}` | 400 url too long |
| 6 | Valid redirect | `GET /s/<code>` for existing, unexpired entry | 302, `Location` header = originalUrl |
| 7 | Unknown code redirect | `GET /s/xxxxxx` | 404 `{"error":"Not found"}` |
| 8 | Expired redirect | `GET /s/<code>` where entry.expiresAt is in the past | 404 `{"error":"Link expired"}` |
| 9 | Stats for valid code | `GET /stats/<code>` | 200 with all 5 fields, correct types |
| 10 | Stats for unknown code | `GET /stats/xxxxxx` | 404 `{"error":"Not found"}` |
| 11 | Hits increment | `GET /s/<code>` twice, then `GET /stats/<code>` | `hits === 2` |
| 12 | Rate limit enforced | 11× `POST /shorten` from same IP | 11th returns 429 |
| 13 | Rate limit resets | After window passes (mock `Date.now`), POST succeeds again | 200 |
| 14 | Code uniqueness | Generate 10 000 codes via `generateCode()` | No duplicates in Set |
| 15 | Stats not affected by expired entry | `GET /stats/<expired-code>` | 200 (stats always readable, no expiry check) |

---

### 10. Dependencies to Install

```bash
# No new runtime dependencies needed.
# express is already installed.
# crypto and URL are Node built-ins.
```

If a test runner helper is wanted:
```bash
npm install --save-dev supertest
```
`supertest` wraps the Express app for HTTP assertions without spinning up a
real port. Optional but strongly recommended for tests 1–13.
