import { icsStamp, makeIcs } from './ics';
import { statement } from '../test/fixtures';

describe('makeIcs', () => {
  it('builds an all-day event with 9am alerts 3 days and 1 day before', () => {
    const ics = makeIcs(statement({ id: 'st1', dueDate: '2026-09-28', statementBalance: 1234.5, minimumDue: 50 }), 'UOB One', '20260926T101500Z');
    expect(ics).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Cashback Tracker//Bills//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        'UID:st1@cashback-tracker',
        'DTSTAMP:20260926T101500Z',
        'DTSTART;VALUE=DATE:20260928',
        'DTEND;VALUE=DATE:20260929',
        'SUMMARY:Pay UOB One: RM1\\,234.50 (min RM50.00)',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Pay UOB One: RM1\\,234.50 (min RM50.00)',
        'TRIGGER:-P2DT15H',
        'END:VALARM',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Pay UOB One: RM1\\,234.50 (min RM50.00)',
        'TRIGGER:-PT15H',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    );
  });
  it('escapes special characters and folds long lines at 75 characters', () => {
    const ics = makeIcs(statement({ id: 'x' }), 'My; very, long\\card name that goes on and on and on and on', '20260926T101500Z');
    const summary = ics.split('\r\n').filter((l) => l.startsWith('SUMMARY') || l.startsWith(' '));
    expect(summary[0].length).toBeLessThanOrEqual(75);
    expect(summary.join('\r\n').replace(/\r\n /g, '')).toContain('My\\; very\\, long\\\\card name');
  });
  it('formats the stamp in UTC', () => {
    expect(icsStamp(new Date(Date.UTC(2026, 8, 26, 10, 15, 0)))).toBe('20260926T101500Z');
  });
  it('handles emoji without splitting code points', () => {
    // Card name designed to push emoji across 75-byte boundary
    // 'Pay ' (4) + 'a'*50 (50) + '😀' (4 UTF-8 bytes) = would cross 75 at the emoji
    const cardName = 'a'.repeat(50) + '😀';
    const ics = makeIcs(statement({ id: 'emoji-test' }), cardName, '20260926T101500Z');

    // Extract all lines and verify byte lengths and character integrity
    const lines = ics.split('\r\n');
    lines.forEach((line) => {
      const bytes = new TextEncoder().encode(line);
      expect(bytes.length).toBeLessThanOrEqual(75);
    });

    // Unfold and verify emoji is preserved, not split
    const unfolded = ics.replace(/\r\n /g, '');
    const decoded = new TextDecoder().decode(new TextEncoder().encode(unfolded));
    expect(decoded).toContain('😀');
    expect(decoded).not.toContain('�'); // U+FFFD replacement character
  });
  it('handles multi-byte UTF-8 characters correctly', () => {
    // 'é' is 2 bytes in UTF-8, repeated to span multiple lines
    const cardName = 'é'.repeat(50); // 100 UTF-8 bytes worth of é
    const ics = makeIcs(statement({ id: 'multibyte-test' }), cardName, '20260926T101500Z');

    // Verify each line respects 75-byte limit
    const lines = ics.split('\r\n');
    lines.forEach((line) => {
      const bytes = new TextEncoder().encode(line);
      expect(bytes.length).toBeLessThanOrEqual(75);
    });

    // Verify character integrity after round-trip
    const unfolded = ics.replace(/\r\n /g, '');
    const decoded = new TextDecoder().decode(new TextEncoder().encode(unfolded));
    expect(decoded).toContain('é');
    expect(decoded).not.toContain('�');
  });
});
