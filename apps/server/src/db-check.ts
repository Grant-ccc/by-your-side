import mysql from 'mysql2/promise';
import { getConfig } from './config.js';
try {
  const connection = await mysql.createConnection(getConfig().database);
  try { await connection.query('SELECT 1'); await connection.query('SELECT name FROM schema_migrations'); console.log('MySQL connected; migration table is available.'); }
  finally { await connection.end(); }
} catch { console.error('MySQL is not ready. Start the local database and run npm run db:migrate.'); process.exitCode = 1; }
