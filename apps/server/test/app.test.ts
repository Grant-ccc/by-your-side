import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Conversation, Message, SendMessage } from '@bys/shared';
import { buildApp } from '../src/app.js';
import { StoreError, type ChatStore } from '../src/store.js';
import { AiError } from '../src/ai-provider.js';
import type { ChatAi } from '../src/ai-chat.js';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, unlink, rmdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Deliberately test-only. Production never switches to this store if MySQL fails.
class TestStore implements ChatStore {
  available = true;
  closed = false;
  id = randomUUID();
  messages: Message[] = [];
  conversation: Conversation = { id: this.id, title: 'test', createdAt: new Date().toISOString() };
  async ready() {
    if (!this.available) throw new Error('database-password-must-not-leak');
  }
  async bootstrap() {
    await this.ready();
  }
  async conversations() {
    await this.ready();
    return [this.conversation];
  }
  async createConversation(title: string) {
    await this.ready();
    return { ...this.conversation, id: randomUUID(), title };
  }
  async history(id: string, after: number, limit: number) {
    await this.ready();
    if (id !== this.id) throw new StoreError('NOT_FOUND', '会话不存在');
    const rows = this.messages.filter((m) => m.sequence > after);
    return {
      messages: rows.slice(0, limit),
      nextCursor: rows.slice(0, limit).at(-1)?.sequence ?? after,
      hasMore: rows.length > limit,
    };
  }
  async saveMessage(id: string, input: SendMessage) {
    await this.ready();
    if (id !== this.id) throw new StoreError('NOT_FOUND', '会话不存在');
    const previous = this.messages.find((m) => m.clientRequestId === input.clientRequestId);
    if (previous) {
      if (previous.text !== input.text) throw new StoreError('REQUEST_CONFLICT', '请求冲突');
      return { message: previous, duplicate: true };
    }
    const message: Message = {
      id: randomUUID(),
      sequence: this.messages.length + 1,
      conversationId: id,
      clientRequestId: input.clientRequestId,
      role: 'user',
      text: input.text,
      status: 'saved',
      createdAt: new Date().toISOString(),
    };
    this.messages.push(message);
    return { message, duplicate: false };
  }
  async close() {
    this.closed = true;
  }
}

