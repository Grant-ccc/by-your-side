import mysql, { type RowDataPacket } from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getConfig, projectRoot } from './config.js';

export async function migrate() {
  const connection = await mysql.createConnection(getConfig().database);
  let locked = false;
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK('bys_schema_migrations', 10) AS acquired",
    );
    if (rows[0]?.acquired !== 1) throw new Error('Could not acquire migration lock');
    locked = true;
    await connection.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB',
    );
    const directory = resolve(projectRoot, 'database/migrations');
    for (const name of (await readdir(directory))
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
      .sort()) {
      const sql = await readFile(resolve(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const [existing] = await connection.execute<RowDataPacket[]>(
        'SELECT checksum FROM schema_migrations WHERE name=?',
        [name],
      );
      if (existing.length) {
        if (existing[0]?.checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        console.log(`Already applied: ${name}`);
        continue;
      }
      // MySQL DDL implicitly commits. If this fails, inspect partial schema rather than auto-retrying/destructively resetting.
      for (const statement of sql
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean))
        await connection.query(statement);
      await connection.execute('INSERT INTO schema_migrations (name, checksum) VALUES (?,?)', [
        name,
        checksum,
      ]);
      console.log(`Applied: ${name}`);
    }
  } finally {
    if (locked) await connection.query("DO RELEASE_LOCK('bys_schema_migrations')");
    await connection.end();
  }
}
try {
  await migrate();
} catch {
  console.error(
    'Migration failed. Check MySQL availability, .env.local credentials and partial schema. No automatic database reset was attempted.',
  );
  process.exitCode = 1;
}
