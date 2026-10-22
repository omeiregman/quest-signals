import type { OddsFormat } from './types';

export function toDecimal(price: number | string, format: OddsFormat): number {
  if (format === 'decimal') {
    const v = Number(price);
    if (!(v > 1)) throw new Error(`Invalid decimal odds: ${price}`);
    return v;
  }
  if (format === 'american') {
    const v = Number(price);
    return v > 0 ? v / 100 + 1 : 100 / Math.abs(v) + 1;
  }
  // fractional, e.g. "5/2"
  const parts = String(price).split('/').map(Number);
  const num = parts[0];
  const den = parts[1];
  if (num === undefined || Number.isNaN(num) || !den || den <= 0) {
    throw new Error(`Invalid fractional odds: ${price}`);
  }
  return num / den + 1;
}
