import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
let local = {};
try {
  local = parseEnv(await readFile(resolve(root, '.env.local'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const env = { ...local, ...process.env };
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    [
      resolve(root, 'node_modules/vite/bin/vite.js'),
      '--config',
      'apps/web/vite.config.ts',
      '--host',
      '127.0.0.1',
      '--port',
      env.WEB_PORT || '17400',
      '--strictPort',
    ],
    { cwd: root, env, stdio: 'inherit', windowsHide: true },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code || 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
