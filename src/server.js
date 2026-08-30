'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');
const { PLANS, PLAN_NAMES, RECIPES, PREP, DAYS, SHOP_ORDER, FOODS, round } = require('./plan');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || '/data/nutrition.db';
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_DAYS = 60;

if (!SESSION_SECRET || SESSION_SECRET.length < 24) {
  console.error('SESSION_SECRET is missing or too short. Set a value of at least 24 characters.');
  process.exit(1);
}

/* ------------------------------------------------------------------ db */

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  plan_key     TEXT NOT NULL,
  pw_hash      TEXT NOT NULL,
  pw_salt      TEXT NOT NULL,
  start_weight REAL,
  goal_weight  REAL,
  height_cm    REAL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meal_log (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  PRIMARY KEY (user_id, date, meal_id)
);
CREATE TABLE IF NOT EXISTS weights (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  kg      REAL NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS waist (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  cm      REAL NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS extras (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  label   TEXT NOT NULL,
  kcal    INTEGER NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS extras_user_date ON extras (user_id, date);
`);

/* ---------------------------------------------------------------- auth */

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

function createUser({ username, password, displayName, planKey, startWeight, goalWeight, heightCm }) {
  const salt = crypto.randomBytes(16).toString('hex');
  return db.prepare(
    `INSERT INTO users (username, display_name, plan_key, pw_hash, pw_salt, start_weight, goal_weight, height_cm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(username.toLowerCase(), displayName, planKey, hash(password, salt), salt,
        startWeight, goalWeight, heightCm);
}

function verify(username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').toLowerCase());
  if (!u) return null;
  const attempt = Buffer.from(hash(password, u.pw_salt), 'hex');
  const stored = Buffer.from(u.pw_hash, 'hex');
  if (attempt.length !== stored.length) return null;
  return crypto.timingSafeEqual(attempt, stored) ? u : null;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unsign(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

/* --------------------------------------------------------------- seed */

function seed() {
  const spec = process.env.SEED_USERS;
  if (!spec) {
    if (db.prepare('SELECT COUNT(*) n FROM users').get().n === 0)
      console.warn('No users exist and SEED_USERS is not set. Nobody can log in yet.');
    return;
  }
  // format: username:password:Display Name:PLAN:startKg:goalKg:heightCm , comma separated
  // Existing usernames are left untouched — this only adds ones that are missing,
  // so a new entry can be appended later without disturbing logged-in accounts.
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?');
  for (const row of spec.split(',').map(s => s.trim()).filter(Boolean)) {
    const [username, password, displayName, planKey, sw, gw, h] = row.split(':');
    if (exists.get(username.toLowerCase())) continue;
    if (!PLANS[planKey]) { console.error('Bad plan key in SEED_USERS:', planKey); continue; }
    createUser({
      username, password, displayName, planKey,
      startWeight: Number(sw) || null, goalWeight: Number(gw) || null, heightCm: Number(h) || null
    });
    console.log('Seeded user:', username, '→', planKey);
  }
}
seed();

/* ---------------------------------------------------------------- app */

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  const raw = (req.headers.cookie || '')
    .split(';').map(s => s.trim()).find(s => s.startsWith('sid='));
  const session = raw ? unsign(decodeURIComponent(raw.slice(4))) : null;
  req.user = session ? db.prepare('SELECT * FROM users WHERE id = ?').get(session.uid) : null;
  next();
});

const requireUser = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Not signed in' });

const publicUser = u => ({
  id: u.id, username: u.username, displayName: u.display_name, planKey: u.plan_key,
  startWeight: u.start_weight, goalWeight: u.goal_weight, heightCm: u.height_cm
});

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const dayKey = date => DAYS[(new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7];

/* --------------------------------------------------------------- auth */

app.post('/api/login', (req, res) => {
  const u = verify(req.body.username, req.body.password);
  if (!u) return res.status(401).json({ error: 'Wrong username or password' });
  const token = sign({ uid: u.id, exp: Date.now() + SESSION_DAYS * 864e5 });
  res.cookie('sid', token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE !== 'false',
    maxAge: SESSION_DAYS * 864e5, path: '/'
  });
  res.json({ user: publicUser(u) });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({
    user: publicUser(req.user),
    plan: summarisePlan(PLANS[req.user.plan_key]),
    planNames: PLAN_NAMES,
    planTargets: {
      A: { kcal: PLANS.A.targetKcal, protein: PLANS.A.targetProtein },
      B: { kcal: PLANS.B.targetKcal, protein: PLANS.B.targetProtein }
    }
  });
});

function summarisePlan(plan) {
  const week = {};
  for (const d of DAYS) {
    const meals = plan.week[d];
    week[d] = {
      meals: meals.map(m => ({ id: m.id, time: m.time, title: m.title, kcal: m.kcal, protein: m.protein, note: m.note, estimate: !!m.estimate, plan: m.plan })),
      kcal: meals.reduce((a, m) => a + m.kcal, 0),
      protein: round(meals.reduce((a, m) => a + m.protein, 0), 1)
    };
  }
  return {
    key: plan.key, label: plan.label, targetKcal: plan.targetKcal,
    targetProtein: plan.targetProtein, window: plan.window, windowNote: plan.windowNote, week
  };
}

/* ---------------------------------------------------------------- day */

/* The shared Kitchen login is a terminal onto the two real accounts,
   not a third ledger. A tick there is written to whoever owns that
   plan, so the tablet and that person's own phone read the same log. */
const ownerOf = planKey =>
  db.prepare('SELECT id FROM users WHERE plan_key = ? ORDER BY id LIMIT 1').get(planKey);

function writeTarget(user, planKey) {
  if (user.plan_key !== 'KITCHEN' || !PLANS[planKey] || planKey === 'KITCHEN') return user.id;
  const owner = ownerOf(planKey);
  return owner ? owner.id : user.id;
}

/* Rows the caller may delete: their own, plus both people's when the
   caller is the Kitchen terminal. */
function reachableUserIds(user) {
  if (user.plan_key !== 'KITCHEN') return [user.id];
  const ids = db.prepare("SELECT id FROM users WHERE plan_key IN ('A', 'B')").all().map(r => r.id);
  return ids.concat(user.id);
}

function dayFor(userId, plan, planKey, date) {
  const meals = plan.week[dayKey(date)];
  const ticked = new Set(
    db.prepare('SELECT meal_id FROM meal_log WHERE user_id = ? AND date = ?')
      .all(userId, date).map(r => r.meal_id)
  );
  const extras = db.prepare('SELECT id, label, kcal, protein FROM extras WHERE user_id = ? AND date = ? ORDER BY id')
    .all(userId, date);
  const weight = db.prepare('SELECT kg FROM weights WHERE user_id = ? AND date = ?').get(userId, date);
  const w = db.prepare('SELECT cm FROM waist WHERE user_id = ? AND date = ?').get(userId, date);

  const list = meals.map(m => ({
    id: m.id, time: m.time, title: m.title, kcal: m.kcal, protein: m.protein,
    note: m.note, estimate: !!m.estimate, done: ticked.has(m.id), plan: m.plan,
    ing: m.ing.map(i => ({ label: i.label, qty: i.qty, unit: i.unit }))
  }));

  const eatenK = list.filter(m => m.done).reduce((a, m) => a + m.kcal, 0)
    + extras.reduce((a, e) => a + e.kcal, 0);
  const eatenP = list.filter(m => m.done).reduce((a, m) => a + m.protein, 0)
    + extras.reduce((a, e) => a + e.protein, 0);

  return {
    plan: planKey, name: plan.label, meals: list, extras,
    weight: weight ? weight.kg : null, waist: w ? w.cm : null,
    targetKcal: plan.targetKcal, targetProtein: plan.targetProtein,
    plannedKcal: list.reduce((a, m) => a + m.kcal, 0),
    plannedProtein: round(list.reduce((a, m) => a + m.protein, 0), 1),
    eatenKcal: eatenK, eatenProtein: round(eatenP, 1),
    window: plan.window
  };
}

app.get('/api/day/:date', requireUser, (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });

  if (req.user.plan_key === 'KITCHEN') {
    return res.json({
      date, dayKey: dayKey(date), kitchen: true,
      columns: ['A', 'B'].map(k => {
        const owner = ownerOf(k);
        return { ...dayFor(owner ? owner.id : req.user.id, PLANS[k], k, date), linked: !!owner };
      })
    });
  }

  res.json({
    date, dayKey: dayKey(date),
    ...dayFor(req.user.id, PLANS[req.user.plan_key], req.user.plan_key, date)
  });
});

app.post('/api/day/:date/meal', requireUser, (req, res) => {
  const { date } = req.params;
  const { mealId, done } = req.body;
  if (!isDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  const plan = PLANS[req.user.plan_key];
  const meal = plan.week[dayKey(date)].find(m => m.id === mealId);
  if (!meal)
    return res.status(400).json({ error: 'That meal is not on the plan for this day' });
  const uid = writeTarget(req.user, meal.plan);
  if (done) {
    db.prepare('INSERT OR IGNORE INTO meal_log (user_id, date, meal_id) VALUES (?, ?, ?)')
      .run(uid, date, mealId);
  } else {
    db.prepare('DELETE FROM meal_log WHERE user_id = ? AND date = ? AND meal_id = ?')
      .run(uid, date, mealId);
  }
  res.json({ ok: true });
});

app.post('/api/day/:date/weight', requireUser, (req, res) => {
  const kg = Number(req.body.kg);
  if (!isDate(req.params.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  if (!(kg > 20 && kg < 400)) return res.status(400).json({ error: 'Weight must be between 20 and 400 kg' });
  db.prepare('INSERT INTO weights (user_id, date, kg) VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET kg = excluded.kg')
    .run(req.user.id, req.params.date, kg);
  res.json({ ok: true });
});

app.post('/api/day/:date/waist', requireUser, (req, res) => {
  const cm = Number(req.body.cm);
  if (!isDate(req.params.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  if (!(cm > 30 && cm < 250)) return res.status(400).json({ error: 'Waist must be between 30 and 250 cm' });
  db.prepare('INSERT INTO waist (user_id, date, cm) VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET cm = excluded.cm')
    .run(req.user.id, req.params.date, cm);
  res.json({ ok: true });
});

app.post('/api/day/:date/extra', requireUser, (req, res) => {
  const label = String(req.body.label || '').trim().slice(0, 80);
  const kcal = Math.max(0, Math.min(5000, Math.round(Number(req.body.kcal) || 0)));
  const protein = Math.max(0, Math.min(400, Number(req.body.protein) || 0));
  if (!isDate(req.params.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  if (!label) return res.status(400).json({ error: 'Give the entry a name' });
  const uid = writeTarget(req.user, req.body.plan);
  const r = db.prepare('INSERT INTO extras (user_id, date, label, kcal, protein) VALUES (?, ?, ?, ?, ?)')
    .run(uid, req.params.date, label, kcal, protein);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/extra/:id', requireUser, (req, res) => {
  const ids = reachableUserIds(req.user);
  db.prepare(`DELETE FROM extras WHERE id = ? AND user_id IN (${ids.map(() => '?').join(',')})`)
    .run(req.params.id, ...ids);
  res.json({ ok: true });
});

/* ----------------------------------------------------------- progress */

app.get('/api/progress', requireUser, (req, res) => {
  const weights = db.prepare('SELECT date, kg FROM weights WHERE user_id = ? ORDER BY date').all(req.user.id);
  const waist = db.prepare('SELECT date, cm FROM waist WHERE user_id = ? ORDER BY date').all(req.user.id);

  // seven-day rolling average — the only weight number worth reading
  const avg = weights.map((_, i) => {
    const win = weights.slice(Math.max(0, i - 6), i + 1);
    return { date: weights[i].date, kg: round(win.reduce((a, w) => a + w.kg, 0) / win.length, 2) };
  });

  const since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const logged = db.prepare('SELECT date, COUNT(*) n FROM meal_log WHERE user_id = ? AND date >= ? GROUP BY date ORDER BY date')
    .all(req.user.id, since);
  const plan = PLANS[req.user.plan_key];
  const adherence = logged.map(r => ({
    date: r.date,
    pct: Math.round(100 * r.n / plan.week[dayKey(r.date)].length)
  }));

  const first = avg[0], last = avg[avg.length - 1];
  res.json({
    weights, avg, waist, adherence,
    targetKcal: plan.targetKcal,
    goalWeight: req.user.goal_weight,
    startWeight: req.user.start_weight,
    change: first && last ? round(last.kg - first.kg, 2) : null,
    weeklyRate: ratePerWeek(avg)
  });
});

function ratePerWeek(avg) {
  if (avg.length < 8) return null;
  const recent = avg.slice(-21);
  const first = recent[0], last = recent[recent.length - 1];
  const days = (new Date(last.date) - new Date(first.date)) / 864e5;
  if (days < 7) return null;
  return round((last.kg - first.kg) / days * 7, 2);
}

/* ------------------------------------------------------- shopping list */

app.post('/api/shopping', requireUser, (req, res) => {
  const days = Array.isArray(req.body.days) && req.body.days.length ? req.body.days : DAYS;
  const planKeys = Array.isArray(req.body.plans) && req.body.plans.length
    ? req.body.plans.filter(k => PLANS[k]) : [req.user.plan_key];

  const totals = new Map();
  for (const key of planKeys) {
    for (const d of days) {
      if (!DAYS.includes(d)) continue;
      for (const m of PLANS[key].week[d]) {
        for (const i of m.ing) {
          const id = i.key;
          const cur = totals.get(id) || { label: i.label, unit: i.unit, shop: i.shop, qty: 0 };
          cur.qty += i.qty;
          totals.set(id, cur);
        }
      }
    }
  }

  const groups = SHOP_ORDER.map(name => ({
    name,
    items: [...totals.values()]
      .filter(i => i.shop === name)
      .map(i => ({ ...i, qty: prettyQty(i.qty, i.unit), raw: round(i.qty, 1) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  })).filter(g => g.items.length);

  res.json({ days, plans: planKeys, groups });
});

function prettyQty(qty, unit) {
  if (unit === 'g' && qty >= 1000) return round(qty / 1000, 2) + ' kg';
  if (unit === 'ml' && qty >= 1000) return round(qty / 1000, 2) + ' L';
  if (unit === 'pc') return Math.ceil(qty) + '';
  return round(qty, 0) + ' ' + unit;
}

/* -------------------------------------------------------- static data */

app.get('/api/recipes', requireUser, (_req, res) => res.json({ recipes: RECIPES }));
app.get('/api/prep', requireUser, (_req, res) => res.json(PREP));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* ------------------------------------------------------------- static */

app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1h',
  setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('manifest.webmanifest')) res.setHeader('Cache-Control', 'no-cache'); }
}));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Nutrition tracker listening on ${PORT}`));
