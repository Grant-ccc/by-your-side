// Simulated native bridge: UI verification only, no real APK or model requests.
const { chromium } = require('playwright');
const { mkdir } = require('node:fs/promises');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: 'msedge' }),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.androidBridge = {};
      window.__tlsFailure = false;
      window.__generationCalls = 0;
      const id = '00000000-0000-4000-8000-000000000004';
      window.Capacitor = {
        PluginHeaders: [
          {
            name: 'LanApi',
            methods: ['connection', 'configure', 'forget', 'request'].map((name) => ({
              name,
              rtype: 'promise',
            })),
          },
        ],
        async nativePromise(_plugin, method, options = {}) {
          let config = JSON.parse(localStorage.getItem('test:pairing') || 'null');
          if (method === 'connection')
            return { configured: !!config, server: config?.server || '' };
          if (method === 'forget') {
            localStorage.removeItem('test:pairing');
            return;
          }
          if (method === 'configure') {
            try {
              config = JSON.parse(options.pairing);
              if (config.version !== 1 || !config.token || !config.certificateSha256)
                throw new Error();
            } catch {
              throw new Error('连接配置格式不正确，请完整复制电脑生成的配置。');
            }
            localStorage.setItem('test:pairing', JSON.stringify(config));
            return { configured: true, server: config.server };
          }
          if (method !== 'request') throw new Error('Unknown mock method');
          if (!config) throw new Error('请先在设置里粘贴电脑的连接配置。');
          if (window.__tlsFailure)
            throw new Error('电脑证书验证失败，请核对时间，或重新粘贴电脑当前生成的配置。');
          if (config.token !== 'a'.repeat(43))
            return {
              status: 401,
              data: {
                error: {
                  code: 'DEVICE_UNAUTHORIZED',
                  message: '连接凭据不正确，请重新粘贴电脑上的连接配置。',
                },
              },
            };
          if (options.path === '/health')
            return {
              status: 200,
              data: {
                status: 'ok',
                database: 'connected',
                ai: 'not-configured',
                mode: 'local-development',
              },
            };
          if (options.path === '/api/bootstrap')
            return {
              status: 200,
              data: {
                conversations: [{ id, title: '模拟手机会话', createdAt: new Date().toISOString() }],
              },
            };
          if (options.path.includes('/messages?'))
            return { status: 200, data: { messages: [], nextCursor: 0, hasMore: false } };
          if (options.path.endsWith('/reply')) window.__generationCalls++;
          throw new Error('Unexpected mock request');
        },
      };
    });
    await page.goto('http://127.0.0.1:17400');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('heading', { name: '连接我的电脑' }).waitFor();
    await page.getByLabel('电脑连接配置').fill('invalid');
    await page.getByRole('button', { name: '保存并连接', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '配置格式不正确' }).waitFor();
    const pairing = {
      version: 1,
      server: 'https://192.168.1.100:17402',
      certificateSha256: 'f'.repeat(64),
      token: 'b'.repeat(43),
    };
    await page.getByLabel('电脑连接配置').fill(JSON.stringify(pairing));
    await page.getByRole('button', { name: '保存并连接', exact: true }).click();
    await page.getByText('连接凭据不正确，请重新粘贴电脑上的连接配置。', { exact: true }).waitFor();
    pairing.token = 'a'.repeat(43);
    await page.getByLabel('电脑连接配置').fill(JSON.stringify(pairing));
    await page.getByRole('button', { name: '保存并连接', exact: true }).click();
    await page
      .locator('.settings-group')
      .first()
      .getByText('MySQL 已连接 · AI 待配置密钥', { exact: false })
      .waitFor();
    assert.equal(await page.getByLabel('电脑连接配置').inputValue(), '');
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page
      .locator('.settings-group')
      .first()
      .getByText('MySQL 已连接 · AI 待配置密钥', { exact: false })
      .waitFor();
    await page.evaluate(() => {
      window.__tlsFailure = true;
    });
    await page.getByRole('button', { name: '重新连接与读取历史', exact: true }).click();
    await page
      .getByText('电脑证书验证失败，请核对时间，或重新粘贴电脑当前生成的配置。', { exact: true })
      .waitFor();
    assert.ok(
      !(await page.locator('.settings-group').first().innerText()).includes('数据库尚未就绪'),
    );
    await mkdir('.local/screenshots', { recursive: true });
    await page.screenshot({ path: '.local/screenshots/android-connection-fixture.png' });
    assert.equal(await page.evaluate(() => window.__generationCalls), 0);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: simulated Android connection UI, invalid configuration, wrong credential, successful setup, cleared credential input, reload and TLS error; no model requests. This is not a real-device test.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
