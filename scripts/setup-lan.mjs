import { networkInterfaces } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomBytes, X509Certificate } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, '.local/lan');
const privateIp = (value) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
const candidates = Object.entries(networkInterfaces())
  .flatMap(([name, values]) =>
    (values || [])
      .filter((v) => v.family === 'IPv4' && !v.internal && privateIp(v.address))
      .map((v) => ({ name, address: v.address })),
  )
  .filter((v) => !/vethernet|docker|wsl|loopback|virtual|vmware/i.test(v.name));
const hostFlag = process.argv.indexOf('--host');
const host =
  hostFlag >= 0
    ? process.argv[hostFlag + 1]
    : candidates.length === 1
      ? candidates[0].address
      : undefined;
if (!host || !candidates.some((v) => v.address === host)) {
  console.log(
    'Choose this computer’s active private LAN address with npm run setup:lan -- --host ADDRESS.',
  );
  console.log(JSON.stringify(candidates));
  process.exit(1);
}
await mkdir(directory, { recursive: true });
const configPath = resolve(directory, 'server.json');
let old;
try {
  old = JSON.parse(await readFile(configPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let reuse = false;
try {
  const cert = new X509Certificate(await readFile(resolve(directory, 'cert.pem')));
  await access(resolve(directory, 'key.pem'));
  reuse =
    old?.host === host &&
    cert.checkIP(host) === host &&
    Date.parse(cert.validTo) > Date.now() + 86400000 &&
    !process.argv.includes('--rotate');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!reuse) {
  const openssl =
    process.env.OPENSSL_PATH ||
    (process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : 'openssl');
  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:3072',
      '-nodes',
      '-sha256',
      '-days',
      '30',
      '-subj',
      '/CN=By Your Side Local Trial',
      '-addext',
      `subjectAltName=IP:${host},IP:127.0.0.1`,
      '-addext',
      'basicConstraints=critical,CA:FALSE',
      '-keyout',
      resolve(directory, 'key.pem'),
      '-out',
      resolve(directory, 'cert.pem'),
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
  );
}
const config = {
  host,
  port: old?.port || 17402,
  token: reuse ? old.token : randomBytes(32).toString('base64url'),
};
const cert = new X509Certificate(await readFile(resolve(directory, 'cert.pem')));
await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
await writeFile(
  resolve(directory, '手机连接配置.txt'),
  JSON.stringify(
    {
      version: 1,
      server: `https://${host}:${config.port}`,
      token: config.token,
      certificateSha256: cert.fingerprint256.replaceAll(':', '').toLowerCase(),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  `Prepared phone API at https://${host}:${config.port}. Copy the contents of .local/lan/手机连接配置.txt into the Android app; do not send it to chat or GitHub.`,
);
console.log(
  reuse
    ? 'Existing certificate and device credential retained.'
    : 'New certificate and device credential generated. Re-pair the phone if it was connected before.',
);
