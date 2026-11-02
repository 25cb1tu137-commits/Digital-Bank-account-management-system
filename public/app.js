// app.js - all frontend logic. No frameworks: plain JavaScript and fetch().
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
let me = null; // logged-in user's info

// ---------- helpers ----------
// Escape user text before putting it in HTML (prevents XSS).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s) => new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const LABELS = { deposit: 'Deposit', withdrawal: 'Withdrawal', transfer_in: 'Transfer received', transfer_out: 'Transfer sent' };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), 3500);
}

// Talks to the backend. Adds the login token and throws a readable Error on failure.
async function api(method, url, body) {
  const token = sessionStorage.getItem('token');
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { logout(); throw new Error(data.error || 'Please log in again.'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// Wires up a form: collects values, calls onSubmit, shows errors, disables the button while working.
function handleForm(form, onSubmit) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.error', form), btn = $('button[type=submit]', form);
    err.textContent = ''; btn.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(form))); }
    catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });
}

// ---------- login / register ----------
function showAuth() {
  $('#app').hidden = true; $('#auth-screen').hidden = false;
}
async function startSession(token) {
  sessionStorage.setItem('token', token);
  $('#auth-screen').hidden = true; $('#app').hidden = false;
  await refreshMe();
  route();
}
function logout() {
  sessionStorage.removeItem('token'); me = null; location.hash = ''; showAuth();
}
async function refreshMe() {
  me = await api('GET', '/me');
  // Top bar: greeting on the left, account chip on the right
  $('.topbar').innerHTML = `<span id="greeting">Hello, ${esc(me.name.split(' ')[0])}</span>
    <span class="chip">Savings &middot; ...${esc(me.accountNumber.slice(-4))} &middot; ${money(me.balance)}</span>`;
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  $('#login-form').hidden = tab.dataset.tab !== 'login';
  $('#register-form').hidden = tab.dataset.tab !== 'register';
}));
handleForm($('#login-form'), async (v) => startSession((await api('POST', '/auth/login', v)).token));
handleForm($('#register-form'), async (v) => startSession((await api('POST', '/auth/register', v)).token));
$('#logout').addEventListener('click', logout);

