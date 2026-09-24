import type { Settings } from '../engine/types';
import { daysBetween } from '../engine/dates';

export function needsBackupReminder(settings: Settings, transactionCount: number, today: string): boolean {
  if (transactionCount === 0) return false;
  return settings.lastBackupAt === null || daysBetween(settings.lastBackupAt.slice(0, 10), today) > 30;
}
