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