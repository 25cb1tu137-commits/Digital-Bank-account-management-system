// seed.js - demo data. Run with `npm run seed`. All people and numbers are fictional.
const bcrypt = require('bcryptjs');
const db = require('./db');
const { newAccountNumber, post } = require('./helpers');

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return false;
  const hash = bcrypt.hashSync('Demo@1234', 10);
  const people = [
    ['Aarav Sharma', '9876500001'],
    ['Priya Verma', '9876500002'],
    ['Rohan Mehta', '9876500003'],
  ];
  db.transaction(() => {
    const ids = people.map(([name, phone]) => {
      const u = db.prepare('INSERT INTO users (name,phone,password_hash) VALUES (?,?,?)').run(name, phone, hash);
      return db.prepare('INSERT INTO accounts (user_id, account_number) VALUES (?,?)').run(u.lastInsertRowid, newAccountNumber()).lastInsertRowid;
    });
    const num = (id) => db.prepare('SELECT account_number n FROM accounts WHERE id=?').get(id).n;
    post(ids[0], 'deposit', 5000000, { note: 'Opening deposit' });
    post(ids[1], 'deposit', 2500000, { note: 'Opening deposit' });
    post(ids[2], 'deposit', 1000000, { note: 'Opening deposit' });
    post(ids[0], 'withdrawal', 200000, { note: 'Rent' });
    post(ids[0], 'transfer_out', 150000, { counterparty: num(ids[1]), note: 'Dinner split' });
    post(ids[1], 'transfer_in', 150000, { counterparty: num(ids[0]), note: 'Dinner split' });
    post(ids[2], 'deposit', 350000, { note: 'Internship stipend' });
    post(ids[1], 'withdrawal', 45000, { note: 'Groceries' });
  })();
  return true;
}

module.exports = seed;
if (require.main === module) {
  console.log(seed() ? 'Demo data added. Log in with 9876500001 / Demo@1234' : 'Database already has users - nothing changed.');
}
