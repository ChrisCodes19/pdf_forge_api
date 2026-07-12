// Shared Chromium/Puppeteer PDF renderer.
//
// Design goals for a small free-tier instance:
//  - Reuse ONE browser instance across requests (launching Chromium per request
//    would blow the memory/CPU budget and add seconds of latency).
//  - Cap concurrency so a burst of requests can't spawn unbounded pages and OOM.
//  - Hard per-render timeout so a hanging page (e.g. a resource that never loads)
//    can't pin a worker forever.

import puppeteer from 'puppeteer';

const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 20000);
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 2);

let browserPromise = null;
let active = 0;
const waiters = [];

// Lazily launch a single shared browser. Concurrent callers share the same promise.
function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      // These flags let Chromium run inside a minimal container (no sandbox namespaces).
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });
    // If launch fails, clear the cached promise so the next call can retry.
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

// Simple concurrency gate: resolves once a slot is free.
function acquireSlot() {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) {
    next(); // hand the slot straight to the next waiter (active stays the same)
  } else {
    active -= 1;
  }
}

/**
 * Render an HTML string to a PDF Buffer.
 * @param {string} html      Full HTML document (or fragment) to render.
 * @param {object} pdfOptions Puppeteer page.pdf() options (format, margin, landscape...).
 * @returns {Promise<Buffer>}
 */
export async function htmlToPdf(html, pdfOptions = {}) {
  await acquireSlot();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // waitUntil 'networkidle0' lets fonts/images load; timeout bounds the wait.
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: RENDER_TIMEOUT_MS,
    });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      timeout: RENDER_TIMEOUT_MS,
      ...pdfOptions,
    });
    return Buffer.from(pdf);
  } finally {
    // Always close the page (a leaked page = leaked memory) and free the slot.
    await page.close().catch(() => {});
    releaseSlot();
  }
}

// Graceful shutdown so Chromium doesn't linger as a zombie on redeploy.
export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    if (b) await b.close().catch(() => {});
  }
}
