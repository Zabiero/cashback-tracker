import { needsBackupReminder } from './backupReminder';
import { DEFAULT_SETTINGS } from '../data/repository';

describe('needsBackupReminder', () => {
  it('stays quiet with no data', () => {
    expect(needsBackupReminder(DEFAULT_SETTINGS, 0, '2026-09-24')).toBe(false);
  });
  it('reminds when never backed up', () => {
    expect(needsBackupReminder(DEFAULT_SETTINGS, 3, '2026-09-24')).toBe(true);
  });
  it('reminds only after more than 30 days', () => {
    expect(needsBackupReminder({ ...DEFAULT_SETTINGS, lastBackupAt: '2026-08-25' }, 3, '2026-09-24')).toBe(false);
    expect(needsBackupReminder({ ...DEFAULT_SETTINGS, lastBackupAt: '2026-08-24' }, 3, '2026-09-24')).toBe(true);
  });
});
