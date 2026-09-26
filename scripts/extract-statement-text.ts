// Dev-only helper: extracts text from a bank statement PDF into a sibling .txt file
// so its layout can be inspected while writing a bank reader (Task 6/7).
//
// Usage: npm run extract-statement -- "statements-samples/<file>.pdf" [password]
//
// Only ever reads/writes inside statements-samples/ (git-ignored; holds real
// statements) — refuses any path that resolves outside it.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractPdfText } from '../src/statements/pdfText';

const SAMPLES_DIR = path.resolve(process.cwd(), 'statements-samples');

/** Resolves `input` relative to the cwd and throws unless it stays inside statements-samples/. */
function resolveInsideSamplesDir(input: string): string {
  const resolved = path.resolve(process.cwd(), input);
  const rel = path.relative(SAMPLES_DIR, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to access a path outside statements-samples/: ${input}`);
  }
  return resolved;
}

async function main(): Promise<void> {
  const [, , inputArg, password] = process.argv;
  if (!inputArg) {
    console.log('Usage: npm run extract-statement -- "statements-samples/<file>.pdf" [password]');
    process.exitCode = 1;
    return;
  }

  const pdfPath = resolveInsideSamplesDir(inputArg);
  const outPath = resolveInsideSamplesDir(`${inputArg}.txt`);

  const data = await readFile(pdfPath);
  const result = await extractPdfText(data, password);
  if (!result.ok) {
    console.log(result.reason);
    process.exitCode = 1;
    return;
  }

  await writeFile(outPath, result.pages.join('\n\n--- page break ---\n\n'), 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err: unknown) => {
  console.log(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