// ---------- pages ----------
function txTable(rows) {
  if (!rows.length) return '<p class="empty">No transactions yet. Make a deposit to get started.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Type</th><th>Details</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead>
    <tbody>${rows.map((t) => {
      const credit = t.type === 'deposit' || t.type === 'transfer_in';
      const who = t.counterparty ? (t.type === 'transfer_in' ? 'From ' : 'To ') + t.counterparty : '';
      return `<tr><td>${fmtDate(t.created_at)}</td><td><span class="pill ${t.type}">${LABELS[t.type]}</span></td>
        <td class="note">${esc([who, t.note].filter(Boolean).join(' - '))}</td>
        <td class="num ${credit ? 'credit' : 'debit'}">${credit ? '+' : '-'}${money(t.amount)}</td>
        <td class="num">${money(t.balance_after)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

const ICONS = {
  send: '<path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/>',
  deposit: '<path d="M12 5v14"/><path d="m5 12 7 7 7-7"/>',
  withdraw: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  history: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const pages = {
  async overview() {
    const recent = await api('GET', '/transactions?limit=5');
    const quick = [['send', 'Send money', '#transfer'], ['deposit', 'Deposit', '#cash'], ['withdraw', 'Withdraw', '#cash'],
                   ['history', 'Statement', '#statement'], ['profile', 'Profile', '#profile']];
    view.innerHTML = `
      <section class="hero">
        <div>
          <div class="hero-sub">Savings account &middot; ${esc(me.accountNumber)}</div>
          <div class="hero-amount">${money(me.balance)}</div>
          <div class="hero-sub">Available balance</div>
        </div>
        <div class="hero-stats">
          <div><span>Money in this month</span><b class="in">${money(me.monthIn)}</b></div>
          <div><span>Money out this month</span><b class="out">${money(me.monthOut)}</b></div>
          <div><span>Transactions this month</span><b>${me.monthCount}</b></div>
        </div>
      </section>
      <nav class="quick" aria-label="Quick actions">
        ${quick.map(([i, label, href]) => `<a class="qcard" href="${href}"><span class="qicon">${icon(i)}</span>${label}</a>`).join('')}
      </nav>
      <section class="panel"><div class="row"><h3>Recent transactions</h3><a href="#history">View all</a></div>${txTable(recent)}</section>`;
  },

  cash() {
    view.innerHTML = `<h2>Deposit &amp; withdraw</h2>
      <p class="muted">Available balance: <b id="bal">${money(me.balance)}</b></p>
      <div class="grid2">${['deposit', 'withdraw'].map((k) => `
        <form class="panel form" id="${k}-form">
          <h3>${k === 'deposit' ? 'Deposit money' : 'Withdraw money'}</h3>
          <label>Amount in ₹ <input name="amount" inputmode="decimal" placeholder="0.00" required></label>
          <label>Note (optional) <input name="note" maxlength="100"></label>
          <p class="error" role="alert"></p>
          <button class="btn" type="submit">${k === 'deposit' ? 'Deposit' : 'Withdraw'}</button>
        </form>`).join('')}</div>`;
    for (const k of ['deposit', 'withdraw']) {
      const form = $('#' + k + '-form');
      handleForm(form, async (v) => {
        await api('POST', '/' + k, v);
        form.reset(); await refreshMe(); $('#bal').textContent = money(me.balance);
        toast(k === 'deposit' ? 'Deposit successful.' : 'Withdrawal successful.');
      });
    }
  },

  transfer() {
    view.innerHTML = `<h2>Transfer money</h2>
      <p class="muted">Available balance: <b id="bal">${money(me.balance)}</b></p>
      <form class="panel form narrow" id="transfer-form" >
        <label>Recipient account number <input name="toAccount" inputmode="numeric" maxlength="12" pattern="\\d{12}" placeholder="12 digits" required></label>
        <label>Amount in ₹ <input name="amount" inputmode="decimal" placeholder="0.00" required></label>
        <label>Note (optional) <input name="note" maxlength="100"></label>
        <p class="error" role="alert"></p>
        <button class="btn" type="submit">Send money</button>
      </form>`;
    const form = $('#transfer-form');
    handleForm(form, async (v) => {
      await api('POST', '/transfer', v);
      form.reset(); await refreshMe(); $('#bal').textContent = money(me.balance);
      toast('Transfer successful.');
    });
  },

  async history() {
    view.innerHTML = `<h2>Transactions</h2><section class="panel">
      <div class="row"><label>Show <select id="filter">
        <option value="">All transactions</option><option value="deposit">Deposits</option><option value="withdrawal">Withdrawals</option>
        <option value="transfer_in">Transfers received</option><option value="transfer_out">Transfers sent</option></select></label></div>
      <div id="tx"></div></section>`;
    const load = async () => { $('#tx').innerHTML = txTable(await api('GET', '/transactions?limit=200&type=' + $('#filter').value)); };
    $('#filter').addEventListener('change', load);
    await load();
  },

  async statement() {
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const start = new Date(); start.setDate(start.getDate() - 30);
    view.innerHTML = `<h2>Account statement</h2>
      <form class="panel form no-print st-controls" id="st-form">
        <label>From <input type="date" name="from" value="${ymd(start)}" required></label>
        <label>To <input type="date" name="to" value="${ymd(new Date())}" required></label>
        <button class="btn" type="submit">Show statement</button>
        <p class="error" role="alert"></p>
      </form>
      <div class="no-print st-actions">
        <button class="btn secondary" id="st-csv" type="button" disabled>Download CSV</button>
        <button class="btn secondary" id="st-print" type="button" disabled>Print / Save as PDF</button>
      </div>
      <section class="panel statement-sheet" id="st-sheet" hidden></section>`;
    let data = null;

    const draw = () => {
      const credit = (t) => t.type === 'deposit' || t.type === 'transfer_in';
      const sheet = $('#st-sheet'); sheet.hidden = false;
      sheet.innerHTML = `
        <div class="st-head"><div><div class="st-bank">CampusTrust Bank</div><div class="muted">Account statement</div></div>
          <div class="muted">Generated on ${new Date().toLocaleString('en-IN')}</div></div>
        <dl>
          <dt>Account holder</dt><dd>${esc(data.holder)}</dd>
          <dt>Account number</dt><dd class="acct">${esc(data.accountNumber)}</dd>
          <dt>Mobile number</dt><dd>${esc(data.phone)}</dd>
          <dt>Period</dt><dd>${esc(data.from)} to ${esc(data.to)}</dd></dl>
        <div class="st-summary">
          <div><span>Opening balance</span><b>${money(data.openingBalance)}</b></div>
          <div><span>Total credits</span><b class="credit">${money(data.totalIn)}</b></div>
          <div><span>Total debits</span><b class="debit">${money(data.totalOut)}</b></div>
          <div><span>Closing balance</span><b>${money(data.closingBalance)}</b></div></div>
        ${data.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Details</th>
          <th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>
          ${data.rows.map((t) => `<tr><td>${fmtDate(t.created_at)}</td><td>${LABELS[t.type]}</td>
            <td class="note">${esc([t.counterparty ? (t.type === 'transfer_in' ? 'From ' : 'To ') + t.counterparty : '', t.note].filter(Boolean).join(' - '))}</td>
            <td class="num debit">${credit(t) ? '' : money(t.amount)}</td><td class="num credit">${credit(t) ? money(t.amount) : ''}</td>
            <td class="num">${money(t.balance_after)}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="empty">No transactions in this period.</p>'}
        
      $('#st-csv').disabled = $('#st-print').disabled = false;
    };

    handleForm($('#st-form'), async (v) => {
      data = await api('GET', `/statement?from=${v.from}&to=${v.to}&tz=${-new Date().getTimezoneOffset()}`);
      draw();
    });

    // CSV: quote cells that need it, and defuse spreadsheet formulas (=, +, -, @) in user-typed text.
    const cell = (x) => { let s = String(x ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rupees = (p) => (p / 100).toFixed(2);
    const stamp = (s) => { const d = new Date(s.replace(' ', 'T') + 'Z'), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
    $('#st-csv').addEventListener('click', () => {
      const credit = (t) => t.type === 'deposit' || t.type === 'transfer_in';
      const lines = [['Date', 'Type', 'Details', 'Debit (INR)', 'Credit (INR)', 'Balance (INR)'].join(',')];
      for (const t of data.rows) {
        const who = t.counterparty ? (t.type === 'transfer_in' ? 'From ' : 'To ') + t.counterparty : '';
        lines.push([stamp(t.created_at), LABELS[t.type], cell([who, t.note].filter(Boolean).join(' - ')),
          credit(t) ? '' : rupees(t.amount), credit(t) ? rupees(t.amount) : '', rupees(t.balance_after)].join(','));
      }
      // The leading \uFEFF makes Excel open the file with the right encoding.
      const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `statement_${data.accountNumber.slice(-4)}_${data.from}_to_${data.to}.csv`;
      document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    });
    $('#st-print').addEventListener('click', () => {
      const old = document.title; document.title = `Statement ${data.from} to ${data.to}`; // becomes the default PDF file name
      window.print(); document.title = old;
    });
    $('#st-form').requestSubmit(); // show the default period straight away
  },

  async profile() {
    await refreshMe();
    view.innerHTML = `<h2>Profile</h2>
      <section class="panel"><h3>Account details</h3><dl>
        <dt>Account number</dt><dd class="acct">${esc(me.accountNumber)}</dd>
        <dt>Mobile number</dt><dd>${esc(me.phone)}</dd>
        <dt>Member since</dt><dd>${esc(fmtDate(me.created_at))}</dd></dl></section>
      <div class="grid2">
        <form class="panel form" id="profile-form"><h3>Personal information</h3>
          <label>Full name <input name="name" value="${esc(me.name)}" required minlength="2" maxlength="60"></label>
          <p class="error" role="alert"></p><button class="btn" type="submit">Save changes</button></form>
        <form class="panel form" id="password-form"><h3>Change password</h3>
          <label>Current password <input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <label>New password <input name="newPassword" type="password" autocomplete="new-password" minlength="8" required></label>
          <p class="error" role="alert"></p><button class="btn" type="submit">Update password</button></form>
      </div>`;
    handleForm($('#profile-form'), async (v) => { await api('PUT', '/me', v); await refreshMe(); toast('Profile saved.'); });
    handleForm($('#password-form'), async (v) => { await api('PUT', '/me/password', v); $('#password-form').reset(); toast('Password updated.'); });
  },
};

async function route() {
  if (!me) return;
  const name = location.hash.slice(1);
  const page = pages[name] ? name : 'overview';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + page));
  try { await pages[page](); } catch (e) { view.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', route);

// ---------- start ----------
if (sessionStorage.getItem('token')) {
  $('#auth-screen').hidden = true; $('#app').hidden = false;
  refreshMe().then(route).catch(showAuth);
} else showAuth();
