export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

export type PdfTextResult =
  | { ok: true; pages: string[] }
  | { ok: false; reason: 'needsPassword' | 'wrongPassword' | 'notPdf' | 'noText' };

/** Group positioned text items into lines (same y within 2pt), top to bottom, left to right. */
export function itemsToLines(items: PdfTextItem[]): string[] {
  const rows: { y: number; items: PdfTextItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
}

// Minimal shape of the pdfjs-dist module surface this file relies on, verified against
// the installed pdfjs-dist version's own type definitions (node_modules/pdfjs-dist/types).
interface PdfJsTextItem {
  str: string;
  transform: number[];
}

interface PdfJsModule {
  getDocument(src: { data: Uint8Array; password?: string; verbosity?: number }): {
    promise: Promise<PdfJsDocument>;
    destroy(): Promise<void>;
  };
  VerbosityLevel: { ERRORS: number };
  PasswordResponses: { NEED_PASSWORD: number; INCORRECT_PASSWORD: number };
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
}

interface PdfJsPage {
  getTextContent(): Promise<{ items: Array<PdfJsTextItem | { str?: undefined }> }>;
}

/**
 * Lazily load PDF.js, so it ends up in its own chunk in the browser build and never loads eagerly
 * under Vitest. The legacy build is used everywhere: it runs under Node without DOM APIs
 * (Worker, DOMMatrix, etc.) and in older browsers.
 */
async function loadPdfJs(): Promise<PdfJsModule> {
  const pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule & {
    GlobalWorkerOptions: { workerSrc: string };
  };
  if (typeof window !== 'undefined') {
    const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default as string;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjsLib;
}

export async function extractPdfText(data: ArrayBuffer | Uint8Array, password?: string): Promise<PdfTextResult> {
  const pdfjsLib = await loadPdfJs();
  // PDF.js may detach/transfer the buffer it's given, so hand it a copy.
  const bytes = new Uint8Array(data instanceof Uint8Array ? data.slice() : data.slice(0));

  const loadingTask = pdfjsLib.getDocument({ data: bytes, password, verbosity: pdfjsLib.VerbosityLevel.ERRORS });
  try {
    let doc: PdfJsDocument;
    try {
      doc = await loadingTask.promise;
    } catch (err) {
      const { name, code } = err as { name?: string; code?: number };
      if (name === 'PasswordException') {
        return { ok: false, reason: code === pdfjsLib.PasswordResponses.NEED_PASSWORD ? 'needsPassword' : 'wrongPassword' };
      }
      // Unreadable/corrupt data. pdfjs-dist 6 replaced MissingPDFException with ResponseException;
      // both names are accepted so a version change does not surface as an unexpected error.
      if (name && ['InvalidPDFException', 'UnknownErrorException', 'ResponseException', 'MissingPDFException'].includes(name)) {
        return { ok: false, reason: 'notPdf' };
      }
      throw err;
    }

    const pages: string[] = [];
    let hasText = false;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = content.items
        .filter((it): it is PdfJsTextItem => typeof it.str === 'string')
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
      const lines = itemsToLines(items);
      if (lines.some((l) => l.trim())) hasText = true;
      pages.push(lines.join('\n'));
    }
    if (!hasText) return { ok: false, reason: 'noText' };
    return { ok: true, pages };
  } finally {
    // Destroy on every path — success, a mapped failure reason, or a rethrown error —
    // otherwise a rejected loadingTask.promise (e.g. a wrong password) leaks its worker.
    await loadingTask.destroy();
  }
}
