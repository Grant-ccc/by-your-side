// Live local end-to-end check: React -> API -> real MySQL -> reload.
// Only the uniquely tagged message created by this run is removed afterward.
const { chromium } = require('playwright');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const { MysqlChatStore } = await import(
    pathToFileURL(path.resolve(__dirname, '../apps/server/dist/store.js')).href
  );
  const store = new MysqlChatStore();
  let browser;
  let saved;
  const text = `本地连通性检查 ${randomUUID()} 🧸`;
  try {
    await store.ready();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : { channel: 'msedge' }),
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:17400');
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await page.getByText('本地消息存储已连接', { exact: true }).waitFor();
    const posted = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('/messages'),
    );
    await page.getByLabel('聊天消息').fill(text);
    await page.getByRole('button', { name: '保存消息', exact: true }).click();
    const response = await posted;
    const payload = await response.json();
    saved = payload.message;
    assert.equal(response.status(), 201);
    assert.equal(saved.text, text);
    assert.equal(saved.role, 'user');
    assert.equal(payload.ai, 'not-configured');
    await page.reload();
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await page.getByText(text, { exact: true }).waitFor();
    const persisted = await store.history(saved.conversationId, Math.max(0, saved.sequence - 1), 1);
    assert.equal(persisted.messages[0]?.id, saved.id);
    assert.deepEqual(errors, []);
    console.log('PASS: real local React -> API -> MySQL save and browser reload; no AI call.');
  } finally {
    try {
      if (saved?.id && saved?.clientRequestId)
        await store.pool.execute(
          'DELETE FROM messages WHERE id=? AND client_request_id=? AND text=?',
          [saved.id, saved.clientRequestId, text],
        );
    } finally {
      await store.close();
      if (browser) await browser.close();
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
