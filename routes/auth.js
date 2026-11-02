// routes/auth.js - register and login
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { newAccountNumber, toPaise, post } = require('../helpers');

const router = express.Router();
const sign = (id) => jwt.sign({ uid: id }, process.env.JWT_SECRET, { expiresIn: '2h' });
// Indian mobile number: exactly 10 digits, starting with 6, 7, 8 or 9.
const PHONE = /^[6-9]\d{9}$/;

router.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');
  const opening = req.body.openingDeposit ? toPaise(req.body.openingDeposit) : 0;

  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Enter your full name (2-60 characters).' });
  if (!PHONE.test(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    return res.status(400).json({ error: 'Password needs 8+ characters with letters and numbers.' });
  if (opening === null) return res.status(400).json({ error: 'Opening deposit must be a valid amount.' });
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone))
    return res.status(409).json({ error: 'An account with this mobile number already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  // Create the user, the bank account and the opening deposit as one unit.
  const create = db.transaction(() => {
    const u = db.prepare('INSERT INTO users (name, phone, password_hash) VALUES (?,?,?)')
                .run(name, phone, hash);
    const a = db.prepare('INSERT INTO accounts (user_id, account_number) VALUES (?, ?)')
                .run(u.lastInsertRowid, newAccountNumber());
    if (opening > 0) post(a.lastInsertRowid, 'deposit', opening, { note: 'Opening deposit' });
    return u.lastInsertRowid;
  });
  res.status(201).json({ token: sign(create()) });
});

router.post('/login', (req, res) => {
  const phone = String(req.body.phone || '').trim();
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  // Same message for "no such user" and "wrong password" so attackers learn nothing.
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash))
    return res.status(401).json({ error: 'Incorrect mobile number or password.' });
  res.json({ token: sign(user.id) });
});

module.exports = router;
