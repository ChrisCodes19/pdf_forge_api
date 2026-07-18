# PDF Forge API — RapidAPI Documentation (copy/paste source)

This file contains ready-to-paste documentation for your RapidAPI listing.

- **Section 1 (Overview)** → paste into the **Docs** tab / API description on RapidAPI.
- **Sections 2–4 (per endpoint)** → paste each into that endpoint's **Description** field
  under **Definitions → Endpoints → Edit**.

Everything below matches the live API exactly. Adjust wording/pricing anytime.

---

# SECTION 1 — OVERVIEW (paste into Docs / description)

## PDF Forge API

Generate PDFs on demand with a simple REST call. Convert HTML into pixel-perfect PDFs,
turn structured JSON into styled invoices, and merge PDFs together — no rendering
infrastructure to run, no data stored.

### Why PDF Forge?
- **HTML → PDF** rendered by a real headless Chromium, so your CSS, fonts, and backgrounds
  come out exactly as they look in a browser.
- **JSON → Invoice** with automatic math — send line items, get back a clean invoice PDF
  with subtotal, tax, discount, and total calculated for you.
- **Merge** multiple PDFs into one, in order.
- **Fast & stateless** — we render and return; nothing is stored.

### Common use cases
Invoices & receipts, reports, tickets & certificates, contracts, packing slips, labels,
and "export to PDF" features in your own app.

### Quick start
1. Subscribe to a plan (start with **Basic — free**).
2. Copy your `X-RapidAPI-Key` from the RapidAPI dashboard.
3. Call an endpoint (example below). The response body **is the PDF file**.

```bash
curl -X POST \
  https://pdf-forge-api.p.rapidapi.com/v1/html-to-pdf \
  -H 'Content-Type: application/json' \
  -H 'X-RapidAPI-Key: YOUR_KEY' \
  -H 'X-RapidAPI-Host: pdf-forge-api.p.rapidapi.com' \
  -d '{"html":"<h1>Hello PDF</h1><p>Made with PDF Forge.</p>"}' \
  --output hello.pdf
```

### ⚠️ Important: responses are binary PDF files
Every endpoint returns raw PDF bytes with `Content-Type: application/pdf` — **not JSON.**
Save the response as a file / handle it as binary. Don't try to `JSON.parse()` it.

**Node.js (axios):**
```js
const res = await axios.post(url, body, {
  headers,
  responseType: 'arraybuffer', // <-- important
});
require('fs').writeFileSync('out.pdf', res.data);
```

**Python (requests):**
```python
r = requests.post(url, json=body, headers=headers)
with open('out.pdf', 'wb') as f:
    f.write(r.content)   # bytes, not r.json()
```

Errors (4xx) are returned as JSON: `{ "error": "message" }`.

### Endpoints at a glance
| Method & path | Purpose |
| --- | --- |
| `POST /v1/html-to-pdf` | Render an HTML string to a PDF |
| `POST /v1/invoice` | Build a styled invoice PDF from JSON |
| `POST /v1/merge` | Merge multiple PDFs into one |

### Authentication
Handled by RapidAPI. Send your `X-RapidAPI-Key` (and `X-RapidAPI-Host`) headers with every
request — RapidAPI validates and meters them for you.

### Rate limits & quotas
Each plan has a monthly request quota and a per-second rate limit (see the Pricing tab).
Requests beyond your plan return `429`.

### Support
Questions or a feature request (watermarking, PDF splitting, HTML-to-image)? Reach out via
the **Discussions** tab on the listing.

---

# SECTION 2 — POST /v1/html-to-pdf (paste into this endpoint's Description)

Render an HTML document or fragment into a PDF.

