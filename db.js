// db.js - opens the SQLite database and creates tables.
// Money is stored as INTEGER paise (1 rupee = 100 paise) to avoid floating-point errors.
// Uses Node's built-in SQLite (node:sqlite, Node 22.13+), so nothing needs compiling.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

// On Vercel the project folder is read-only; only /tmp is writable.
const dbPath = process.env.DB_PATH || (process.env.VERCEL ? '/tmp/bank.db' : './data/bank.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// db.transaction(fn) returns a function that runs fn inside BEGIN ... COMMIT.
// If fn throws, everything is rolled back (ROLLBACK) so the database is never left half-updated.
db.transaction = (fn) => (...args) => {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(...args); db.exec('COMMIT'); return result; }
  catch (err) { db.exec('ROLLBACK'); throw err; }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,   -- 10-digit mobile number: this is the login ID
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL UNIQUE REFERENCES users(id),
  account_number TEXT NOT NULL UNIQUE,
  balance        INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0), -- DB itself refuses negative balances
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS transactions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id     INTEGER NOT NULL REFERENCES accounts(id),
  type           TEXT NOT NULL CHECK (type IN ('deposit','withdrawal','transfer_in','transfer_out')),
  amount         INTEGER NOT NULL CHECK (amount > 0),
  balance_after  INTEGER NOT NULL,
  counterparty   TEXT,   -- the other account number in a transfer
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id, id DESC);
`);

module.exports = db;
