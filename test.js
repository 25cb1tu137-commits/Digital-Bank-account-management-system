// test.js - automated end-to-end checks. Run: npm test
// Uses a throw-away database so your real data is never touched.
process.env.DB_PATH = './data/test.db';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.SEED_DEMO = 'false';
require('fs').rmSync('./data/test.db', { force: true });
const assert = require('assert');
const app = require('./server');

(async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (method, url, body, token) => {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  let passed = 0;
  const check = (name, cond) => { assert.ok(cond, 'FAILED: ' + name); console.log('  ok  ' + name); passed++; };

  // Registration + validation
  let r = await call('POST', '/auth/register', { name: 'A', phone: 'bad', password: '123' });
  check('rejects invalid registration', r.status === 400);
  r = await call('POST', '/auth/register', { name: 'Alice Test', phone: '9876543210', password: 'Passw0rd1', openingDeposit: '1000' });
  check('registers user with opening deposit', r.status === 201 && r.data.token);
  const A = r.data.token;
  r = await call('POST', '/auth/register', { name: 'Alice Again', phone: '9876543210', password: 'Passw0rd1' });
  check('rejects duplicate mobile number', r.status === 409);
  r = await call('POST', '/auth/register', { name: 'Bob Test', phone: '9123456780', password: 'Passw0rd1' });
  const B = r.data.token;

  // Login
  r = await call('POST', '/auth/login', { phone: '9876543210', password: 'wrong' });
  check('rejects wrong password', r.status === 401);
  r = await call('POST', '/auth/login', { phone: '9876543210', password: 'Passw0rd1' });
  check('login works', r.status === 200 && r.data.token);

  r = await call('POST', '/auth/login', { phone: '9000000000', password: 'Passw0rd1' });
  check('rejects unknown mobile number', r.status === 401);
  r = await call('POST', '/auth/register', { name: 'Bad Phone', phone: '1234567890', password: 'Passw0rd1' });
  check('rejects mobile number not starting with 6-9', r.status === 400);
  r = await call('POST', '/auth/register', { name: 'Bad Phone', phone: '98765', password: 'Passw0rd1' });
  check('rejects short mobile number', r.status === 400);
  r = await call('POST', '/auth/login', { email: 'alice@test.com', password: 'Passw0rd1' });
  check('email login no longer works', r.status === 401);

  // Authorization
  r = await call('GET', '/me');
  check('blocks requests without a token', r.status === 401);
  r = await call('GET', '/me', null, 'garbage');
  check('blocks forged tokens', r.status === 401);

  const me = (await call('GET', '/me', null, A)).data;
  const bob = (await call('GET', '/me', null, B)).data;
  check('opening balance is 1000.00 (100000 paise)', me.balance === 100000 && me.accountNumber.length === 12);

  // Deposits
  r = await call('POST', '/deposit', { amount: '-50' }, A);   check('rejects negative deposit', r.status === 400);
  r = await call('POST', '/deposit', { amount: '0' }, A);     check('rejects zero deposit', r.status === 400);
  r = await call('POST', '/deposit', { amount: '10.999' }, A);check('rejects 3-decimal amount', r.status === 400);
  r = await call('POST', '/deposit', { amount: 'abc' }, A);   check('rejects non-numeric amount', r.status === 400);
  r = await call('POST', '/deposit', { amount: '500.50' }, A);check('deposit 500.50 -> 1500.50', r.data.balance === 150050);

  // Withdrawals
  r = await call('POST', '/withdraw', { amount: '99999' }, A);check('rejects overdraft', r.status === 400);
  r = await call('POST', '/withdraw', { amount: '200' }, A);  check('withdraw 200 -> 1300.50', r.data.balance === 130050);

  // Transfers
  r = await call('POST', '/transfer', { toAccount: me.accountNumber, amount: '10' }, A); check('rejects self-transfer', r.status === 400);
  r = await call('POST', '/transfer', { toAccount: '000000000000', amount: '10' }, A);   check('rejects unknown recipient', r.status === 404);
  r = await call('POST', '/transfer', { toAccount: bob.accountNumber, amount: '5000' }, A); check('rejects transfer above balance', r.status === 400);
  r = await call('POST', '/transfer', { toAccount: bob.accountNumber, amount: '300.25', note: 'Books' }, A);
  check('transfer 300.25 -> sender 1000.25', r.data.balance === 100025);
  check('recipient received money', (await call('GET', '/me', null, B)).data.balance === 30025);

  // Failed transfers must leave balances unchanged
  check('failed transfers changed nothing', (await call('GET', '/me', null, A)).data.balance === 100025);

  // History + conservation of money
  const hist = (await call('GET', '/transactions', null, A)).data;
  check('history has 4 entries, newest first', hist.length === 4 && hist[0].type === 'transfer_out');
  check('history balance_after matches', hist[0].balance_after === 100025);
  check('type filter works', (await call('GET', '/transactions?type=deposit', null, A)).data.length === 2);
  check('users only see their own history', (await call('GET', '/transactions', null, B)).data.length === 1);

  // Profile
  r = await call('PUT', '/me', { name: 'A' }, A); check('rejects too-short name', r.status === 400);
  r = await call('PUT', '/me', { name: 'Alice Updated' }, A);
  check('profile update works', r.status === 200 && (await call('GET', '/me', null, A)).data.name === 'Alice Updated');
  r = await call('PUT', '/me/password', { currentPassword: 'nope', newPassword: 'NewPass123' }, A); check('password change needs current password', r.status === 400);
  r = await call('PUT', '/me/password', { currentPassword: 'Passw0rd1', newPassword: 'NewPass123' }, A);
  check('password change works', r.status === 200);
  check('new password logs in', (await call('POST', '/auth/login', { phone: '9876543210', password: 'NewPass123' })).status === 200);


  // Statement
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  r = await call('GET', '/statement?from=bad&to=' + today, null, A);               check('statement rejects bad dates', r.status === 400);
  r = await call('GET', '/statement?from=2999-01-02&to=2999-01-01', null, A);      check('statement rejects from > to', r.status === 400);
  r = await call('GET', '/statement?from=' + today + '&to=' + today + '&tz=0');    check('statement needs login', r.status === 401);
  r = await call('GET', '/statement?from=' + monthAgo + '&to=' + today + '&tz=0', null, A);
  check('statement lists all rows', r.status === 200 && r.data.rows.length === (await call('GET', '/transactions', null, A)).data.length);
  check('statement: opening + credits - debits = closing', r.data.openingBalance + r.data.totalIn - r.data.totalOut === r.data.closingBalance);
  r = await call('GET', '/statement?from=2000-01-01&to=2001-06-01&tz=0', null, A);
  check('periods over one year are rejected', r.status === 400);
  r = await call('GET', '/statement?from=2000-01-01&to=2000-01-31&tz=0', null, A);
  check('empty period gives zero rows and zero balance', r.data.rows.length === 0 && r.data.closingBalance === 0);

  // Concurrent withdrawals can never overdraw
  const results = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/withdraw', { amount: '300' }, A)));
  const final = (await call('GET', '/me', null, A)).data.balance;
  check('10 simultaneous withdrawals never overdraw (balance >= 0)', final >= 0 && results.filter(x => x.status === 200).length === 3);

  console.log(`\nAll ${passed} checks passed.`);
  server.close(); process.exit(0);
})().catch(e => { console.error('\n' + e.message); process.exit(1); });
