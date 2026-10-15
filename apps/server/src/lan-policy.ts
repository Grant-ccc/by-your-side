import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
export function privateIpv4(host: string): boolean {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168);
}
export function validDeviceToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
export function authorized(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  return timingSafeEqual(
    createHash('sha256').update(header.slice(7)).digest(),
    createHash('sha256').update(token).digest(),
  );
}
