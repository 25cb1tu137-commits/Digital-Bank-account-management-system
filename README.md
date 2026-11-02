# CampusTrust Bank - Digital Bank Account & Transaction System

A full-stack college micro-project. Demo only: all names, accounts and money are fictional.

**Stack:** HTML/CSS/JavaScript frontend, Node.js + Express backend, SQLite database (Node's built-in `node:sqlite`, nothing to compile).
The Express server also serves the frontend, so there is **one app to run and one to deploy**.

## Why SQLite instead of MongoDB?
Bank transfers need real database transactions (debit and credit succeed together or not at all).
SQLite gives you that with zero setup: no database server, no accounts, no connection strings.
It also let me run and test everything end to end. The code is plain SQL, which is also good exam material.

## Features
Registration and login with **mobile number + password** (bcrypt password hashing, JWT tokens), account auto-created with a 12-digit number,
balance, deposits, withdrawals, transfers by account number, filterable transaction history,
bank statements for any date range (download as CSV, or Print / Save as PDF), profile editing, password change, and validation on both frontend and backend.

## Folder structure
```
digital-bank/
├── server.js          starts Express, security middleware, serves the frontend
├── db.js              opens SQLite and creates the 3 tables
├── helpers.js         money conversion + post(): the one function that changes balances
├── auth.js            middleware that blocks requests without a valid token
├── routes/auth.js     POST /api/auth/register, /login (mobile number + password)
├── routes/bank.js     /api/me, /deposit, /withdraw, /transfer, /transactions, /statement
├── seed.js            demo data
├── test.js            automated checks (npm test)
├── public/            index.html, style.css, app.js (the frontend)
├── api/index.js       Vercel entry point (runs the Express app as a serverless function)
├── vercel.json        Vercel routing config
├── .env.example       environment variable template
└── render.yaml        Render deployment config
```

## Run it locally
1. Install **Node.js 22.13 or newer (the LTS version)** from nodejs.org (check with `node -v`; it must show v22.13 or higher).
2. Open a terminal in the project folder and run:
   ```
   npm install
   cp .env.example .env      # Windows: copy .env.example .env
   ```
3. Open `.env` and set `JWT_SECRET` to a long random string. Generate one with:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Start: `npm start`, then open **http://localhost:3000**

**Demo logins** (password for all: `Demo@1234`), log in with the mobile number: `9876500001` (Aarav), `9876500002` (Priya), `9876500003` (Rohan).
To transfer money, copy another user's account number from their Profile page.
To reset the data, stop the server, delete `data/bank.db`, and start again.
(Upgrading from the old email version? Delete `data/bank.db` once, because the users table now uses the mobile number as the login ID.)


## Environment variables
| Name | Meaning |
|---|---|
| `PORT` | Port to listen on (hosts set this automatically) |
| `JWT_SECRET` | Secret used to sign login tokens. Required, 16+ characters, never commit it |
| `DB_PATH` | Location of the SQLite file (default `./data/bank.db`) |
| `SEED_DEMO` | `true` adds demo users when the database is empty |

## How balances stay correct
- Money is stored as whole **paise** (integers), never decimals, so there are no rounding errors.
- `post()` in `helpers.js` updates the balance and writes the transaction row together, and
  `UPDATE ... WHERE balance + amount >= 0` makes an overdraft impossible. The table also has `CHECK (balance >= 0)`.
- A transfer runs inside one `db.transaction()`: debit, credit and both history rows commit together or roll back together.
- `balance_after` is stored on every transaction, so the history always matches the balance.

## Testing
`npm test` starts the app on a temporary database and runs automated checks: validation, duplicate mobile numbers,
wrong passwords, forged tokens, negative/zero/3-decimal amounts, overdrafts, self-transfers, unknown recipients,
transfer accuracy, history isolation between users, profile/password changes, and 10 simultaneous withdrawals.

## Deploy to Vercel (free, about 5 minutes)
1. Push this folder to a GitHub repository (`.gitignore` already excludes `node_modules` and `.env`):
   ```
   git init && git add . && git commit -m "Bank app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/digital-bank.git
   git push -u origin main
   ```
2. On vercel.com choose **Add New > Project**, import the repo, and click **Deploy**. Leave every setting as it is.
   No build command or output directory is needed: `public/` is served as the website and `api/index.js` runs the backend.
3. Optional but recommended: in **Settings > Environment Variables** add `JWT_SECRET` (a long random string). Without it the app uses a built-in demo secret.

**Important about data on Vercel:** Vercel has no permanent disk. The SQLite file lives in `/tmp`, so it is created fresh
(with the demo users) whenever a serverless instance starts, and accounts you register can disappear after a while or be
missing on another instance. That is fine for showing the project. For permanent data on Vercel, move the database
to a hosted one (for example Turso or Postgres); only `db.js`, `helpers.js` and the routes would need to change.

## Deploy to Render (free, one service, about 10 minutes)
1. Create a GitHub account, make a new repository, and push this project (the `.gitignore` already excludes `node_modules` and `.env`):
   ```
   git init && git add . && git commit -m "Bank app"
   git remote add origin https://github.com/YOUR-USER/digital-bank.git
   git push -u origin main
   ```
2. Sign up at render.com with GitHub. Click **New > Blueprint**, pick your repo, and approve. Render reads `render.yaml`.
   (Manual alternative: **New > Web Service**, Build `npm install`, Start `npm start`, and add the variables above, with `JWT_SECRET` set to a random value.)
3. Wait for the build, then open the `https://...onrender.com` URL. The frontend, API and database are all in this one service.

**Important about data on the free plan:** Render's free tier has no permanent disk, so the SQLite file resets
when the service restarts or redeploys, and `SEED_DEMO=true` reloads the demo users. That is fine for a college demo.
Free services also sleep after idle time, so the first load can take about 30 seconds.
For permanent data, use a paid plan, add a Disk mounted at `/var/data`, and set `DB_PATH=/var/data/bank.db`
(Railway volumes work the same way). If your teacher requires MongoDB specifically, only `db.js`, `helpers.js` and the routes need rewriting.

## Security notes (good viva answers)
Passwords hashed with bcrypt; tokens expire after 2 hours; helmet adds security headers; login/register are rate-limited;
every query uses `?` placeholders (no SQL injection); user text is HTML-escaped on screen (no XSS);
each user can only reach their own account because the account is looked up from the token, never from the request.
Tokens are kept in `sessionStorage` for simplicity; a production bank would use HTTPS-only cookies.
