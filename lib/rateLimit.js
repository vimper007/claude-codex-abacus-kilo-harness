const WINDOW_MS = 60_000;
const MAX = 10;
const ipWindows = new Map();

function rateLimitMiddleware(req, res, next) {
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
}

module.exports = rateLimitMiddleware;
module.exports._clear = () => ipWindows.clear();
