import { formatRM } from '../lib/money';

export function Money({ value, size = 'md' }: { value: number; size?: 'hero' | 'lg' | 'md' }) {
  return <span className={`amount amount-${size}`}>{formatRM(value)}</span>;
}
