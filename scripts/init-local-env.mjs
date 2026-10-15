import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const target = new URL('../.env.local', import.meta.url);
const password = () => randomBytes(24).toString('hex');
const content = `API_HOST=127.0.0.1\nAPI_PORT=17401\nWEB_PORT=17400\nDB_HOST=127.0.0.1\nDB_PORT=3307\nDB_NAME=by_your_side\nDB_USER=by_your_side\nDB_PASSWORD=${password()}\nMYSQL_ROOT_PASSWORD=${password()}\nDASHSCOPE_API_KEY=\nDASHSCOPE_WORKSPACE_ID=\nAI_MODEL=qwen3.7-plus\nAI_MONTHLY_LIMIT_CNY=20\n`;
try {
  await writeFile(target, content, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .env.local with random local database credentials.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.local already exists; no settings were overwritten.');
}
