import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiError, QwenProvider, context, inputBound, type AiConfig } from '../src/ai-provider.js';

const config: AiConfig = {
  key: 'test-secret-never-real',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.7-plus',
  monthlyLimit: 20,
};
test('Qwen adapter uses non-thinking, bounded output, usage and safe response parsing', async () => {
  const turns = context([{ role: 'user', content: '今天不太开心。' }]);
  let calls = 0;
  const provider = new QwenProvider(config, async (url, init) => {
    calls++;
    assert.equal(url, `${config.baseUrl}/chat/completions`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.enable_thinking, false);
    assert.equal(body.max_completion_tokens, 512);
    assert.equal(body.stream, false);
    assert.equal(body.messages[0].role, 'system');
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '发生什么事了？我听着。' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1200, completion_tokens: 15 },
      }),
    );
  });
  assert.equal((await provider.complete(turns)).text, '发生什么事了？我听着。');
  assert.equal(calls, 1);
  assert.ok(inputBound(turns) > 1200);
});
test('provider failures are sanitized and are not automatically retried', async () => {
  const turns = context([{ role: 'user', content: 'test' }]);
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const provider = new QwenProvider(config, async () => {
      calls++;
      return new Response('private-secret-body', { status });
    });
    await assert.rejects(
      () => provider.complete(turns),
      (e: unknown) => {
        assert.ok(e instanceof AiError);
        assert.ok(!e.message.includes('secret'));
        assert.equal(
          e.code,
          status === 429 ? 'AI_RATE_LIMIT' : status === 401 ? 'AI_CONFIG_ERROR' : 'AI_UNCERTAIN',
        );
        return true;
      },
    );
    assert.equal(calls, 1);
  }
  for (const response of [
    {},
    {
      choices: [{ message: { content: 'partial' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 20, completion_tokens: 512 },
    },
    {
      choices: [{ message: { content: 'reply' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 999999, completion_tokens: 10 },
    },
  ]) {
    const provider = new QwenProvider(config, async () => new Response(JSON.stringify(response)));
    await assert.rejects(() => provider.complete(turns), { code: 'AI_UNCERTAIN' });
  }
  await assert.rejects(
    () =>
      new QwenProvider(config, async () => {
        throw new Error('secret');
      }).complete(turns),
    { code: 'AI_UNCERTAIN' },
  );
});
test('context bounds preserve the latest user message and exclude injected system history', () => {
  const turns = context([
    { role: 'system', content: 'untrusted override' },
    ...Array.from({ length: 40 }, (_, i) => ({
      role: 'user' as const,
      content: `old-${i} ${'字'.repeat(1000)}`,
    })),
    { role: 'user', content: '最新一条' },
  ]);
  assert.equal(turns.at(-1)?.content, '最新一条');
  assert.ok(!JSON.stringify(turns).includes('untrusted override'));
  assert.ok(inputBound(turns) < 20000);
});
