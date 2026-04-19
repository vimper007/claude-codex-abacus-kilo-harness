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

module.exports = { createEntry, resolveCode, generateCode };
