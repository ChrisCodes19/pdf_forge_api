# Deploy & Sell — Step-by-Step

This is the full walkthrough for getting PDF Forge API **live on the internet** and
**earning on RapidAPI**. Two phases:

1. **Deploy** the service to a public URL.
2. **List it on RapidAPI** so people can subscribe and pay.

Budget note: everything here can be done for ~$0. Fly.io requires a card on file but
bills almost nothing when your app is idle (it sleeps). Render's free tier needs no card
but has less memory and slower cold starts. Both are covered — pick one.

---

## Phase 0 — One-time prep

### Put the code on GitHub (needed for Render; nice-to-have for Fly)
The project isn't a git repo yet. From the project folder:

```bash
cd /home/christopher/personal_projects/api_projects
git init
git add .
git commit -m "PDF Forge API MVP"
```

Then create an empty repo on github.com and:
```bash
git remote add origin https://github.com/<you>/pdf-forge-api.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `.env`, and stray `*.pdf` files, so nothing
secret gets pushed.

### Generate your proxy secret now (you'll paste it in two places)
```bash
openssl rand -hex 24
```
Copy the output. This single value goes (a) on your host as the `PROXY_SECRET` env var and
(b) into RapidAPI's Security tab. They must match — that's what stops people bypassing billing.

---

## Phase 1, Option A — Deploy to Fly.io (recommended)

**Why Fly:** the app can scale to zero (sleeps when idle → near-zero cost), gets 1 GB RAM
(comfortable for Chromium), and deploys straight from your folder with no GitHub required.
**Trade-off:** requires a credit card on file even though idle cost is pennies.

### 1. Install the CLI and log in
```bash
curl -L https://fly.io/install.sh | sh      # installs flyctl; follow the PATH hint it prints
fly auth signup                              # or: fly auth login
```
You'll be asked to add a payment card. With the `auto_stop_machines = "stop"` setting in
`fly.toml`, the machine halts when no requests are coming in, so you're billed for compute
only while it's actively rendering — typically cents per month at low traffic.

### 2. Create the app (don't deploy yet)
```bash
cd /home/christopher/personal_projects/api_projects
fly launch --no-deploy
```
- It detects the existing `Dockerfile` and `fly.toml`. **Say "yes" to using them.**
- **App name must be globally unique.** `pdf-forge-api` is probably taken — accept the
  suggested random name or pick your own (e.g. `pdf-forge-<yourname>`). Whatever you choose
  becomes your URL: `https://<app-name>.fly.dev`.
- If it asks to tweak settings, decline (keep 1 GB RAM from `fly.toml`).

> If `fly launch` overwrites your `fly.toml`, re-open it and confirm `memory = "1gb"` and
> the `auto_stop_machines` / `min_machines_running = 0` lines are still present.

