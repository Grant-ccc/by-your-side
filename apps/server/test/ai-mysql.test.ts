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
  type ChatTurn,
} from '../src/ai-provider.js';

test(
  'real MySQL AI ledger: persistence, dedupe, concurrency, retries, replacement, ownership and budget',
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
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      monthlyLimit: 0.08,
    };
    let calls = 0,
      fail = '',
      unblock: (() => void) | null = null;
    let generatedText = '测试回复，不是真实 AI。';
    let lastTurns: ChatTurn[] = [];
    const provider: AiProvider = {
      async complete(turns) {
        calls++;
        lastTurns = turns;
        if (unblock)
          await new Promise<void>((resolve) => {
            unblock = resolve;
          });
        if (fail) throw new AiError(fail, 'fixture');
        return { text: generatedText, promptTokens: 1000, completionTokens: 12 };
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
      const replace = (version: number, requestId = randomUUID()) =>
        ai.reply(first.conversationId, first.sourceId, false, { version, requestId });
      const replacementStatus = () => ai.status(first.conversationId, first.sourceId, true);
      assert.equal((await replacementStatus()).state, 'idle');
      assert.equal(success.message?.version, 1);
      await assert.rejects(
        () =>
          new MysqlChatAi(pool, { ...config, monthlyLimit: 0 }, provider, {
            userId,
            relationshipId,
          }).reply(first.conversationId, first.sourceId, false, {
            version: 1,
            requestId: randomUUID(),
          }),
        { code: 'AI_BUDGET_EXCEEDED' },
      );
      assert.equal(calls, 1);
      const failedRequest = randomUUID();
      fail = 'AI_RATE_LIMIT';
      assert.equal((await replace(1, failedRequest)).state, 'failed');
      assert.equal((await replacementStatus()).message?.text, success.message?.text);
      fail = '';
      const beforeReplay = calls;
      assert.equal((await replace(1, failedRequest)).state, 'failed');
      assert.equal(calls, beforeReplay);

      generatedText = '这一句替换了原来的回复。';
      const successfulRequest = randomUUID();
      const revised = await replace(1, successfulRequest);
      assert.equal(revised.state, 'succeeded');
      assert.equal(revised.message?.version, 2);
      assert.equal(revised.message?.id, success.message?.id);
      assert.equal(revised.message?.sequence, success.message?.sequence);
      assert.equal(revised.message?.createdAt, success.message?.createdAt);
      assert.equal(revised.message?.text, generatedText);
      assert.equal((await replacementStatus()).message?.text, generatedText);
      assert.equal((await replace(1, successfulRequest)).message?.version, 2);
      assert.equal(calls, beforeReplay + 1);
      await assert.rejects(() => replace(1), { code: 'AI_REPLY_CHANGED' });

      const spentBeforeConcurrentReplacement = (await ai.budget()).spent;
      unblock = () => {};
      const replacementInFlight = replace(2);
      for (let i = 0; i < 100; i++) {
        if ((await replacementStatus()).state === 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal((await replacementStatus()).state, 'running');
      const beforeBusy = calls;
      await assert.rejects(() => replace(2), { code: 'AI_BUSY' });
      const nextId = randomUUID();
      await pool.execute(
        "INSERT INTO messages (id,conversation_id,role,text) VALUES (?,?,'user',?)",
        [nextId, first.conversationId, '接下来的一条消息'],
      );
      unblock!();
      unblock = null;
      assert.equal((await replacementInFlight).error?.code, 'AI_NEWER_MESSAGE');
      assert.equal((await replacementStatus()).message?.version, 2);
      const afterConcurrentReplacement = await ai.budget();
      assert.ok(afterConcurrentReplacement.spent > spentBeforeConcurrentReplacement);
      assert.equal(afterConcurrentReplacement.reserved, 0);
      await assert.rejects(() => replace(2), { code: 'AI_NEWER_MESSAGE' });
      assert.equal(calls, beforeBusy);
      assert.equal((await ai.reply(first.conversationId, nextId, false)).state, 'succeeded');
      const assistantTexts = lastTurns
        .filter(({ role }) => role === 'assistant')
        .map(({ content }) => content);
      assert.deepEqual(assistantTexts, [generatedText]);
      fail = 'AI_UNCERTAIN';
      const nextReplacement = () =>
        ai.reply(first.conversationId, nextId, false, { version: 1, requestId: randomUUID() });
      assert.equal((await nextReplacement()).error?.retryable, false);
      const beforeUncertain = calls;
      fail = '';
      assert.equal((await nextReplacement()).error?.code, 'AI_UNCERTAIN');
      assert.equal(calls, beforeUncertain);
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
