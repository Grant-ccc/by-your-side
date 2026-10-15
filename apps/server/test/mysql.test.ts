import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MysqlChatStore } from '../src/store.js';

test(
  'MySQL real roundtrip: concurrency dedupe, cursor, isolation and persistence after reconnect',
  { skip: process.env.TEST_MYSQL !== '1' },
  async () => {
    const store = new MysqlChatStore();
    let conversationId = '';
    try {
      await store.ready();
      await store.bootstrap();
      const conversation = await store.createConversation(`integration-${randomUUID()}`);
      conversationId = conversation.id;
      const clientRequestId = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          store.saveMessage(conversation.id, { clientRequestId, text: '数据库往返测试 🧸' }),
        ),
      );
      assert.equal(new Set(results.map((r) => r.message.id)).size, 1);
      assert.equal(results.filter((r) => !r.duplicate).length, 1);
      await assert.rejects(
        () =>
          store.saveMessage(conversation.id, {
            clientRequestId,
            text: 'same key different content',
          }),
        { code: 'REQUEST_CONFLICT' },
      );
      await store.saveMessage(conversation.id, { clientRequestId: randomUUID(), text: '第二条' });
      const first = await store.history(conversation.id, 0, 1);
      assert.equal(first.messages.length, 1);
      assert.equal(first.hasMore, true);
      const second = await store.history(conversation.id, first.nextCursor, 1);
      assert.equal(second.messages[0]?.text, '第二条');
      assert.equal(second.hasMore, false);
      await assert.rejects(() => store.history(randomUUID(), 0, 10), { code: 'NOT_FOUND' });
      const reconnected = new MysqlChatStore();
      try {
        const persisted = await reconnected.history(conversation.id, 0, 50);
        assert.equal(persisted.messages.length, 2);
        assert.equal(persisted.messages[0]?.text, '数据库往返测试 🧸');
      } finally {
        await reconnected.close();
      }
    } finally {
      // Delete only this run's freshly-created conversation and its cascade-owned messages.
      if (conversationId)
        await store.pool.execute('DELETE FROM conversations WHERE id=?', [conversationId]);
      await store.close();
    }
  },
);
