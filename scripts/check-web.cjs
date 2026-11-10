const { chromium } = require('playwright');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const baseUrl = `http://127.0.0.1:${process.env.WEB_PORT || 17400}`;
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: 'msedge' }),
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');
    const liveHealth = await (await page.request.get(`${baseUrl}/health`)).json();
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    if (liveHealth.database === 'connected') {
      await page
        .locator('.chat-banner')
        .filter({ hasText: '正在读取聊天' })
        .waitFor({ state: 'hidden' });
      assert.equal(await page.getByLabel('聊天消息').isEnabled(), true);
    }
    // Explicitly exercise unavailable UI regardless of the actual database state.
    await page.route('**/health', (route) =>
      route.fulfill({
        status: 503,
        json: {
          status: 'degraded',
          database: 'unavailable',
          ai: 'not-configured',
          mode: 'local-development',
        },
      }),
    );
    await page.reload();
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await page.getByText('暂时无法连接', { exact: true }).waitFor();
    await page.getByLabel('聊天消息').fill('暂时发不出去的草稿');
    assert.equal(await page.getByRole('button', { name: '发送', exact: true }).isDisabled(), true);
    await mkdir('.local/screenshots', { recursive: true });
    await page.screenshot({ path: '.local/screenshots/react-database-unavailable.png' });
    // Browser-only fixtures verify interaction, not MySQL connectivity or AI.
    const conversationId = randomUUID(),
      saved = [],
      requestIds = [];
    let failFirst = true;
    await page.route('**/health', (route) =>
      route.fulfill({
        json: {
          status: 'ok',
          database: 'connected',
          ai: 'not-configured',
          mode: 'local-development',
        },
      }),
    );
    await page.route('**/api/bootstrap', (route) =>
      route.fulfill({
        json: {
          conversations: [
            { id: conversationId, title: '测试会话', createdAt: new Date().toISOString() },
          ],
          capabilities: { ai: false, storage: 'mysql', authentication: 'local-only' },
        },
      }),
    );
    await page.route('**/api/conversations/*/messages*', async (route) => {
      const request = route.request();
      if (request.method() === 'GET')
        return route.fulfill({
          json: { messages: saved, nextCursor: saved.at(-1)?.sequence || 0, hasMore: false },
        });
      const input = request.postDataJSON();
      requestIds.push(input.clientRequestId);
      let message = saved.find((m) => m.clientRequestId === input.clientRequestId);
      const duplicate = !!message;
      if (!message) {
        message = {
          id: randomUUID(),
          conversationId,
          sequence: saved.length + 1,
          clientRequestId: input.clientRequestId,
          text: input.text,
          role: 'user',
          status: 'saved',
          createdAt: new Date().toISOString(),
        };
        saved.push(message);
      }
      if (failFirst) {
        failFirst = false;
        return route.abort('failed');
      }
      return route.fulfill({
        status: duplicate ? 200 : 201,
        json: { message, duplicate, ai: 'not-configured' },
      });
    });
    await page.reload();
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await page.getByText('暂时只能保存消息', { exact: true }).waitFor();
    const multiline = '今天路过花店。\n门口的洋桔梗开了。';
    await page.getByLabel('聊天消息').fill(multiline);
    await page.getByRole('button', { name: '保存消息', exact: true }).click();
    await page.getByRole('button', { name: '重试保存（不会重复写入）' }).waitFor();
    assert.equal(await page.getByLabel('聊天消息').isDisabled(), true);
    await page.getByRole('button', { name: '重试保存（不会重复写入）' }).click();
    await page.locator('time.message-state').waitFor();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].text, multiline);
    assert.equal(requestIds[0], requestIds[1]);
    await page.reload();
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await page.getByText(saved[0].text, { exact: true }).waitFor();
    assert.equal(await page.locator('.bubble').count(), 1);
    await page.getByRole('button', { name: '日常', exact: true }).click();
    await page.getByRole('tab', { name: '习惯打卡' }).click();
    await page.getByRole('button', { name: '记录 ＋' }).first().click();
    await page.getByText('本次预览已记录 1 次', { exact: true }).waitFor();
    await page.getByRole('tab', { name: '备忘录' }).click();
    await page.getByRole('heading', { name: '留一段共同的时间' }).waitFor();
    await page.getByRole('button', { name: '回忆', exact: true }).click();
    await page.getByRole('heading', { name: '第一段回忆，正在路上' }).waitFor();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('heading', { name: '本阶段已经接入' }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.getByRole('button', { name: '日常', exact: true }).click();
    await page.screenshot({ path: '.local/screenshots/react-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.screenshot({ path: '.local/screenshots/react-desktop.png' });
    assert.deepEqual(errors, []);
    // AI UI fixture only: no paid request; verify typing, persistence rendering and explicit retry.
    await page.route('**/health', (route) =>
      route.fulfill({
        json: {
          status: 'ok',
          database: 'connected',
          ai: 'configured',
          mode: 'local-development',
        },
      }),
    );
    await page.route('**/api/ai', (route) =>
      route.fulfill({
        json: {
          configured: true,
          model: 'deepseek-flash',
          budget: { limit: 20, spent: 0.001, reserved: 0, currency: 'CNY' },
        },
      }),
    );
    let replyCalls = 0,
      releaseReply,
      replyFailure = false,
      replacementCalls = 0,
      replacementStatus = { state: 'idle' };
    let gate = new Promise((resolve) => {
      releaseReply = resolve;
    });
    await page.route(/\/messages\/[^/]+\/reply(?:\?replacement=1)?$/, async (route) => {
      const url = new URL(route.request().url());
      const sourceId = url.pathname.split('/').at(-2);
      const existing = saved.find((m) => m.replyToMessageId === sourceId);
      if (route.request().method() === 'GET') {
        if (url.searchParams.has('replacement'))
          return route.fulfill({ json: { ...replacementStatus, message: existing } });
        return route.fulfill({
          json: existing ? { state: 'succeeded', message: existing } : { state: 'idle' },
        });
      }
      const { replacement } = route.request().postDataJSON();
      if (replacement) {
        assert.equal(replacement.version, existing.version);
        replacementCalls++;
        if (replacementCalls === 1) {
          replacementStatus = {
            state: 'failed',
            error: {
              code: 'AI_RATE_LIMIT',
              message: '模型暂时繁忙，可以稍后手动重试。',
              retryable: true,
            },
          };
          return route.fulfill({ json: replacementStatus });
        }
        existing.text = '模拟的新回复，只替换最后一条。';
        existing.version++;
        replacementStatus = { state: 'succeeded' };
        return route.abort('failed'); // Response lost after saving the revised message.
      }
      replyCalls++;
      await gate;
      if (replyFailure)
        return route.fulfill({
          json: {
            state: 'failed',
            error: {
              code: 'AI_RATE_LIMIT',
              message: '模型暂时繁忙，可以稍后手动重试。',
              retryable: true,
            },
          },
        });
      const message = existing || {
        id: randomUUID(),
        conversationId,
        sequence: saved.length + 1,
        clientRequestId: null,
        role: 'assistant',
        text: '模拟回复：我听着，慢慢说。',
        status: 'saved',
        createdAt: new Date().toISOString(),
        replyToMessageId: sourceId,
        version: 1,
      };
      if (!existing) saved.push(message);
      return route.fulfill({ json: { state: 'succeeded', message } });
    });
    await page.reload();
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await page.getByLabel('聊天消息').fill('突然觉得，家里也该有一束花。');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '正在输入…' }).waitFor();
    assert.equal(await page.getByLabel('聊天消息').isDisabled(), true);
    releaseReply();
    await page.getByText('模拟回复：我听着，慢慢说。', { exact: true }).waitFor();
    assert.equal(replyCalls, 1);
    assert.equal(await page.locator('.chat-banner').count(), 0);
    await page.setViewportSize({ width: 360, height: 760 });
    await page.screenshot({ path: '.local/screenshots/chat-preview.png' });
    await page.reload();
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await page.getByText('模拟回复：我听着，慢慢说。', { exact: true }).waitFor();
    assert.equal(replyCalls, 1, 'reload must not generate again');
    replyFailure = true;
    await page.getByLabel('聊天消息').fill('失败测试');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByRole('button', { name: '重新尝试回复', exact: true }).waitFor();
    assert.equal(replyCalls, 2);
    replyFailure = false;
    await page.getByRole('button', { name: '重新尝试回复', exact: true }).click();
    await page.getByText('模拟回复：我听着，慢慢说。', { exact: true }).nth(1).waitFor();
    assert.equal(replyCalls, 3);
    const regenerate = page.getByRole('button', { name: '重生成最新回复', exact: true });
    const priorReply = page.getByText('模拟回复：我听着，慢慢说。', { exact: true });
    assert.equal(await regenerate.count(), 1);
    await regenerate.click();
    await page.getByText('模型暂时繁忙，可以稍后手动重试。', { exact: true }).waitFor();
    assert.equal(await priorReply.count(), 2);
    await regenerate.click();
    const checkReplacement = page.getByRole('button', { name: '检查重生成结果', exact: true });
    await checkReplacement.waitFor();
    assert.equal(await priorReply.count(), 2);
    assert.equal(await regenerate.count(), 0);
    await checkReplacement.click();
    const revised = page.getByText('模拟的新回复，只替换最后一条。', { exact: true });
    await revised.waitFor();
    assert.equal(await priorReply.count(), 1);
    assert.equal(replacementCalls, 2);
    await page.reload();
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await revised.waitFor();
    assert.equal(replacementCalls, 2, 'reload and read-only checks must not generate again');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: '.local/screenshots/react-ai-fixture.png' });
    console.log(
      'PASS: live health UI; simulated unavailable UI; save retry, AI typing/reply/retry/reload, replacement failure and read-only recovery, navigation and narrow layout. AI is mocked; no paid calls.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
