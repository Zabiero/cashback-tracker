export function formatRM(n: number): string {
  const sign = n < 0 ? '-' : '';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${sign}RM${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}
