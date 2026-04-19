const express = require('express');
const { version } = require('./package.json');
const app = express();
const PORT = 3000;
const startTime = Date.now();

app.get('/', (req, res) => {
  res.json({ message: 'Hello from harness' });
});

app.get('/health', (req, res) => {
  res.json({
    version,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/health2', (req, res) => {
  res.json({
    version,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    status: 'ok'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});