**Request body (JSON):**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `html` | string | ✅ | The HTML to render. Can be a full document or a fragment. External `https://` images/fonts referenced in the HTML are loaded during rendering. |
| `options` | object | — | Optional page settings (below). |
| `options.format` | string | — | Page size. Default `A4`. Examples: `Letter`, `Legal`, `A3`. |
| `options.landscape` | boolean | — | Landscape orientation. Default `false`. |
| `options.printBackground` | boolean | — | Render CSS backgrounds/colors. Default `true`. |
| `options.margin` | object | — | Margins, e.g. `{"top":"20px","right":"20px","bottom":"20px","left":"20px"}`. |
| `options.scale` | number | — | Zoom of the rendering, `0.1`–`2`. Default `1`. |

**Example request:**
```json
{
  "html": "<h1>Invoice #1042</h1><p>Thanks for your business.</p>",
  "options": { "format": "A4", "printBackground": true }
}
```

**Response:** `200 OK`, `Content-Type: application/pdf` — the PDF file bytes.

**Errors:**
- `400` — `html` is missing or empty.
- `429` — plan quota or rate limit exceeded.

---

# SECTION 3 — POST /v1/invoice (paste into this endpoint's Description)

Generate a styled invoice/receipt PDF from structured data. Line `amount`, `subtotal`,
`tax`, `discount`, and `total` are all calculated for you.

**Request body (JSON):**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `company` | object | ✅ | Your business. Requires `name`. Optional: `address`, `email`, `logoUrl` (must be an `https://` URL). |
| `customer` | object | ✅ | Bill-to party. Requires `name`. Optional: `address`, `email`. |
| `items` | array | ✅ | At least one line item. Each: `description` (string), `quantity` (number), `unitPrice` (number). |
| `number` | string | — | Invoice number. Defaults to a generated value. |
| `title` | string | — | Document title. Default `Invoice`. |
| `date` | string | — | Issue date. Defaults to today (YYYY-MM-DD). |
| `dueDate` | string | — | Due date. |
| `currency` | string | — | Currency label, e.g. `USD`. Default `USD`. |
| `taxRate` | number | — | Tax percent, e.g. `8.5`. Default `0`. |
| `discount` | number | — | Flat discount amount. Default `0`. |
| `accent` | string | — | Hex accent color for the template, e.g. `#2563eb`. |
| `notes` | string | — | Free-text notes shown at the bottom. |

**Example request:**
```json
{
  "number": "INV-1042",
  "currency": "USD",
  "taxRate": 8.5,
  "company": { "name": "Acme LLC", "address": "1 Market St\nSan Francisco, CA", "email": "billing@acme.co" },
  "customer": { "name": "Jane Doe", "email": "jane@example.com" },
  "items": [
    { "description": "Design work", "quantity": 10, "unitPrice": 90 },
    { "description": "Hosting (monthly)", "quantity": 1, "unitPrice": 25 }
  ],
  "notes": "Payment due within 14 days."
}
```

**Response:** `200 OK`, `Content-Type: application/pdf` — the invoice PDF. Totals are
computed server-side (in the example: subtotal 925.00, tax 78.63, total 1003.63).

**Errors:**
- `400` — missing `company.name`, `customer.name`, or an empty/invalid `items` array.
- `429` — plan quota or rate limit exceeded.

---

# SECTION 4 — POST /v1/merge (paste into this endpoint's Description)

Merge multiple PDFs into a single PDF, preserving order.

**Request body (JSON):**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `files` | array of strings | ✅ | 2–20 base64-encoded PDFs. A `data:application/pdf;base64,` prefix is accepted and stripped automatically. |

**Example request:**
```json
{
  "files": [
    "JVBERi0xLjQKJ...(base64 of first PDF)...",
    "JVBERi0xLjQKJ...(base64 of second PDF)..."
  ]
}
```

**Response:** `200 OK`, `Content-Type: application/pdf` — the merged PDF.

**Errors:**
- `400` — fewer than 2 files, more than 20, or one of the items isn't a valid PDF.
- `429` — plan quota or rate limit exceeded.

**Tip:** base64 inflates payload size by ~33%. Keep total request size within your plan's
limits; very large merges may need bigger inputs split into batches.
