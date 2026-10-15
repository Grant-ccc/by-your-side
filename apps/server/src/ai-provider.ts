import { z } from 'zod';
import { CHARACTER_PROMPT } from './character.js';

export type ChatTurn = { role: 'user' | 'assistant' | 'system'; content: string };
export class AiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export interface AiConfig {
  key: string;
  baseUrl: string;
  model: string;
  monthlyLimit: number;
}
export function aiConfig(): AiConfig {
  const workspace = process.env.DASHSCOPE_WORKSPACE_ID?.trim();
  const baseUrl = (
    process.env.AI_BASE_URL?.trim() ||
    (workspace
      ? `https://${workspace}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1')
  ).replace(/\/$/, '');
  const url = new URL(baseUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !(
      url.hostname === 'dashscope.aliyuncs.com' ||
      /^[a-zA-Z0-9-]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(url.hostname)
    ) ||
    url.pathname !== '/compatible-mode/v1'
  )
    throw new Error('AI_BASE_URL must be an official Beijing endpoint');
  const model = process.env.AI_MODEL || 'qwen3.7-plus';
  if (model !== 'qwen3.7-plus') throw new Error('This cost policy supports qwen3.7-plus only');
  const monthlyLimit = Number(process.env.AI_MONTHLY_LIMIT_CNY || 20);
  if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0 || monthlyLimit > 50)
    throw new Error('AI_MONTHLY_LIMIT_CNY must be greater than zero and at most 50');
  return { key: process.env.DASHSCOPE_API_KEY?.trim() || '', baseUrl, model, monthlyLimit };
}
export const MAX_OUTPUT = 512;
export function context(turns: ChatTurn[], now = new Date()): ChatTurn[] {
  const selected: ChatTurn[] = [];
  let bytes = 0;
  for (const turn of [...turns].reverse()) {
    if (turn.role === 'system') continue;
    const size = Buffer.byteLength(turn.content, 'utf8');
    if (bytes + size > 12000 || selected.length >= 24) break;
    selected.unshift(turn);
    bytes += size;
  }
  // Drop a partial assistant-leading turn when older context has been trimmed.
  while (selected[0]?.role === 'assistant') selected.shift();
  return [
    {
      role: 'system',
      content: `${CHARACTER_PROMPT}\n当前北京时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}。`,
    },
    ...selected,
  ];
}
export function inputBound(turns: ChatTurn[]) {
  // Conservative byte-based bound, not an advertised tokenizer count. Also reserve protocol overhead.
  return turns.reduce((n, t) => n + Buffer.byteLength(t.content, 'utf8') + 32, 256);
}
const Completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().trim().min(1).max(8000) }),
        finish_reason: z.string(),
      }),
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
  }),
});
export interface AiProvider {
  complete(
    turns: ChatTurn[],
  ): Promise<{ text: string; promptTokens: number; completionTokens: number }>;
}
export class QwenProvider implements AiProvider {
  constructor(
    private config: AiConfig,
    private fetcher: typeof fetch = fetch,
  ) {}
  async complete(turns: ChatTurn[]) {
    let response: Response;
    try {
      response = await this.fetcher(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(45000),
        headers: { Authorization: `Bearer ${this.config.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: turns,
          stream: false,
          enable_thinking: false,
          max_completion_tokens: MAX_OUTPUT,
        }),
      });
    } catch {
      throw new AiError(
        'AI_UNCERTAIN',
        '回复请求超时或连接中断，可能已计费。不会自动重复调用，请稍后检查记录。',
      );
    }
    if (!response.ok) {
      // Never return or log provider bodies, which may contain request data or credentials.
      if ([400, 401, 403, 404, 429].includes(response.status))
        throw new AiError(
          response.status === 429 ? 'AI_RATE_LIMIT' : 'AI_CONFIG_ERROR',
          response.status === 429
            ? '模型暂时繁忙，请稍后手动重试。'
            : '模型配置或账户状态需要检查，请在本机核对密钥、地域和额度。',
        );
      throw new AiError('AI_UNCERTAIN', '模型服务暂时异常，调用结果尚不确定，不会自动重试。');
    }
    try {
      const data = Completion.parse(await response.json());
      if (data.choices[0]!.finish_reason !== 'stop') throw new Error('Incomplete response');
      if (
        data.usage.prompt_tokens > inputBound(turns) ||
        data.usage.completion_tokens > MAX_OUTPUT + 10
      )
        throw new Error('Usage exceeded reservation bounds');
      return {
        text: data.choices[0]!.message.content,
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      };
    } catch {
      throw new AiError(
        'AI_UNCERTAIN',
        '模型未返回可确认的完整回复，用量暂按预留上限记账，不会自动重试。',
      );
    }
  }
}
