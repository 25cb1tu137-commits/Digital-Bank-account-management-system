// routes/bank.js - everything here requires login (see requireAuth in server.js)
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { toPaise, post } = require('../helpers');

const router = express.Router();

// Look up the logged-in user's account on every request.
router.use((req, res, next) => {
  req.account = db.prepare('SELECT * FROM accounts WHERE user_id = ?').get(req.userId);
  req.account ? next() : res.status(404).json({ error: 'Account not found.' });
});

const note = (v) => String(v || '').trim().slice(0, 100) || null;

// Runs a money operation and turns known errors into friendly messages.
function run(res, fn) {
  try { res.json(fn()); }
  catch (e) {
    if (e.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Insufficient balance for this transaction.' });
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e); res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
const fail = (status, message) => Object.assign(new Error(message), { status });

router.get('/me', (req, res) => {
  const u = db.prepare('SELECT name, phone, created_at FROM users WHERE id = ?').get(req.userId);
  // Totals for the current month (UTC), shown on the dashboard card
  const m = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type IN ('deposit','transfer_in') THEN amount END), 0) AS monthIn,
      COALESCE(SUM(CASE WHEN type IN ('withdrawal','transfer_out') THEN amount END), 0) AS monthOut,
      COUNT(*) AS monthCount
    FROM transactions WHERE account_id = ? AND created_at >= strftime('%Y-%m-01', 'now')`).get(req.account.id);
  res.json({ ...u, accountNumber: req.account.account_number, balance: req.account.balance, ...m });
});

router.put('/me', (req, res) => {
  const name = String(req.body.name || '').trim();
  // The mobile number is the login ID, so it cannot be changed here.
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Enter your full name (2-60 characters).' });
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.userId);
  res.json({ ok: true });
});

router.put('/me/password', (req, res) => {
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
  const { currentPassword = '', newPassword = '' } = req.body;
  if (!bcrypt.compareSync(String(currentPassword), user.password_hash))
    return res.status(400).json({ error: 'Current password is incorrect.' });
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword))
    return res.status(400).json({ error: 'New password needs 8+ characters with letters and numbers.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.userId);
  res.json({ ok: true });
});

router.post('/deposit', (req, res) => {
  const amount = toPaise(req.body.amount);
  if (!amount) return res.status(400).json({ error: 'Enter an amount greater than zero (max 2 decimals).' });
  if (amount > 10000000) return res.status(400).json({ error: 'Single deposits are limited to ₹1,00,000.' });
  run(res, () => ({ balance: db.transaction(() => post(req.account.id, 'deposit', amount, { note: note(req.body.note) }))() }));
});

router.post('/withdraw', (req, res) => {
  const amount = toPaise(req.body.amount);
  if (!amount) return res.status(400).json({ error: 'Enter an amount greater than zero (max 2 decimals).' });
  run(res, () => ({ balance: db.transaction(() => post(req.account.id, 'withdrawal', amount, { note: note(req.body.note) }))() }));
});

router.post('/transfer', (req, res) => {
  const amount = toPaise(req.body.amount);
  const to = String(req.body.toAccount || '').trim();
  if (!/^\d{12}$/.test(to)) return res.status(400).json({ error: 'Account number must be 12 digits.' });
  if (!amount) return res.status(400).json({ error: 'Enter an amount greater than zero (max 2 decimals).' });
  if (to === req.account.account_number) return res.status(400).json({ error: 'You cannot transfer to your own account.' });

  // The debit and credit happen inside ONE database transaction:
  // if anything fails, both are rolled back and no money is lost or created.
  run(res, () => db.transaction(() => {
    const target = db.prepare('SELECT id FROM accounts WHERE account_number = ?').get(to);
    if (!target) throw fail(404, 'Recipient account not found.');
    const n = note(req.body.note);
    const balance = post(req.account.id, 'transfer_out', amount, { counterparty: to, note: n });
    post(target.id, 'transfer_in', amount, { counterparty: req.account.account_number, note: n });
    return { balance };
  })());
});

router.get('/transactions', (req, res) => {
  const type = ['deposit', 'withdrawal', 'transfer_in', 'transfer_out'].includes(req.query.type) ? req.query.type : null;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const rows = db.prepare(`SELECT id, type, amount, balance_after, counterparty, note, created_at
      FROM transactions WHERE account_id = ? ${type ? 'AND type = ?' : ''} ORDER BY id DESC LIMIT ?`)
    .all(...[req.account.id, ...(type ? [type] : []), limit]);
  res.json(rows);
});

// Statement for a date range. The browser sends its timezone offset (tz, in minutes)
// so "1 Nov to 30 Nov" means the user's local days, not UTC days.
router.get('/statement', (req, res) => {
  const { from, to } = req.query;
  const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d));
  if (!validDate(from) || !validDate(to)) return res.status(400).json({ error: 'Choose a valid From and To date.' });
  if (from > to) return res.status(400).json({ error: 'The From date must be on or before the To date.' });
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 366) return res.status(400).json({ error: 'Choose a period of up to one year.' });

  const tz = Math.max(-840, Math.min(840, parseInt(req.query.tz) || 0));
  const shift = `${tz >= 0 ? '+' : '-'}${Math.abs(tz)} minutes`;
  const rows = db.prepare(`SELECT id, type, amount, balance_after, counterparty, note, created_at
      FROM transactions WHERE account_id = ? AND date(created_at, ?) BETWEEN ? AND ? ORDER BY id ASC`)
    .all(req.account.id, shift, from, to);
  const before = db.prepare(`SELECT balance_after FROM transactions
      WHERE account_id = ? AND date(created_at, ?) < ? ORDER BY id DESC LIMIT 1`).get(req.account.id, shift, from);

  const openingBalance = before ? before.balance_after : 0;
  const isCredit = (t) => t.type === 'deposit' || t.type === 'transfer_in';
  const totalIn = rows.filter(isCredit).reduce((s, t) => s + t.amount, 0);
  const totalOut = rows.filter((t) => !isCredit(t)).reduce((s, t) => s + t.amount, 0);
  const user = db.prepare('SELECT name, phone FROM users WHERE id = ?').get(req.userId);
  res.json({ holder: user.name, phone: user.phone, accountNumber: req.account.account_number, from, to,
             openingBalance, closingBalance: rows.length ? rows[rows.length - 1].balance_after : openingBalance,
             totalIn, totalOut, rows });
});

module.exports = router;