test('LAN API requires device credentials before reads/writes and still rejects hostile hosts/origins', async () => {
  const directory = resolve('.local', `tls-test-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const certFile = resolve(directory, 'cert.pem'),
    keyFile = resolve(directory, 'key.pem');
  let app;
  try {
    execFileSync(
      process.env.OPENSSL_PATH ||
        (process.platform === 'win32'
          ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
          : 'openssl'),
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=synthetic-test',
        '-keyout',
        keyFile,
        '-out',
        certFile,
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    const token = 'a'.repeat(43);
    app = buildApp(new TestStore(), {
      port: 17402,
      lan: {
        host: '192.168.1.2',
        token,
        cert: await readFile(certFile),
        key: await readFile(keyFile),
      },
    });
    for (const url of ['/health', '/api/bootstrap', '/api/ai', '/api/conversations']) {
      assert.equal(
        (await app.inject({ url, headers: { host: '192.168.1.2:17402' } })).statusCode,
        401,
      );
      assert.equal(
        (
          await app.inject({
            url,
            headers: { host: '192.168.1.2:17402', authorization: 'Bearer wrong' },
          })
        ).statusCode,
        401,
      );
    }
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/conversations',
          payload: { title: 'test' },
          headers: { host: '192.168.1.2:17402' },
        })
      ).statusCode,
      401,
    );
    const headers = { host: '192.168.1.2:17402', authorization: `Bearer ${token}` };
    assert.equal((await app.inject({ url: '/health', headers })).statusCode, 200);
    assert.equal(
      (await app.inject({ url: '/api/bootstrap', headers })).json().capabilities.authentication,
      'device-token',
    );
    assert.equal(
      (await app.inject({ url: '/health', headers: { ...headers, host: 'evil.example' } }))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: '/health',
          headers: { ...headers, origin: 'https://evil.example' },
        })
      ).statusCode,
      403,
    );
  } finally {
    if (app) await app.close();
    for (const file of [certFile, keyFile])
      try {
        await unlink(file);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    await rmdir(directory);
  }
});
test('messages are validated, idempotent and cursor paginated', async () => {
  const store = new TestStore(),
    app = buildApp(store);
  try {
    const id = randomUUID(),
      url = `/api/conversations/${store.id}/messages`;
    const first = await app.inject({
      method: 'POST',
      url,
      payload: { clientRequestId: id, text: '  今天找到 bug 了 🧸  ' },
    });
    assert.equal(first.statusCode, 201);
    assert.equal(first.json().message.text, '今天找到 bug 了 🧸');
    assert.equal(first.json().ai, 'not-configured');
    const duplicate = await app.inject({
      method: 'POST',
      url,
      payload: { clientRequestId: id, text: '今天找到 bug 了 🧸' },
    });
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json().message.id, first.json().message.id);
    assert.equal(store.messages.length, 1);
    const conflict = await app.inject({
      method: 'POST',
      url,
      payload: { clientRequestId: id, text: 'different' },
    });
    assert.equal(conflict.statusCode, 409);
    for (let i = 0; i < 2; i++)
      await app.inject({
        method: 'POST',
        url,
        payload: { clientRequestId: randomUUID(), text: `消息${i}` },
      });
    const history = await app.inject({ url: `${url}?after=0&limit=2` });
    assert.equal(history.json().messages.length, 2);
    assert.equal(history.json().hasMore, true);
    const next = await app.inject({ url: `${url}?after=${history.json().nextCursor}&limit=2` });
    assert.equal(next.json().messages.length, 1);
    assert.equal(next.json().hasMore, false);
  } finally {
    await app.close();
  }
  assert.equal(store.closed, true);
});
test('rejects empty/oversized messages, extra fields and invalid cursors', async () => {
  const store = new TestStore(),
    app = buildApp(store),
    url = `/api/conversations/${store.id}/messages`;
  try {
    for (const payload of [
      { clientRequestId: randomUUID(), text: '   ' },
      { clientRequestId: 'bad', text: 'hi' },
      { clientRequestId: randomUUID(), text: 'a'.repeat(2001) },
      { clientRequestId: randomUUID(), text: 'hi', userId: 'someone-else' },
    ])
      assert.equal((await app.inject({ method: 'POST', url, payload })).statusCode, 400);
    for (const query of [
      'after=-1',
      'after=1.5',
      'after=9007199254740992',
      'limit=101',
      'limit=0',
      'after=1;DROP',
    ])
      assert.equal((await app.inject({ url: `${url}?${query}` })).statusCode, 400);
    assert.equal(
      (await app.inject({ url: '/api/conversations/not-a-uuid/messages' })).statusCode,
      400,
    );
    assert.equal(store.messages.length, 0);
  } finally {
    await app.close();
  }
});
test('unknown conversations cannot be read or written', async () => {
  const app = buildApp(new TestStore());
  try {
    const url = `/api/conversations/${randomUUID()}/messages`;
    assert.equal((await app.inject({ url })).statusCode, 404);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url,
          payload: { clientRequestId: randomUUID(), text: 'test' },
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});
test('database outages are explicit and do not leak underlying errors or pretend to save', async () => {
  const store = new TestStore();
  store.available = false;
  const app = buildApp(store);
  try {
    const health = await app.inject({ url: '/health' });
    assert.equal(health.statusCode, 503);
    assert.equal(health.json().database, 'unavailable');
    const message = await app.inject({
      method: 'POST',
      url: `/api/conversations/${store.id}/messages`,
      payload: { clientRequestId: randomUUID(), text: 'cannot save' },
    });
    assert.equal(message.statusCode, 503);
    assert.equal(message.json().error.code, 'DATABASE_UNAVAILABLE');
    assert.ok(!message.body.includes('password'));
    assert.equal(store.messages.length, 0);
  } finally {
    await app.close();
  }
});
test('local development API rejects hostile origins and DNS rebinding hosts', async () => {
  const app = buildApp(new TestStore());
  try {
    assert.equal(
      (await app.inject({ url: '/health', headers: { host: 'evil.example' } })).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ url: '/api/bootstrap', headers: { origin: 'https://evil.example' } }))
        .statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ url: '/health', headers: { 'sec-fetch-site': 'cross-site' } }))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: '/health',
          headers: { host: '127.0.0.1:17401', origin: 'http://127.0.0.1:17400' },
        })
      ).statusCode,
      200,
    );
  } finally {
    await app.close();
  }
});
test('bootstrap and conversation creation have an explicit AI-disabled capability', async () => {
  const app = buildApp(new TestStore());
  try {
    assert.equal((await app.inject({ url: '/api/bootstrap' })).json().capabilities.ai, false);
    const created = await app.inject({
      method: 'POST',
      url: '/api/conversations',
      payload: { title: '  新会话  ' },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().conversation.title, '新会话');
  } finally {
    await app.close();
  }
});

test('AI routes validate IDs and retry flags, read status without generating, and sanitize typed failures', async () => {
  const store = new TestStore();
  let calls = 0;
  const ai: ChatAi = {
    configured: true,
    async budget() {
      return { limit: 20, spent: 0, reserved: 0, currency: 'CNY' };
    },
    async status() {
      return { state: 'idle' };
    },
    async reply(_id, _source, retry) {
      calls++;
      if (retry) throw new AiError('AI_BUDGET_EXCEEDED', '本月预算不足', 409);
      return { state: 'running' };
    },
  };
  const app = buildApp(store, { ai });
  const url = `/api/conversations/${store.id}/messages/${randomUUID()}/reply`;
  try {
    assert.equal((await app.inject({ url: '/health' })).json().ai, 'configured');
    assert.equal((await app.inject({ url: '/api/ai' })).json().budget.limit, 20);
    assert.equal((await app.inject({ url })).json().state, 'idle');
    assert.equal(calls, 0);
    assert.equal(
      (await app.inject({ method: 'POST', url, payload: { retry: false, apiKey: 'forbidden' } }))
        .statusCode,
      400,
    );
    assert.equal(
      (await app.inject({ method: 'POST', url: url.replace(store.id, 'invalid'), payload: {} }))
        .statusCode,
      400,
    );
    assert.equal(calls, 0);
    assert.equal((await app.inject({ method: 'POST', url, payload: {} })).json().state, 'running');
    const denied = await app.inject({ method: 'POST', url, payload: { retry: true } });
    assert.equal(denied.statusCode, 409);
    assert.equal(denied.json().error.code, 'AI_BUDGET_EXCEEDED');
  } finally {
    await app.close();
  }
});
