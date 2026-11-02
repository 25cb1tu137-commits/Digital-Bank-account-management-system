// server.js - starts the web server. It serves both the API (/api/...) and the frontend (public/).
require('dotenv').config();
if (process.env.VERCEL) {
  // Vercel demo defaults so the app works with zero setup. Set JWT_SECRET in Vercel's
  // Environment Variables to use your own secret (recommended).
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'campustrust-demo-secret-change-me-in-vercel-settings';
  process.env.SEED_DEMO = process.env.SEED_DEMO || 'true';
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET is missing or too short. Copy .env.example to .env and set it.');
  process.exit(1);
}
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { requireAuth } = require('./auth');

const app = express();
if (process.env.VERCEL) app.set('trust proxy', 1);   // real client IP behind Vercel, for the rate limiter
app.use(helmet());                 // safe default security headers
app.use(express.json({ limit: '10kb' }));

// Slow down password guessing: 20 login/register attempts per 15 min per IP.
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { error: 'Too many attempts. Try again in a few minutes.' } }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', requireAuth, require('./routes/bank'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use(express.static(path.join(__dirname, 'public')));

// Catch-all error handler (e.g. malformed JSON)
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Invalid request.' : 'Server error.' });
});

if (process.env.SEED_DEMO === 'true') require('./seed')();

module.exports = app;
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Bank running at http://localhost:${port}`));
}