### 3. Set your secret, then deploy
```bash
fly secrets set PROXY_SECRET=<paste-the-openssl-value>
fly deploy
```
The first build takes a few minutes (it's pulling the Puppeteer/Chromium image). When it
finishes:
```bash
fly open            # opens your app URL in a browser
fly status          # shows the machine + the exact hostname
fly logs            # live logs if anything misbehaves
```

### 4. Smoke-test the live URL
Replace `<app>` with your real hostname:
```bash
# health (no auth) — expect {"status":"ok",...}
curl https://<app>.fly.dev/health

# with the secret — expect a PDF
curl -X POST https://<app>.fly.dev/v1/html-to-pdf \
  -H 'Content-Type: application/json' \
  -H 'X-RapidAPI-Proxy-Secret: <your-secret>' \
  -d '{"html":"<h1>Live!</h1>"}' --output live.pdf

# without the secret — expect HTTP 403
curl -i -X POST https://<app>.fly.dev/v1/html-to-pdf \
  -H 'Content-Type: application/json' -d '{"html":"<h1>x</h1>"}'
```
If the first render after idle is slow (~5–15 s), that's the cold start — normal, and it
warms up for subsequent calls.

---

## Phase 1, Option B — Deploy to Render (no credit card)

**Why Render:** genuinely free, no card. **Trade-off:** 512 MB RAM (fine for typical
invoices/small pages, can OOM on huge/image-heavy renders) and a ~50 s cold start after
15 min idle. Good enough to launch and validate; move to Fly/paid once you have revenue.

1. Push your code to GitHub (Phase 0).
2. Go to **dashboard.render.com → New → Web Service**.
3. Connect your GitHub repo.
4. Render detects the `Dockerfile` — choose **Docker** as the runtime/environment.
5. Set **Instance Type = Free**.
6. Under **Environment**, add a variable: `PROXY_SECRET` = your openssl value.
   (`PORT` is provided by Render automatically; the server already reads it.)
7. Click **Create Web Service**. First build takes several minutes.
8. Your URL is `https://<service-name>.onrender.com`. Smoke-test it exactly like the Fly
   commands above.

> If renders fail with out-of-memory on the free tier, lower `MAX_CONCURRENCY` to `1`
> (env var) and keep test payloads modest, or upgrade to Render's cheapest paid instance.

---

## Phase 2 — List on RapidAPI (turn on the money)

RapidAPI (also branded "Rapid") hosts a marketplace, issues API keys to subscribers,
enforces per-plan quotas, and bills customers — then pays you. You never write billing code.

### 1. Become a provider
- Sign up / log in at **rapidapi.com**.
- Open the provider dashboard (**"My APIs"**, or go to **provider.rapidapi.com**).
- Click **Add New API**.

### 2. Create the API — fastest path: import the OpenAPI spec
This repo ships `openapi.yaml`. Importing it auto-creates both endpoints with their
parameters and examples, so you don't hand-type anything.

- When adding the API, choose **"Import from OpenAPI"** (a.k.a. upload spec).
- Upload `openapi.yaml`.
- **Before or after import, edit the `servers:` URL** in the spec (or the Base URL field in
  the dashboard) to your real deployed URL, e.g. `https://<app>.fly.dev`. This is where
  RapidAPI forwards subscriber requests.

*(Manual alternative, if you skip the spec: set the Base URL, then under each endpoint add
`POST /v1/html-to-pdf` and `POST /v1/invoice`, mark the body as JSON, and paste the example
bodies from the README.)*

### 3. Wire up the security header (critical)
This is what makes your `PROXY_SECRET` check meaningful.

- In your API's **Security** settings on RapidAPI, find the **secret** RapidAPI uses to
  sign proxied requests — it sends it as the header **`X-RapidAPI-Proxy-Secret`**.
- Make sure the value RapidAPI shows there is the **same** string you set as `PROXY_SECRET`
  on your host. Depending on the UI you either (a) copy RapidAPI's generated secret and
  update your host's env var to match, or (b) paste your own secret in. **Either way, the
  two must be identical**, then redeploy/restart your host if you changed the env var.
- Result: anyone who finds your raw `.fly.dev` URL and calls it directly gets a **403**;
  only traffic proxied by RapidAPI (carrying the secret) succeeds. No secret = no bypassing
  the meter.

### 4. Define pricing plans
Under **Plans / Pricing**, create tiers. A proven starting structure:

| Plan | Price | Quota | Purpose |
| --- | --- | --- | --- |
| **Basic** | Free | 50 requests/mo | Discovery + trials. Set a **hard limit** so free users can't overrun. |
| **Pro** | $9.99/mo | 5,000/mo | Your bread-and-butter tier. |
| **Ultra** | $49.99/mo | 50,000/mo | Heavier users; optionally add per-call overage. |

Tips:
- Add a **rate limit** (e.g. 5 requests/second) on every plan to protect your instance.
- Use **hard limits** on the free plan (block when exceeded) and **soft/overage** on paid.
- You can price per-endpoint later; a single quota across both endpoints is fine to start.

### 5. Documentation & examples
- Paste the curl examples and example JSON from the README into each endpoint's description.
- Add a clear short summary + a few searchable tags (e.g. "PDF", "HTML to PDF", "invoice
  generator", "receipt"). Marketplace search is how buyers find you.

### 6. Publish
- Set the API **public** and submit. Once approved it's live and subscribable.
- Test the whole loop yourself: subscribe to your own **Free** plan, grab the test key in
  RapidAPI's **Endpoints → test console**, and fire both endpoints. Confirm you get PDFs and
  that the request count ticks up in your provider analytics.

---

## Phase 3 — Publish the landing page (free, optional but recommended)

`landing/index.html` is a self-contained marketing page (no build step, no external
assets). It's your SEO surface and a friendlier link to share than a raw RapidAPI URL.

**Before publishing:** open the file and replace every `REPLACE_WITH_RAPIDAPI_LISTING_URL`
with your actual RapidAPI listing URL (there are four).

**GitHub Pages (free):**
1. In your repo settings → Pages → deploy from `main` branch.
2. Either move `landing/index.html` to the repo root as `index.html`, or set Pages to
   serve from the `/landing` folder (whichever the UI offers).
3. Your page is live at `https://<you>.github.io/pdf-forge-api/`.

**Netlify (free, drag-and-drop):**
- Go to app.netlify.com → drag the `landing/` folder onto the deploy area. Done — you get
  a `*.netlify.app` URL instantly, and can attach a custom domain later.

---

## After you're live (the part that actually earns)

Listing ≠ traffic. To get subscribers:
- **Nail the listing:** clear title, great description, working examples, screenshots of a
  sample PDF. Buyers judge in seconds.
- **SEO/marketing:** a tiny landing page, a blog post ("Generate invoice PDFs via API"),
  and answering relevant questions on Stack Overflow / Reddit / dev forums with a link.
- **Iterate on usage:** watch analytics; the endpoints people hit tell you what to build
  next (merge, watermark, html-to-image are quick wins that reuse the same renderer).

## Quick troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Every `/v1` call returns 403 in RapidAPI's console | Host's `PROXY_SECRET` ≠ RapidAPI's proxy secret. Re-sync and redeploy. |
| First request after idle is slow | Cold start (Fly scale-to-zero / Render sleep). Expected; warms up. Upgrade to keep 1 machine warm. |
| Renders fail / 500 under load | Out of memory. Lower `MAX_CONCURRENCY`, or move to 1 GB+ RAM. |
| Chromium won't launch on host | Use the provided `Dockerfile` (official Puppeteer image) — don't run bare `node` on a minimal base image. |
| Big pages time out | Raise `RENDER_TIMEOUT_MS`, but keep it bounded so one request can't pin a worker. |
