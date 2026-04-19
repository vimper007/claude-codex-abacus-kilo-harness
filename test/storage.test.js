const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const storage = require('../lib/storage');

describe('storage', () => {
  beforeEach(() => storage._clear());

  it('set then get returns the entry', () => {
    const entry = { shortCode: 'abc123', originalUrl: 'https://example.com', hits: 0 };
    storage.set('abc123', entry);
    const retrieved = storage.get('abc123');
    assert.deepStrictEqual(retrieved, entry);
  });

  it('get on unknown code returns null', () => {
    const retrieved = storage.get('nonexistent');
    assert.strictEqual(retrieved, null);
  });

  it('incrementHits increments hits by 1 and returns new count', () => {
    const entry = { shortCode: 'abc123', originalUrl: 'https://example.com', hits: 5 };
    storage.set('abc123', entry);
    const newHits = storage.incrementHits('abc123');
    assert.strictEqual(newHits, 6);
    assert.strictEqual(entry.hits, 6);
  });

  it('incrementHits on unknown code returns null', () => {
    const result = storage.incrementHits('nonexistent');
    assert.strictEqual(result, null);
  });

  it('delete removes the entry (subsequent get returns null)', () => {
    const entry = { shortCode: 'abc123', originalUrl: 'https://example.com', hits: 0 };
    storage.set('abc123', entry);
    assert.deepStrictEqual(storage.get('abc123'), entry);
    storage.delete('abc123');
    assert.strictEqual(storage.get('abc123'), null);
  });

  it('_clear wipes all entries', () => {
    storage.set('key1', {});
    storage.set('key2', {});
    storage._clear();
    assert.strictEqual(storage.get('key1'), null);
    assert.strictEqual(storage.get('key2'), null);
  });
});