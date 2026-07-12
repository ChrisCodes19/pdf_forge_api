# PDF Forge API

A small, self-contained **PDF / document-generation API**. Three endpoints:

| Endpoint | Does |
| --- | --- |
| `POST /v1/html-to-pdf` | Turn any HTML into a PDF. |
| `POST /v1/invoice` | Turn structured JSON into a styled invoice/receipt PDF. |
| `POST /v1/merge` | Merge several base64-encoded PDFs into one. |

Built to be sold on [RapidAPI Hub](https://rapidapi.com/) — RapidAPI handles keys,
quotas, and billing; this service just renders PDFs.

---

## Run locally

```bash
npm install          # installs deps + downloads a Chromium for Puppeteer
npm run dev          # starts on http://localhost:3000 (PROXY_SECRET unset = auth off)
```

### Try html-to-pdf
```bash
curl -X POST http://localhost:3000/v1/html-to-pdf \
  -H 'Content-Type: application/json' \
  -d '{"html":"<h1>Hello PDF</h1><p>Made by the API.</p>"}' \
  --output hello.pdf
```

### Try invoice
```bash
curl -X POST http://localhost:3000/v1/invoice \
  -H 'Content-Type: application/json' \
  -d '{
    "number": "INV-1001",
    "company": { "name": "Acme LLC", "address": "1 Market St\nSF, CA", "email": "billing@acme.co" },
    "customer": { "name": "Jane Doe", "email": "jane@example.com" },
    "items": [
      { "description": "Design work", "quantity": 10, "unitPrice": 90 },
      { "description": "Hosting (monthly)", "quantity": 1, "unitPrice": 25 }
    ],
    "taxRate": 8.5,
    "currency": "USD",
    "notes": "Payment due within 14 days."
  }' \
  --output invoice.pdf
```

The API computes each line `amount`, the `subtotal`, `tax`, and `total` for you.

### Try merge
```bash
# merge two PDFs you have on disk, using base64
curl -X POST http://localhost:3000/v1/merge \
  -H 'Content-Type: application/json' \
  -d "{\"files\":[\"$(base64 -w0 a.pdf)\",\"$(base64 -w0 b.pdf)\"]}" \
  --output merged.pdf
```

---

## Deploy (free tier)

Uses the official Puppeteer Docker image so Chromium "just works".

**Fly.io**
```bash
fly launch --no-deploy       # accept the included fly.toml
fly secrets set PROXY_SECRET=$(openssl rand -hex 24)
fly deploy
```

**Render**: New → Web Service → Docker → point at this repo. Add env var
`PROXY_SECRET`. Done.

---

## Monetize on RapidAPI

1. Add a new API → set the **Base URL** to your deployed URL.
2. Under **Security**, copy the proxy secret and set it as `PROXY_SECRET` on your host.
   Every `/v1` request is rejected unless it carries the matching
   `X-RapidAPI-Proxy-Secret` header — this stops people bypassing billing.
3. Define plans, e.g. Free 50/mo · Pro $9.99 5k/mo · Ultra $49.99 50k/mo.
4. Write endpoint docs (reuse the curl examples above) and publish.

---

## Config (env vars)

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Listen port. |
| `PROXY_SECRET` | *(empty)* | RapidAPI proxy secret. Empty = auth disabled (local only). |
| `MAX_BODY_BYTES` | `2097152` | Max request body (2 MB). |
| `RENDER_TIMEOUT_MS` | `20000` | Per-render hard timeout. |
| `MAX_CONCURRENCY` | `2` | Simultaneous Chromium pages (protects free-tier memory). |

## Notes / roadmap
- HTML→PDF renders whatever HTML you send, including remote images/fonts. Only
  `https://` logo URLs are accepted for invoices (basic SSRF hardening).
- Fast-follow endpoints that reuse the same renderer: `merge`, `watermark`,
  `split`, `html-to-image`, `certificate`.
