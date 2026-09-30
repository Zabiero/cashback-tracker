import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom doesn't lay out CSS, so these pin the stylesheet rules that fixed real layout bugs.
const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))![1];

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

it('muted text is readable (WCAG AA 4.5:1) on the page background', () => {
  expect(contrast(token('muted'), token('bg'))).toBeGreaterThanOrEqual(4.5);
});

it('keeps the sidebar and content clear of the notch in landscape', () => {
  expect(css).toMatch(/\.nav \{[^}]*env\(safe-area-inset-left\)/);
  expect(css).toMatch(/\.main \{[^}]*env\(safe-area-inset-right\)/);
});

it('keeps inline checkbox labels inline (rule editor groups)', () => {
  expect(css).toMatch(/label\.inline:has\(> input\[type="checkbox"\]\)[^{]*\{[^}]*display: inline-flex/);
});
