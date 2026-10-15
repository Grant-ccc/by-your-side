import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { buildApp } from './app.js';
import { getConfig, projectRoot } from './config.js';
import { MysqlChatStore } from './store.js';
import { aiConfig, DeepSeekProvider } from './ai-provider.js';
import { MysqlChatAi } from './ai-chat.js';
import { privateIpv4, validDeviceToken } from './lan-policy.js';
const settings = z.object({
  host: z.string().refine(privateIpv4),
  port: z.number().int().min(1024).max(65535),
  token: z.string().refine(validDeviceToken),
});
try {
  const local = settings.parse(
    JSON.parse(await readFile(resolve(projectRoot, '.local/lan/server.json'), 'utf8')),
  );
  const [cert, key] = await Promise.all(
    ['cert.pem', 'key.pem'].map((name) => readFile(resolve(projectRoot, '.local/lan', name))),
  );
  const store = new MysqlChatStore();
  const model = aiConfig();
  const app = buildApp(store, {
    port: local.port,
    webPort: getConfig().webPort,
    logger: true,
    ai: new MysqlChatAi(store.pool, model, new DeepSeekProvider(model)),
    lan: { host: local.host, token: local.token, cert: cert!, key: key! },
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close();
    });
  await app.listen({ host: local.host, port: local.port });
  console.log(
    `Phone HTTPS API ready at https://${local.host}:${local.port}; pairing configuration stays in .local/lan/手机连接配置.txt`,
  );
} catch {
  console.error(
    'Phone API could not start. Run npm run setup:lan and check the chosen LAN address, port, certificate and MySQL. No secret values were printed.',
  );
  process.exitCode = 1;
}
