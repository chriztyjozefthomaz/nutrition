# MCF Kitchen

A two-person nutrition tracker: meal logging, weight trend, progress charts and a
shopping-list generator built from the plan itself.

Plan A (1,950 kcal / 165 g protein) and Plan B (1,500 kcal / 120 g protein) run on
separate logins with separate data. The shopping list can cover either plan or both.

## What it does

- **Today** — tick meals as you eat them; the ledger at the top fills toward the
  target notch. Add off-plan food under *Anything else*. Log weight and waist.
- **Week** — the full seven-day plan with per-day totals.
- **Recipes** — the Sunday prep run order, ten recipes, and storage times.
- **Shop** — pick days and plans; quantities aggregate across everyone selected.
- **Progress** — seven-day rolling average, weekly rate, and meals logged.

Installable to the home screen. The shell works offline; logging needs a signal.

## Architecture

Node 22 + Express, SQLite on a Docker volume, no build step and no client
framework. Sessions are signed cookies (HMAC-SHA256); passwords are scrypt-hashed
with a per-user salt. Charts are hand-rolled SVG, so there is no CDN dependency and
the app renders fully offline.

All nutrition figures derive from a single `FOODS` table in `src/plan.js`. Meal
calories and protein are computed, never hand-typed, so the numbers cannot drift
apart from the ingredient list. Change a portion and the totals, the day summary
and the shopping list all follow.

## Deploying to the VPS

Traefik is already running on this box with the `letsencrypt` resolver, so the app
only needs labels — no nginx, no certbot.

The image builds and publishes to `ghcr.io/chriztyjozefthomaz/nutrition:latest` via
[.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml) on every
push to `main`. The VPS project (managed through Hostinger's API, not SSH) pulls
`latest` and recreates the container — `SESSION_SECRET`, `SEED_USERS`, and
`APP_DOMAIN` are stored as that project's environment, not in a `.env` file on disk.

To ship a change: push to `main`, wait for the Actions run to finish, then trigger a
redeploy (pulls the new image and recreates the container, volumes untouched).

## Changing the plan

Everything lives in `src/plan.js`. To adjust a portion, edit the quantity in the
relevant `meal()` call and rebuild — the totals recalculate themselves. To check a
change landed where you wanted:

```
node -e "const{PLANS,DAYS}=require('./src/plan');for(const k of['A','B']){const p=PLANS[k];
console.log(p.label,p.targetKcal,p.targetProtein);for(const d of DAYS){const m=p.week[d];
console.log(d,m.reduce((a,x)=>a+x.kcal,0),Math.round(m.reduce((a,x)=>a+x.protein,0)))}}"
```

## Backing up

The database is a single file inside the `nutrition-data` volume:

```
docker compose exec app sh -c 'cat /data/nutrition.db' > backup-$(date +%F).db
```

## Running locally

```
npm install
SESSION_SECRET=dev-secret-at-least-24-chars \
SEED_USERS="me:test1234:Me:A:90:76:174" \
npm run dev
```
Then open http://localhost:3000. `npm run dev` writes to `./dev.db` and disables the
secure-cookie flag so it works over plain HTTP.
