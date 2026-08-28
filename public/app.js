'use strict';

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { user: null, plan: null, date: today(), view: 'today', day: null, shop: { days: [], plans: [] }, got: new Set() };

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function shiftDate(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function prettyDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (iso === today()) return 'Today';
  if (iso === shiftDate(today(), -1)) return 'Yesterday';
  if (iso === shiftDate(today(), 1)) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch {
    throw new Error('No connection. The plan and recipes work offline; logging needs a signal.');
  }
  if (res.status === 401) { showSignin(); throw new Error('Not signed in'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1900);
}

/* ------------------------------------------------------------- sign in */

function showSignin() {
  $('#signin').hidden = false;
  $('#app').hidden = true;
}

async function signIn() {
  const username = $('#lg-user').value.trim();
  const password = $('#lg-pass').value;
  const err = $('#lg-err');
  err.hidden = true;
  if (!username || !password) { err.textContent = 'Enter both fields to continue.'; err.hidden = false; return; }
  try {
    await api('/login', { body: { username, password } });
    $('#lg-pass').value = '';
    await boot();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
}

/* ---------------------------------------------------------------- boot */

async function boot() {
  const me = await api('/me');
  if (!me.user) { showSignin(); return; }
  state.user = me.user;
  state.plan = me.plan;
  state.shop.plans = [me.user.planKey];
  $('#signin').hidden = true;
  $('#app').hidden = false;
  $('#top-eyebrow').textContent = `${me.user.displayName} · ${me.plan.label}`;
  render();
}

/* -------------------------------------------------------------- ledger */

function calorieGauge(eatenK, targetK) {
  const N = 32;
  const W = 260, H = 154, cx = 130, cy = 142, rOuter = 122, rInner = 86;
  const pct = Math.max(0, Math.min(1, targetK > 0 ? eatenK / targetK : 0));
  const filled = Math.round(pct * N);
  let s = `<svg class="gauge" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories eaten today">`;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const deg = 180 - t * 180;
    const a = (deg * Math.PI) / 180;
    const x1 = cx + rInner * Math.cos(a), y1 = cy - rInner * Math.sin(a);
    const x2 = cx + rOuter * Math.cos(a), y2 = cy - rOuter * Math.sin(a);
    s += `<line class="seg${i < filled ? ' seg--full' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return s + '</svg>';
}

function renderLedger(eatenK, targetK, eatenP, targetP) {
  const over = eatenK > targetK * 1.05;
  const remaining = Math.round(targetK - eatenK);
  $('#ledger').innerHTML = `
    <div class="gauge-wrap">
      ${calorieGauge(eatenK, targetK)}
      <div class="gauge-center">
        <div class="g-date">${prettyDate(state.date)}</div>
        <b>${Math.round(eatenK)}<span style="font-size:.5em;font-weight:700;color:var(--ink-soft)"> kcal</span></b>
        <div class="g-goal">Goal ${Math.round(targetK)} kcal</div>
      </div>
    </div>
    <div class="ministat-row">
      <div class="ministat${over ? ' is-over' : ''}"><b>${remaining >= 0 ? remaining : '+' + Math.abs(remaining)}</b><span>${remaining >= 0 ? 'kcal left' : 'kcal over'}</span></div>
      <div class="ministat"><b>${Math.round(eatenP)}<span style="font-size:.75em"> / ${Math.round(targetP)}g</span></b><span>Protein</span></div>
    </div>`;
}

/* ---------------------------------------------------------------- views */

async function render() {
  document.querySelectorAll('.tab').forEach(t =>
    t.setAttribute('aria-selected', String(t.dataset.view === state.view)));
  const v = $('#view');
  v.innerHTML = '<p class="empty">Loading…</p>';
  try {
    if (state.view === 'today') await viewToday(v);
    else if (state.view === 'week') await viewWeek(v);
    else if (state.view === 'recipes') await viewRecipes(v);
    else if (state.view === 'shop') await viewShop(v);
    else if (state.view === 'progress') await viewProgress(v);
  } catch (e) {
    v.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

/* ---- Today ---- */

async function viewToday(v) {
  const d = await api('/day/' + state.date);
  state.day = d;
  renderLedger(d.eatenKcal, d.targetKcal, d.eatenProtein, d.targetProtein);

  v.innerHTML = '';

  const bar = el('div', 'datebar');
  const prev = el('button', 'arrow', '‹'); prev.setAttribute('aria-label', 'Previous day');
  const next = el('button', 'arrow', '›'); next.setAttribute('aria-label', 'Next day');
  next.disabled = state.date >= today();
  const mid = el('div');
  mid.append(el('h2', null, prettyDate(state.date)));
  mid.append(el('p', 'muted', `Eating window ${d.window} · plan totals ${d.plannedKcal} kcal, ${Math.round(d.plannedProtein)} g protein`));
  prev.onclick = () => { state.date = shiftDate(state.date, -1); render(); };
  next.onclick = () => { state.date = shiftDate(state.date, 1); render(); };
  bar.append(prev, mid, next);
  v.append(bar);

  const card = el('div', 'card');
  d.meals.forEach(m => card.append(mealRow(m)));
  v.append(card);

  /* extras */
  const ex = el('div', 'card');
  ex.append(el('h3', null, 'Anything else'));
  ex.append(el('p', 'tiny', 'Off-plan food, a flexible meal, a coffee with milk. It counts the same.'));
  d.extras.forEach(e => {
    const row = el('div', 'extra');
    row.append(el('span', null, e.label));
    const right = el('span');
    right.append(el('b', null, `${e.kcal} kcal · ${e.protein} g`));
    const x = el('button', 'extra__x', '×');
    x.setAttribute('aria-label', 'Remove ' + e.label);
    x.onclick = async () => { await api('/extra/' + e.id, { method: 'DELETE' }); render(); };
    right.append(' ', x);
    row.append(right);
    ex.append(row);
  });
  const form = el('div', 'row3');
  const l = el('input', 'num'); l.placeholder = 'What was it?';
  const k = el('input', 'num'); k.type = 'number'; k.inputMode = 'numeric'; k.placeholder = 'kcal';
  const p = el('input', 'num'); p.type = 'number'; p.inputMode = 'decimal'; p.placeholder = 'protein';
  const add = el('button', 'btn btn--ghost btn--sm', 'Add');
  add.onclick = async () => {
    if (!l.value.trim()) { toast('Give the entry a name'); return; }
    await api(`/day/${state.date}/extra`, { body: { label: l.value, kcal: k.value, protein: p.value } });
    render();
  };
  form.append(l, k, p, add);
  ex.append(form);
  v.append(ex);

  /* measurements */
  const meas = el('div', 'card');
  meas.append(el('h3', null, 'Measurements'));
  meas.append(el('p', 'tiny', 'Weigh first thing, after the bathroom, before eating. The daily number is noise — the app reads the seven-day average for you.'));

  const wRow = el('div', 'row2');
  const wLab = el('label', 'field');
  wLab.append(el('span', null, 'Weight, kg'));
  const wIn = el('input', 'num'); wIn.type = 'number'; wIn.step = '0.1'; wIn.inputMode = 'decimal';
  if (d.weight != null) wIn.value = d.weight;
  wLab.append(wIn);
  const wBtn = el('button', 'btn btn--ghost btn--sm', 'Save');
  wBtn.onclick = async () => {
    try { await api(`/day/${state.date}/weight`, { body: { kg: wIn.value } }); toast('Weight saved'); }
    catch (e) { toast(e.message); }
  };
  wRow.append(wLab, wBtn);

  const cRow = el('div', 'row2');
  const cLab = el('label', 'field');
  cLab.append(el('span', null, 'Waist, cm — monthly is enough'));
  const cIn = el('input', 'num'); cIn.type = 'number'; cIn.step = '0.5'; cIn.inputMode = 'decimal';
  if (d.waist != null) cIn.value = d.waist;
  cLab.append(cIn);
  const cBtn = el('button', 'btn btn--ghost btn--sm', 'Save');
  cBtn.onclick = async () => {
    try { await api(`/day/${state.date}/waist`, { body: { cm: cIn.value } }); toast('Waist saved'); }
    catch (e) { toast(e.message); }
  };
  cRow.append(cLab, cBtn);

  meas.append(wRow, cRow);
  v.append(meas);
}

const MEAL_PALETTE = ['#FCE4D6', '#E4EEE0', '#E1EBF5', '#F3E4F2', '#FBEFD2'];
function mealStyle(m) {
  const h = (m.time || m.title || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hour = parseInt((m.time || '12:00').split(':')[0], 10);
  let icon = '🍽️';
  if (/snack/i.test(m.title || '')) icon = '🥤';
  else if (hour < 11) icon = '🍳';
  else if (hour < 16) icon = '🥗';
  else icon = '🍲';
  return { bg: MEAL_PALETTE[h % MEAL_PALETTE.length], icon };
}

function mealRow(m) {
  const row = el('div', 'meal' + (m.done ? ' is-done' : ''));
  const { bg, icon } = mealStyle(m);
  const avatar = el('div', 'meal-avatar');
  avatar.style.background = bg;
  avatar.append(document.createTextNode(icon));

  const tick = el('button', 'badge-tick', '✓');
  tick.setAttribute('aria-pressed', String(m.done));
  tick.setAttribute('aria-label', (m.done ? 'Mark not eaten: ' : 'Mark eaten: ') + m.title);
  tick.onclick = async () => {
    const nowDone = !m.done;
    m.done = nowDone;
    tick.setAttribute('aria-pressed', String(nowDone));
    row.classList.toggle('is-done', nowDone);
    await api(`/day/${state.date}/meal`, { body: { mealId: m.id, done: nowDone } });
    const dk = state.day.eatenKcal + (nowDone ? m.kcal : -m.kcal);
    const dp = Math.round((state.day.eatenProtein + (nowDone ? m.protein : -m.protein)) * 10) / 10;
    state.day.eatenKcal = dk; state.day.eatenProtein = dp;
    renderLedger(dk, state.day.targetKcal, dp, state.day.targetProtein);
  };
  avatar.append(tick);

  const mid = el('div');
  mid.append(el('div', 'meal__time', m.time));
  mid.append(el('div', 'meal__title', m.title));
  if (m.note) mid.append(el('p', 'meal__note', m.note));
  if (m.ing && m.ing.length) {
    const det = el('details', 'meal__ing');
    det.append(el('summary', null, 'Ingredients'));
    const ul = el('ul');
    m.ing.forEach(i => ul.append(el('li', null,
      `${i.label} — ${i.unit === 'pc' ? i.qty : i.qty + ' ' + i.unit}`)));
    det.append(ul);
    mid.append(det);
  }

  const right = el('div', 'meal__macros');
  right.append(el('b', null, m.kcal + ''));
  right.append(el('span', null, Math.round(m.protein) + ' g protein'));

  row.append(avatar, mid, right);
  return row;
}

/* ---- Week ---- */

const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

async function viewWeek(v) {
  const p = state.plan;
  renderLedger(state.day ? state.day.eatenKcal : 0, p.targetKcal,
               state.day ? state.day.eatenProtein : 0, p.targetProtein);
  v.innerHTML = '';
  v.append(el('h2', 'section-title', 'The week'));
  v.append(el('p', 'muted', `${p.label} · ${p.targetKcal} kcal and ${p.targetProtein} g protein a day · ${p.windowNote}`));

  const todayKey = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][(new Date().getDay() + 6) % 7];
  for (const key of Object.keys(DAY_NAMES)) {
    const day = p.week[key];
    const card = el('div', 'card' + (key === todayKey ? ' is-today' : ''));
    const head = el('div', 'weekday');
    head.append(el('span', 'weekday__name', DAY_NAMES[key]));
    head.append(el('span', 'weekday__sum', `${day.kcal} kcal · ${Math.round(day.protein)} g`));
    card.append(head);
    day.meals.forEach(m => {
      const r = el('div', 'weekmeal');
      r.append(el('span', null, `${m.time}  ${m.title}`));
      r.append(el('span', null, `${m.kcal} · ${Math.round(m.protein)} g`));
      card.append(r);
    });
    v.append(card);
  }
}

/* ---- Recipes ---- */

async function viewRecipes(v) {
  const { recipes } = await api('/recipes');
  const prep = await api('/prep');
  v.innerHTML = '';

  v.append(el('h2', 'section-title', 'Sunday, 2 hours 30 minutes'));
  v.append(el('p', 'muted', 'Run it in this order and the oven, stove and cooker all stay busy at once.'));
  const prepCard = el('div', 'card');
  prep.sunday.forEach(([t, task]) => {
    const r = el('div', 'weekmeal');
    r.append(el('span', null, task));
    r.append(el('span', null, t));
    prepCard.append(r);
  });
  v.append(prepCard);

  const wed = el('div', 'card');
  wed.append(el('h3', null, 'Wednesday top-up — 25 minutes'));
  const ul = el('ul');
  prep.wednesday.forEach(x => ul.append(el('li', null, x)));
  wed.append(ul);
  v.append(wed);

  v.append(el('h2', 'section-title', 'Recipes'));
  recipes.forEach(r => {
    const c = el('div', 'card recipe');
    const head = el('div', 'card__head');
    head.append(el('h3', null, r.name));
    head.append(el('span', 'tag', r.tag));
    c.append(head);
    c.append(el('p', 'tiny', `${r.yield} · ${r.time} · ${r.per100}`));
    const det = el('details');
    det.append(el('summary', null, 'Ingredients and method'));
    const iul = el('ul');
    r.ingredients.forEach(i => iul.append(el('li', null, i)));
    det.append(iul);
    const ol = el('ol');
    r.steps.forEach(s => ol.append(el('li', null, s)));
    det.append(ol);
    if (r.warn) det.append(el('p', 'warn', r.warn));
    c.append(det);
    v.append(c);
  });

  v.append(el('h2', 'section-title', 'Storage'));
  const st = el('div', 'card');
  prep.storage.forEach(([item, fridge, note]) => {
    const r = el('div', 'shopitem');
    r.append(el('span', null, item));
    r.append(el('b', null, `${fridge} · ${note}`));
    st.append(r);
  });
  v.append(st);
}

/* ---- Shop ---- */

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

async function viewShop(v) {
  if (!state.shop.days.length) state.shop.days = [...ALL_DAYS];
  v.innerHTML = '';
  v.append(el('h2', 'section-title', 'Shopping list'));
  v.append(el('p', 'muted', 'Pick the days and whose plans to cover. Quantities are raw weight and add up across everyone selected.'));

  const ctl = el('div', 'card');
  ctl.append(el('p', 'tiny', 'Days'));
  const dayChips = el('div', 'chips');
  ALL_DAYS.forEach(d => {
    const c = el('button', 'chip', DAY_NAMES[d].slice(0, 3));
    c.setAttribute('aria-pressed', String(state.shop.days.includes(d)));
    c.onclick = () => {
      const i = state.shop.days.indexOf(d);
      if (i >= 0) state.shop.days.splice(i, 1); else state.shop.days.push(d);
      render();
    };
    dayChips.append(c);
  });
  ctl.append(dayChips);

  ctl.append(el('p', 'tiny', 'Plans'));
  const planChips = el('div', 'chips');
  ['A', 'B'].forEach(k => {
    const c = el('button', 'chip', 'Plan ' + k);
    c.setAttribute('aria-pressed', String(state.shop.plans.includes(k)));
    c.onclick = () => {
      const i = state.shop.plans.indexOf(k);
      if (i >= 0) state.shop.plans.splice(i, 1); else state.shop.plans.push(k);
      if (!state.shop.plans.length) state.shop.plans.push(k);
      render();
    };
    planChips.append(c);
  });
  ctl.append(planChips);
  v.append(ctl);

  if (!state.shop.days.length) {
    v.append(el('p', 'empty', 'Choose at least one day.'));
    return;
  }

  const { groups } = await api('/shopping', { body: { days: state.shop.days, plans: state.shop.plans } });
  groups.forEach(g => {
    const c = el('div', 'card');
    c.append(el('h3', null, g.name));
    g.items.forEach(i => {
      const key = g.name + '|' + i.label;
      const r = el('div', 'shopitem' + (state.got.has(key) ? ' is-got' : ''));
      r.append(el('span', null, i.label));
      r.append(el('b', null, i.qty));
      r.onclick = () => {
        if (state.got.has(key)) state.got.delete(key); else state.got.add(key);
        r.classList.toggle('is-got');
      };
      c.append(r);
    });
    v.append(c);
  });
  v.append(el('p', 'tiny', 'Tap an item to cross it off. The list rebuilds from the plan, so crossings clear when you leave.'));
}

/* ---- Progress ---- */

async function viewProgress(v) {
  const p = await api('/progress');
  v.innerHTML = '';
  v.append(el('h2', 'section-title', 'Progress'));

  const stats = el('div', 'stat');
  const box = (num, unit, label) => {
    const b = el('div', 'stat__box');
    const n = el('div', 'stat__num');
    n.append(document.createTextNode(num));
    if (unit) n.append(el('small', null, ' ' + unit));
    b.append(n, el('p', 'tiny', label));
    return b;
  };
  const latest = p.avg.length ? p.avg[p.avg.length - 1].kg : null;
  stats.append(box(latest != null ? latest.toFixed(1) : '—', 'kg', '7-day average'));
  stats.append(box(p.change != null ? (p.change > 0 ? '+' : '') + p.change.toFixed(1) : '—', 'kg', 'Change since you started'));
  stats.append(box(p.weeklyRate != null ? (p.weeklyRate > 0 ? '+' : '') + p.weeklyRate.toFixed(2) : '—', 'kg/wk', 'Recent rate'));
  stats.append(box(p.goalWeight != null && latest != null ? (latest - p.goalWeight).toFixed(1) : '—', 'kg', 'To go'));
  v.append(stats);

  if (p.weights.length < 2) {
    v.append(el('p', 'empty', 'Log your weight for a few days and the trend line appears here.'));
  } else {
    const c = el('div', 'card');
    c.append(el('h3', null, 'Weight'));
    c.append(el('p', 'tiny', 'Dots are daily readings. The line is the seven-day average — that is the one to read.'));
    c.insertAdjacentHTML('beforeend', weightChart(p));
    v.append(c);
  }

  if (p.adherence.length) {
    const c = el('div', 'card');
    c.append(el('h3', null, 'Meals logged, last 30 days'));
    c.insertAdjacentHTML('beforeend', adherenceChart(p.adherence));
    const full = p.adherence.filter(a => a.pct >= 100).length;
    c.append(el('p', 'tiny', `${full} complete ${full === 1 ? 'day' : 'days'} out of ${p.adherence.length} logged.`));
    v.append(c);
  }

  const note = el('div', 'card');
  note.append(el('h3', null, 'Reading this honestly'));
  note.append(el('p', 'muted', 'Expect 2–3 kg in the first fortnight that is water, not fat. Creatine adds another 1–2 kg of intracellular water in its first two weeks. If the average has not moved for three straight weeks and the waist has not either, cut 150 kcal — not more.'));
  v.append(note);
}

function weightChart(p) {
  const W = 640, H = 220, L = 34, R = 10, T = 12, B = 22;
  const pts = p.avg;
  const xs = p.weights;
  const dates = xs.map(w => +new Date(w.date));
  const minX = Math.min(...dates), maxX = Math.max(...dates) || minX + 1;
  const vals = xs.map(w => w.kg).concat(p.goalWeight ? [p.goalWeight] : []);
  let minY = Math.min(...vals) - 0.6, maxY = Math.max(...vals) + 0.6;
  if (maxY - minY < 2) { const m = (maxY + minY) / 2; minY = m - 1; maxY = m + 1; }
  const X = d => L + (maxX === minX ? 0.5 : (+new Date(d) - minX) / (maxX - minX)) * (W - L - R);
  const Y = k => T + (1 - (k - minY) / (maxY - minY)) * (H - T - B);

  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend">`;
  for (let i = 0; i <= 3; i++) {
    const y = T + i * (H - T - B) / 3;
    const val = (maxY - i * (maxY - minY) / 3).toFixed(1);
    s += `<line class="grid" x1="${L}" y1="${y}" x2="${W - R}" y2="${y}"/>`;
    s += `<text x="2" y="${y + 3}">${val}</text>`;
  }
  if (p.goalWeight) s += `<line class="goal" x1="${L}" y1="${Y(p.goalWeight)}" x2="${W - R}" y2="${Y(p.goalWeight)}"/>`;
  xs.forEach(w => { s += `<circle class="raw" cx="${X(w.date).toFixed(1)}" cy="${Y(w.kg).toFixed(1)}" r="2.5"/>`; });
  s += `<path class="avg" d="${pts.map((q, i) => (i ? 'L' : 'M') + X(q.date).toFixed(1) + ' ' + Y(q.kg).toFixed(1)).join(' ')}"/>`;
  s += `<text x="${L}" y="${H - 6}">${xs[0].date.slice(5)}</text>`;
  s += `<text x="${W - R}" y="${H - 6}" text-anchor="end">${xs[xs.length - 1].date.slice(5)}</text>`;
  return s + '</svg>';
}

function adherenceChart(rows) {
  const W = 640, H = 120, T = 8, B = 18;
  const bw = Math.min(18, (W - 8) / Math.max(rows.length, 1) - 3);
  let s = `<svg class="chart bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Meals logged per day">`;
  rows.forEach((r, i) => {
    const h = Math.max(2, (r.pct / 100) * (H - T - B));
    const x = 4 + i * ((W - 8) / rows.length);
    s += `<rect class="${r.pct >= 100 ? 'full' : ''}" x="${x.toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>`;
  });
  s += `<line class="grid" x1="0" y1="${H - B}" x2="${W}" y2="${H - B}"/>`;
  s += `<text x="4" y="${H - 4}">${rows[0].date.slice(5)}</text>`;
  s += `<text x="${W - 4}" y="${H - 4}" text-anchor="end">${rows[rows.length - 1].date.slice(5)}</text>`;
  return s + '</svg>';
}

/* ---------------------------------------------------------------- wire */

document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => { state.view = t.dataset.view; render(); $('#view').focus(); };
});
$('#lg-go').onclick = signIn;
$('#lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
$('#lg-user').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lg-pass').focus(); });
$('#signout').onclick = async () => { await api('/logout', { method: 'POST' }); location.reload(); };

boot().catch(showSignin);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
