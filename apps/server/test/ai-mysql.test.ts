import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { MysqlChatStore } from '../src/store.js';
import { MysqlChatAi } from '../src/ai-chat.js';
import {
  AiError,
  context,
  inputBound,
  MAX_OUTPUT,
  type AiConfig,
  type AiProvider,
} from '../src/ai-provider.js';

test(
  'real MySQL AI ledger: persistence, dedupe, concurrency, retries, unknown outcomes, ownership and budget',
  { skip: process.env.TEST_MYSQL !== '1' },
  async () => {
    // Isolated synthetic principal, no paid requests and no changes to the user's budget or chats.
    const store = new MysqlChatStore(),
      pool = store.pool;
    const userId = randomUUID(),
      characterId = randomUUID(),
      relationshipId = randomUUID();
    const ids: string[] = [];
    const config: AiConfig = {
      key: 'fixture-not-real',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen3.7-plus',
      monthlyLimit: 0.08,
    };
    let calls = 0,
      fail = '',
      unblock: (() => void) | null = null;
    const provider: AiProvider = {
      async complete() {
        calls++;
        if (unblock)
          await new Promise<void>((resolve) => {
            unblock = resolve;
          });
        if (fail) throw new AiError(fail, 'fixture');
        return { text: '测试回复，不是真实 AI。', promptTokens: 1000, completionTokens: 12 };
      },
    };
    const ai = new MysqlChatAi(pool, config, provider, { userId, relationshipId });
    const create = async () => {
      const conversationId = randomUUID(),
        sourceId = randomUUID();
      ids.push(conversationId);
      await pool.execute('INSERT INTO conversations (id,relationship_id,title) VALUES (?,?,?)', [
        conversationId,
        relationshipId,
        'AI fixture',
      ]);
      await pool.execute(
        "INSERT INTO messages (id,conversation_id,role,text) VALUES (?,?,'user',?)",
        [sourceId, conversationId, '测试文本'],
      );
      return { conversationId, sourceId };
    };
    try {
      await pool.execute('INSERT INTO users (id,display_name) VALUES (?,?)', [userId, 'test']);
      await pool.execute('INSERT INTO characters (id,name) VALUES (?,?)', [characterId, 'test']);
      await pool.execute(
        'INSERT INTO relationships (id,user_id,character_id,settings) VALUES (?,?,?,?)',
        [relationshipId, userId, characterId, '{}'],
      );
      const first = await create();
      assert.equal((await ai.status(first.conversationId, first.sourceId)).state, 'idle');
      assert.equal(calls, 0);
      const success = await ai.reply(first.conversationId, first.sourceId, false);
      assert.equal(success.state, 'succeeded');
      assert.equal(success.message?.replyToMessageId, first.sourceId);
      assert.equal(
        (await ai.reply(first.conversationId, first.sourceId, true)).message?.id,
        success.message?.id,
      );
      assert.equal(calls, 1);
      assert.equal(
        (
          await new MysqlChatAi(pool, config, provider, { userId, relationshipId }).status(
            first.conversationId,
            first.sourceId,
          )
        ).message?.id,
        success.message?.id,
      );
      await assert.rejects(() => ai.reply(first.conversationId, randomUUID(), false), {
        code: 'NOT_FOUND',
      });
      await assert.rejects(
        () => new MysqlChatAi(pool, config, provider).status(first.conversationId, first.sourceId),
        { code: 'NOT_FOUND' },
      );
      const second = await create();
      fail = 'AI_RATE_LIMIT';
      assert.equal(
        (await ai.reply(second.conversationId, second.sourceId, false)).error?.retryable,
        true,
      );
      const count = calls;
      await ai.reply(second.conversationId, second.sourceId, false);
      assert.equal(calls, count);
      fail = '';
      assert.equal(
        (await ai.reply(second.conversationId, second.sourceId, true)).state,
        'succeeded',
      );
      const third = await create();
      fail = 'AI_UNCERTAIN';
      assert.equal(
        (await ai.reply(third.conversationId, third.sourceId, false)).error?.retryable,
        false,
      );
      const unknownCalls = calls;
      await ai.reply(third.conversationId, third.sourceId, true);
      assert.equal(calls, unknownCalls);
      fail = '';
      const concurrent = await create();
      unblock = () => {};
      const running = ai.reply(concurrent.conversationId, concurrent.sourceId, false);
      // Wait for the committed running row, rather than a fixed timing assumption.
      for (let i = 0; i < 100; i++) {
        if ((await ai.status(concurrent.conversationId, concurrent.sourceId)).state === 'running')
          break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(
        (await ai.status(concurrent.conversationId, concurrent.sourceId)).state,
        'running',
      );
      await assert.rejects(() => ai.reply(concurrent.conversationId, concurrent.sourceId, false), {
        code: 'AI_BUSY',
      });
      unblock!();
      unblock = null;
      await running;
      assert.equal((await ai.budget()).reserved, 0);
      const [runs] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM generation_runs WHERE conversation_id=?',
        [third.conversationId],
      );
      assert.equal(runs[0]?.actual_cost, null);
      const [budgets] = await pool.execute<RowDataPacket[]>(
        'SELECT id,spent_amount FROM budget_periods WHERE user_id=?',
        [userId],
      );
      // Leave just enough for one reservation; two different conversations compete for the same budget.
      const reservation =
        (inputBound(context([{ role: 'user', content: '测试文本' }])) * 2 + (MAX_OUTPUT + 10) * 8) /
        1e6;
      await pool.execute('UPDATE budget_periods SET spent_amount=? WHERE id=?', [
        config.monthlyLimit - reservation - 0.001,
        budgets[0]!.id,
      ]);
      const one = await create(),
        two = await create();
      const beforeBudgetCalls = calls;
      const outcomes = await Promise.allSettled([
        ai.reply(one.conversationId, one.sourceId, false),
        ai.reply(two.conversationId, two.sourceId, false),
      ]);
      assert.ok(
        outcomes.some((r) => r.status === 'rejected' && r.reason.code === 'AI_BUDGET_EXCEEDED'),
      );
      assert.equal(calls, beforeBudgetCalls + 1);
      // Crash-style persisted running row is never automatically dispatched a second time.
      const stalled = await create();
      await pool.execute(
        "INSERT INTO generation_runs (id,conversation_id,request_key,state,source_message_id,attempt) VALUES (?,?,?,'running',?,1)",
        [randomUUID(), stalled.conversationId, `${stalled.sourceId}:1`, stalled.sourceId],
      );
      const beforeStall = calls;
      assert.equal(
        (await ai.reply(stalled.conversationId, stalled.sourceId, false)).state,
        'running',
      );
      assert.equal(calls, beforeStall);
    } finally {
      if (unblock) unblock();
      for (const id of ids) await pool.execute('DELETE FROM conversations WHERE id=?', [id]);
      await pool.execute('DELETE FROM budget_periods WHERE user_id=?', [userId]);
      await pool.execute('DELETE FROM relationships WHERE id=?', [relationshipId]);
      await pool.execute('DELETE FROM characters WHERE id=?', [characterId]);
      await pool.execute('DELETE FROM users WHERE id=?', [userId]);
      await store.close();
    }
  },
);
