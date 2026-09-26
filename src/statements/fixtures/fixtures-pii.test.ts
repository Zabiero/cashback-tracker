import { PII_PATTERNS as PII } from '../redact';

const fixtures = import.meta.glob<string>('./*.txt', { query: '?raw', import: 'default', eager: true });

describe('statement fixtures contain no personal data', () => {
  it('finds the fixtures', () => {
    expect(Object.keys(fixtures).length).toBeGreaterThan(0);
  });

  describe.each(Object.entries(fixtures))('%s', (_name, text) => {
    it.each(PII)('has no %s', (_label, pattern) => {
      expect(text).not.toMatch(pattern);
    });
  });
});
