import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
loadEnv({ path: resolve(projectRoot, '.env.local'), quiet: true });
export function integer(value: string | undefined, fallback: number): number {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < 1 || number > 65535)
    throw new Error('Invalid port configuration');
  return number;
}
export function getConfig() {
  const host = process.env.API_HOST || '127.0.0.1';
  if (host !== '127.0.0.1')
    throw new Error(
      'This development server only supports API_HOST=127.0.0.1. Production authentication is not implemented.',
    );
  const database = process.env.DB_NAME || 'by_your_side';
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('Invalid database name');
  return {
    host,
    port: integer(process.env.API_PORT, 17401),
    webPort: integer(process.env.WEB_PORT, 17400),
    database: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: integer(process.env.DB_PORT, 3307),
      database,
      user: process.env.DB_USER || 'by_your_side',
      password: process.env.DB_PASSWORD || '',
      timezone: 'Z',
      charset: 'utf8mb4',
      connectionLimit: 5,
      connectTimeout: 3000,
    },
  };
}
