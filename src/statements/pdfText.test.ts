// @vitest-environment node
import PDFDocument from 'pdfkit';
import { extractPdfText, itemsToLines } from './pdfText';

// Spy on the destroy() of every loading task pdfText.ts creates, by wrapping the real
// pdfjs-dist module it dynamically imports (Node/Vitest path). Delegates to the actual
// implementation throughout, so extraction behaviour is unaffected.
let lastDestroy: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
// When set, the next getDocument() call's loading task rejects with this error instead.
let failNextWith: { name: string; message: string } | undefined;

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>();
  return {
    ...actual,
    getDocument: (src: Parameters<typeof actual.getDocument>[0]) => {
      if (failNextWith) {
        const error = failNextWith;
        failNextWith = undefined;
        lastDestroy = vi.fn<() => Promise<void>>(async () => {});
        return { promise: Promise.reject(Object.assign(new Error(error.message), { name: error.name })), destroy: lastDestroy };
      }
      const task = actual.getDocument(src);
      lastDestroy = vi.fn<() => Promise<void>>(task.destroy.bind(task));
      task.destroy = lastDestroy;
      return task;
    },
  };
});

function makePdf(lines: Array<[string, number, number]>, userPassword?: string): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const doc = new PDFDocument(userPassword ? { userPassword, ownerPassword: 'owner-pw', pdfVersion: '1.7' } : {});
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    for (const [text, x, y] of lines) doc.text(text, x, y, { lineBreak: false });
    doc.end();
  });
}

describe('itemsToLines', () => {
  it('groups items into lines top to bottom, left to right', () => {
    expect(
      itemsToLines([
        { str: 'Due', x: 300, y: 700 },
        { str: 'Payment', x: 100, y: 701 },
        { str: '28/09/2026', x: 100, y: 680 },
        { str: '  ', x: 50, y: 680 },
      ]),
    ).toEqual(['Payment Due', '28/09/2026']);
  });
});

describe('extractPdfText', () => {
  it('extracts lines from a text PDF', async () => {
    const pdf = await makePdf([['Payment Due Date', 72, 100], ['28/09/2026', 300, 100], ['Minimum Payment 50.00', 72, 140]]);
    const r = await extractPdfText(pdf);
    expect(r.ok && r.pages[0].split('\n')).toEqual(['Payment Due Date 28/09/2026', 'Minimum Payment 50.00']);
  });
  it('reports password problems', async () => {
    const pdf = await makePdf([['Secret', 72, 100]], 'pw123');
    expect(await extractPdfText(pdf.slice())).toEqual({ ok: false, reason: 'needsPassword' });
    expect(await extractPdfText(pdf.slice(), 'wrong')).toEqual({ ok: false, reason: 'wrongPassword' });
    const r = await extractPdfText(pdf.slice(), 'pw123');
    expect(r.ok && r.pages[0]).toBe('Secret');
  });
  it('rejects non-PDF data and PDFs without text', async () => {
    expect(await extractPdfText(new TextEncoder().encode('not a pdf'))).toEqual({ ok: false, reason: 'notPdf' });
    expect(await extractPdfText(await makePdf([]))).toEqual({ ok: false, reason: 'noText' });
  });
  it.each(['UnknownErrorException', 'ResponseException', 'MissingPDFException'])('maps %s to notPdf', async (name) => {
    failNextWith = { name, message: 'broken' };
    expect(await extractPdfText(new Uint8Array([37, 80, 68, 70]))).toEqual({ ok: false, reason: 'notPdf' });
    expect(lastDestroy).toHaveBeenCalledTimes(1);
  });
  it('destroys the loading task even when loading fails', async () => {
    const pdf = await makePdf([['Secret', 72, 100]], 'pw123');

    await extractPdfText(pdf.slice());
    expect(lastDestroy).toHaveBeenCalledTimes(1);

    await extractPdfText(new TextEncoder().encode('not a pdf'));
    expect(lastDestroy).toHaveBeenCalledTimes(1);
  });
});
