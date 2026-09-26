import type { Statement } from '../engine/types';
import { addDays } from '../engine/dates';
import { formatRM } from '../lib/money';

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 line folding: max 75 octets per line, continuation lines start with a space. */
function fold(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    const chars = Array.from(rest);
    let current = '';
    let i = 0;
    // Accumulate characters while UTF-8 byte length stays ≤ 75
    while (i < chars.length) {
      const candidate = current + chars[i];
      const byteLength = new TextEncoder().encode(candidate).length;
      if (byteLength <= 75) {
        current = candidate;
        i++;
      } else {
        break;
      }
    }
    out.push(current);
    rest = ' ' + chars.slice(i).join('');
  }
  out.push(rest);
  return out;
}

export function icsStamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

/** All-day event on the due date; alerts at 09:00 three days and one day before. */
export function makeIcs(s: Statement, cardName: string, stamp: string): string {
  const day = (iso: string) => iso.replace(/-/g, '');
  const summary = escapeText(`Pay ${cardName}: ${formatRM(s.statementBalance)} (min ${formatRM(s.minimumDue)})`);
  const alarm = (trigger: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${summary}`, `TRIGGER:${trigger}`, 'END:VALARM'];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cashback Tracker//Bills//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${s.id}@cashback-tracker`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(s.dueDate)}`,
    `DTEND;VALUE=DATE:${day(addDays(s.dueDate, 1))}`,
    `SUMMARY:${summary}`,
    ...alarm('-P2DT15H'),
    ...alarm('-PT15H'),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}
