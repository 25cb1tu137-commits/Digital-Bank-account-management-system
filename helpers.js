// helpers.js - small shared functions: money conversion, account creation, posting transactions.
const crypto = require('crypto');
const db = require('./db');

// "250.50" -> 25050 paise. Returns null if the value is not a valid positive amount.
function toPaise(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const paise = Math.round(parseFloat(s) * 100);
  return paise > 0 ? paise : null;
}

function newAccountNumber() {
  for (;;) {
    const n = '5' + String(crypto.randomInt(0, 1e11)).padStart(11, '0'); // 12 digits
    if (!db.prepare('SELECT 1 FROM accounts WHERE account_number = ?').get(n)) return n;
  }
}

// Changes a balance and writes the matching transaction row.
// MUST be called inside db.transaction() so both happen together or not at all.
function post(accountId, type, amount, { counterparty = null, note = null } = {}) {
  const sign = (type === 'deposit' || type === 'transfer_in') ? 1 : -1;
  // "AND balance + ? >= 0" means an overdraft can never succeed, even in a race.
  const r = db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND balance + ? >= 0')
              .run(sign * amount, accountId, sign * amount);
  if (r.changes === 0) throw new Error('INSUFFICIENT_FUNDS');
  const { balance } = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(accountId);
  db.prepare(`INSERT INTO transactions (account_id, type, amount, balance_after, counterparty, note)
              VALUES (?, ?, ?, ?, ?, ?)`).run(accountId, type, amount, balance, counterparty, note);
  return balance;
}

module.exports = { toPaise, newAccountNumber, post };
