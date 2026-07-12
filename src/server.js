// PDF Forge API — Fastify server.
//
// Endpoints:
//   GET  /health           -> liveness probe (no auth)
//   POST /v1/html-to-pdf   -> { html, options } -> application/pdf
//   POST /v1/invoice       -> invoice JSON       -> application/pdf
//
// All /v1 routes require the RapidAPI proxy secret so nobody can bypass billing
// by calling the host directly. Set PROXY_SECRET to enable the gate; leave it
// blank locally to skip it.

import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { htmlToPdf } from './pdf/renderer.js';
import { buildInvoicePdf } from './invoice/build.js';
import { closeBrowser } from './pdf/renderer.js';
import { mergePdfBuffers, decodeMergeBody } from './pdf/merge.js';

const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 2 * 1024 * 1024);
const PROXY_SECRET = process.env.PROXY_SECRET || '';

const app = Fastify({
  logger: true,
  bodyLimit: MAX_BODY_BYTES, // reject oversized payloads before we touch them
});

await app.register(rateLimit, {
  max: 60, // a courtesy backstop; RapidAPI enforces the real per-plan quotas
  timeWindow: '1 minute',
});

// --- Auth gate: verify the RapidAPI proxy secret on every /v1 route ----------
app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/v1/')) return; // health + docs stay open
  if (!PROXY_SECRET) return; // local dev: gate disabled when secret unset
  const provided = request.headers['x-rapidapi-proxy-secret'];
  if (provided !== PROXY_SECRET) {
    reply.code(403).send({ error: 'Forbidden: request must come through RapidAPI.' });
  }
});

// --- Health ------------------------------------------------------------------
app.get('/health', async () => ({ status: 'ok', service: 'pdf-forge-api' }));

// --- POST /v1/html-to-pdf ----------------------------------------------------
app.post('/v1/html-to-pdf', async (request, reply) => {
  const { html, options } = request.body || {};
  if (typeof html !== 'string' || html.trim() === '') {
    return reply.code(400).send({ error: 'Body must include a non-empty "html" string.' });
  }

  // Whitelist the pdf options we forward (don't pass arbitrary user objects to Chromium).
  const safeOptions = {};
  if (options && typeof options === 'object') {
    if (typeof options.format === 'string') safeOptions.format = options.format;
    if (typeof options.landscape === 'boolean') safeOptions.landscape = options.landscape;
    if (typeof options.printBackground === 'boolean') safeOptions.printBackground = options.printBackground;
    if (options.margin && typeof options.margin === 'object') safeOptions.margin = options.margin;
    if (typeof options.scale === 'number' && options.scale >= 0.1 && options.scale <= 2) {
      safeOptions.scale = options.scale;
    }
  }

  const pdf = await htmlToPdf(html, safeOptions);
  reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', 'inline; filename="document.pdf"')
    .send(pdf);
});

// --- POST /v1/invoice --------------------------------------------------------
app.post('/v1/invoice', async (request, reply) => {
  const pdf = await buildInvoicePdf(request.body || {});
  reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', 'inline; filename="invoice.pdf"')
    .send(pdf);
});

// --- POST /v1/merge ----------------------------------------------------------
app.post('/v1/merge', async (request, reply) => {
  const buffers = decodeMergeBody(request.body || {});
  const pdf = await mergePdfBuffers(buffers);
  reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', 'inline; filename="merged.pdf"')
    .send(pdf);
});

// --- Error handling ----------------------------------------------------------
app.setErrorHandler((error, request, reply) => {
  const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
  if (status >= 500) request.log.error(error);
  reply.code(status).send({ error: status >= 500 ? 'Internal error rendering PDF.' : error.message });
});

// --- Lifecycle ---------------------------------------------------------------
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await closeBrowser();
    await app.close();
    process.exit(0);
  });
}

start();
