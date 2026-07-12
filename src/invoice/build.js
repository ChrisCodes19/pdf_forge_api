// Turn a validated invoice JSON payload into rendered HTML, then into a PDF.
// Reuses the shared renderer so /v1/invoice and /v1/html-to-pdf share one Chromium.

import { Eta } from 'eta';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { htmlToPdf } from '../pdf/renderer.js';

const templateDir = path.dirname(fileURLToPath(import.meta.url)).replace(/invoice$/, 'templates');
const eta = new Eta({ views: templateDir, autoEscape: true });

// Round to 2 decimals, avoiding float drift (e.g. 0.1 + 0.2).
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Validate + normalize the incoming payload, computing any missing money fields.
 * Throws an Error (with a user-facing message) on invalid input.
 */
export function normalizeInvoice(body = {}) {
  const errors = [];
  if (!body.company || typeof body.company.name !== 'string') {
    errors.push('company.name is required');
  }
  if (!body.customer || typeof body.customer.name !== 'string') {
    errors.push('customer.name is required');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items must be a non-empty array');
  }
  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.statusCode = 400;
    throw err;
  }

  const items = body.items.map((raw, i) => {
    const quantity = Number(raw.quantity);
    const unitPrice = Number(raw.unitPrice);
    if (!raw.description || Number.isNaN(quantity) || Number.isNaN(unitPrice)) {
      const err = new Error(`items[${i}] needs description, numeric quantity and unitPrice`);
      err.statusCode = 400;
      throw err;
    }
    return {
      description: String(raw.description),
      quantity,
      unitPrice: round2(unitPrice),
      amount: round2(quantity * unitPrice),
    };
  });

  const subtotal = round2(items.reduce((s, it) => s + it.amount, 0));
  const taxRate = Number(body.taxRate || 0);
  const discount = round2(Number(body.discount || 0));
  const taxAmount = round2((subtotal - discount) * (taxRate / 100));
  const total = round2(subtotal - discount + taxAmount);

  return {
    title: body.title || 'Invoice',
    number: String(body.number || Date.now()),
    date: body.date || new Date().toISOString().slice(0, 10),
    dueDate: body.dueDate || '',
    currency: body.currency || 'USD',
    accent: /^#[0-9a-fA-F]{3,8}$/.test(body.accent || '') ? body.accent : '#2563eb',
    company: {
      name: body.company.name,
      address: body.company.address || '',
      email: body.company.email || '',
      logoUrl: typeof body.company.logoUrl === 'string' && /^https:\/\//.test(body.company.logoUrl)
        ? body.company.logoUrl
        : '', // only allow https logos (SSRF hardening — no file://, no http)
    },
    customer: {
      name: body.customer.name,
      address: body.customer.address || '',
      email: body.customer.email || '',
    },
    items,
    subtotal,
    taxRate,
    taxAmount,
    discount,
    total,
    notes: body.notes || '',
    fmt: (n) => Number(n).toFixed(2),
  };
}

/** Full pipeline: raw JSON body -> PDF Buffer. */
export async function buildInvoicePdf(body) {
  const data = normalizeInvoice(body);
  const html = eta.render('invoice', data);
  return htmlToPdf(html);
}
