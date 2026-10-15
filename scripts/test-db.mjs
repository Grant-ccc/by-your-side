import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  [
    '--import',
    'tsx',
    '--test',
    'apps/server/test/mysql.test.ts',
    'apps/server/test/ai-mysql.test.ts',
  ],
  { stdio: 'inherit', env: { ...process.env, TEST_MYSQL: '1' }, windowsHide: true },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
