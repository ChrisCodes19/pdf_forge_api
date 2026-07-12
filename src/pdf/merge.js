// Merge multiple PDFs into one. Pure JS via pdf-lib — no browser needed, so this
// endpoint is cheap and runs anywhere (unlike the Chromium-backed renderer).

import { PDFDocument } from 'pdf-lib';

const MAX_FILES = Number(process.env.MERGE_MAX_FILES || 20);

/**
 * Merge an array of PDF Buffers into a single PDF Buffer, preserving order.
 * @param {Buffer[]} buffers
 * @returns {Promise<Buffer>}
 */
export async function mergePdfBuffers(buffers) {
  const out = await PDFDocument.create();
  for (let i = 0; i < buffers.length; i += 1) {
    let src;
    try {
      // ignoreEncryption lets us merge PDFs that carry (removable) permissions flags.
      src = await PDFDocument.load(buffers[i], { ignoreEncryption: true });
    } catch {
      const err = new Error(`files[${i}] is not a valid PDF`);
      err.statusCode = 400;
      throw err;
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return Buffer.from(await out.save());
}

/**
 * Validate + decode a request body of the shape { files: [base64, base64, ...] }.
 * @returns {Buffer[]}
 */
export function decodeMergeBody(body = {}) {
  const files = body.files;
  if (!Array.isArray(files) || files.length < 2) {
    const err = new Error('Body must include a "files" array of at least 2 base64-encoded PDFs.');
    err.statusCode = 400;
    throw err;
  }
  if (files.length > MAX_FILES) {
    const err = new Error(`Too many files (max ${MAX_FILES}).`);
    err.statusCode = 400;
    throw err;
  }
  return files.map((f, i) => {
    if (typeof f !== 'string' || f.trim() === '') {
      const err = new Error(`files[${i}] must be a non-empty base64 string.`);
      err.statusCode = 400;
      throw err;
    }
    // Strip an optional data-URL prefix (data:application/pdf;base64,....).
    const b64 = f.includes(',') ? f.slice(f.indexOf(',') + 1) : f;
    return Buffer.from(b64, 'base64');
  });
}
