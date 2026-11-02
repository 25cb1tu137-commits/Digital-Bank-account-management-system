// auth.js - middleware that checks the login token on protected routes.
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).uid;
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

module.exports = { requireAuth };
